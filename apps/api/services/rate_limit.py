"""Rate limiting, in two flavours.

The login lock already slows down guessing at one account. This covers the rest:
somebody registering accounts in a loop, or one account calling the generation
endpoints fast enough to spend the whole AI budget in an afternoon.

`SlidingWindowRateLimiter` keeps its counters in process memory. That is exact
while a single process serves the app — local development, Docker, the test
suite — and worthless the moment there are several, because each one would keep
its own window and the effective ceiling would multiply.

`PostgresWindowRateLimiter` keeps them in a table every instance can see, which
is what makes the limit mean the same thing whether one instance is serving or
twenty. `build_rate_limiter` chooses from the engine's dialect, so nothing that
calls `check()` has to know which one it got, and `describe_backend()` says out
loud which is in use so the deployment notes cannot drift from reality.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)


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


class PostgresWindowRateLimiter:
    """The same limit, counted in a table every instance can see.

    Uses the sliding-window-counter approximation rather than a plain fixed
    window: a fixed window lets somebody spend the whole allowance at the end of
    one window and again at the start of the next, so the real ceiling would be
    twice the configured one. Weighting the previous bucket by how much of it is
    still in view costs nothing extra — both buckets come back from a single
    statement — and keeps the number honest.

    `now` is epoch seconds here, not the monotonic clock the in-process version
    uses: a monotonic clock is per-process and means nothing to another instance.
    """

    def __init__(self, bind) -> None:
        self._bind = bind
        self._writes_since_prune = 0

    def check(self, rule: RateLimitRule, key: str, *, now: float | None = None) -> RateLimitVerdict:
        if rule.limit <= 0:
            return RateLimitVerdict(allowed=True)

        moment = time.time() if now is None else now
        window = rule.window_seconds
        window_start = int(moment // window) * window
        previous_start = window_start - window
        elapsed = moment - window_start
        # How much of the previous bucket is still inside the trailing window.
        previous_weight = max(0.0, 1.0 - (elapsed / window))

        try:
            current_hits, previous_hits = self._record_hit(
                rule_name=rule.name,
                subject=key,
                window_start=window_start,
                previous_start=previous_start,
                expires_at=datetime.utcfromtimestamp(moment + window * 2),
            )
        except SQLAlchemyError:
            # A limiter that fails closed would take the whole app down with the
            # database it depends on. Letting the request through is the lesser
            # harm, and the login lock and plan credits are still in the way.
            logger.exception("Rate limit check failed; allowing the request")
            return RateLimitVerdict(allowed=True)

        weighted = previous_hits * previous_weight + current_hits
        if weighted > rule.limit:
            return RateLimitVerdict(
                allowed=False,
                retry_after_seconds=max(1, int(window - elapsed) + 1),
            )
        return RateLimitVerdict(allowed=True)

    def _record_hit(
        self,
        *,
        rule_name: str,
        subject: str,
        window_start: int,
        previous_start: int,
        expires_at: datetime,
    ) -> tuple[int, int]:
        """Count this request and read the previous bucket, in one round trip.

        Its own transaction, not the request's: the counter has to stick even
        when the request fails afterwards, or a caller gets unlimited retries by
        making each one error.
        """

        statement = text(
            """
            WITH upsert AS (
                INSERT INTO ratelimitcounter (rule, subject, window_start, hits, expires_at)
                VALUES (:rule, :subject, :window_start, 1, :expires_at)
                ON CONFLICT (rule, subject, window_start)
                DO UPDATE SET hits = ratelimitcounter.hits + 1,
                              expires_at = EXCLUDED.expires_at
                RETURNING hits
            )
            SELECT
                (SELECT hits FROM upsert) AS current_hits,
                COALESCE((
                    SELECT hits FROM ratelimitcounter
                    WHERE rule = :rule AND subject = :subject AND window_start = :previous_start
                ), 0) AS previous_hits
            """
        )
        with self._bind.begin() as connection:
            row = connection.execute(
                statement,
                {
                    "rule": rule_name,
                    "subject": subject[:200],
                    "window_start": window_start,
                    "previous_start": previous_start,
                    "expires_at": expires_at,
                },
            ).one()
        self._maybe_prune()
        return int(row[0]), int(row[1])

    def _maybe_prune(self) -> None:
        """Drop expired buckets now and then, so the table does not just grow."""

        self._writes_since_prune += 1
        if self._writes_since_prune < int(os.getenv("RATE_LIMIT_PRUNE_EVERY", "500")):
            return
        self._writes_since_prune = 0
        try:
            self.prune()
        except SQLAlchemyError:
            logger.exception("Rate limit prune failed")

    def prune(self, *, now: float | None = None, max_window_seconds: int = 3600) -> None:
        cutoff = datetime.utcfromtimestamp(time.time() if now is None else now)
        with self._bind.begin() as connection:
            connection.execute(
                text("DELETE FROM ratelimitcounter WHERE expires_at < :cutoff"),
                {"cutoff": cutoff},
            )

    def reset(self) -> None:
        with self._bind.begin() as connection:
            connection.execute(text("DELETE FROM ratelimitcounter"))


def build_rate_limiter(bind):
    """The shared limiter on Postgres, the in-process one everywhere else."""

    if getattr(getattr(bind, "dialect", None), "name", "") == "postgresql":
        return PostgresWindowRateLimiter(bind)
    return SlidingWindowRateLimiter()


def describe_backend(limiter=None) -> str:
    if isinstance(limiter, PostgresWindowRateLimiter):
        return "shared PostgreSQL counters (correct across instances)"
    return (
        "in-process sliding window (per uvicorn worker; correct only while a "
        "single process serves the app)"
    )
