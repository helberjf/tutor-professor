"""Structured request logs.

"The app is slow" and "a user says generation failed" are unanswerable without
knowing which account, which route, and how long. One JSON line per request
makes both greppable, and the account id is what turns a support message into a
query instead of a guess.

LOG_FORMAT=json emits one object per line, for a log shipper. Anything else
keeps the readable text format, which is what a person tailing a terminal wants.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from dataclasses import asdict, dataclass


@dataclass
class RequestLogEntry:
    request_id: str
    method: str
    path: str
    status: int
    duration_ms: int
    account_id: int | None = None
    client: str = ""


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
        }
        entry = getattr(record, "request", None)
        if isinstance(entry, RequestLogEntry):
            payload.update(asdict(entry))
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """Install the chosen format on the root handler.

    Called once at import. Uvicorn installs its own handlers for its own
    loggers; this covers the application's.
    """

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    # stderr, which is where Python's logging writes by default and where the
    # boot-time warnings were already expected. Docker captures both streams.
    handler = logging.StreamHandler(sys.stderr)
    if os.getenv("LOG_FORMAT", "text").strip().lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


def new_request_id() -> str:
    return uuid.uuid4().hex[:16]


class Stopwatch:
    def __init__(self) -> None:
        self._started = time.perf_counter()

    @property
    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self._started) * 1000)
