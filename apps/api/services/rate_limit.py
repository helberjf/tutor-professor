"""A small sliding-window rate limiter kept in process memory.

The login lock already slows down guessing at one account. This covers the rest:
somebody registering accounts in a loop, or one account calling the generation
endpoints fast enough to spend the whole AI budget in an afternoon.

In-process is a deliberate limit, not an oversight. It needs no Redis and no new
container to run, and the deployment is a single uvicorn process today, so the
counters are exact. If the API is ever scaled to several workers each worker
keeps its own window and the effective ceiling multiplies by the worker count —
at which point this should move to a shared store. `describe_backend()` says as
much out loud so the deployment notes cannot silently drift from reality.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int


@dataclass(frozen=True)
class RateLimitVerdict:
    allowed: bool
    retry_after_seconds: int = 0


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._guard = threading.Lock()

    def check(self, rule: RateLimitRule, key: str, *, now: float | None = None) -> RateLimitVerdict:
        """Record one hit and say whether it is allowed."""

        if rule.limit <= 0:
            return RateLimitVerdict(allowed=True)
        moment = time.monotonic() if now is None else now
        cutoff = moment - rule.window_seconds
        bucket_key = (rule.name, key)

        with self._guard:
            bucket = self._hits.setdefault(bucket_key, deque())
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= rule.limit:
                retry_after = max(1, int(bucket[0] + rule.window_seconds - moment) + 1)
                return RateLimitVerdict(allowed=False, retry_after_seconds=retry_after)
            bucket.append(moment)
            if not bucket:
                self._hits.pop(bucket_key, None)
            return RateLimitVerdict(allowed=True)

    def reset(self) -> None:
        with self._guard:
            self._hits.clear()

    def prune(self, *, now: float | None = None, max_window_seconds: int = 3600) -> None:
        """Drop buckets nobody has touched for a full window.

        Without this the dict grows one entry per IP seen, forever.
        """

        moment = time.monotonic() if now is None else now
        with self._guard:
            for bucket_key in list(self._hits):
                bucket = self._hits[bucket_key]
                while bucket and bucket[0] <= moment - max_window_seconds:
                    bucket.popleft()
                if not bucket:
                    self._hits.pop(bucket_key, None)


def describe_backend() -> str:
    return (
        "in-process sliding window (per uvicorn worker; move to a shared store "
        "before running more than one worker)"
    )
