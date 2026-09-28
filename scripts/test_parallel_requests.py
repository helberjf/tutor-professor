"""A long-running server has to keep answering while requests run in parallel.

One uvicorn process serves every request from a single event loop; sync routes
run in its threadpool, but it is the loop that hands a finished route its
response, closes its session and gives its connection back to the pool. So
nothing on the loop may wait for the database. Three things used to:

- the access log, the module gate and the rate limiter each looked the account
  up with a session of their own, inside async middleware, on the loop;
- the two gates did it through the helper the routes use, which stamps
  last_seen_at, so they sent an UPDATE for the caller's session row and waited
  on the lock of any route of the same account still holding that row;
- /api/chat, /api/audio/speak and the billing webhook are async routes and ran
  their queries on the loop too; speak held the same row across the synthesis.

Waiting on a lock or a pooled connection that only the loop can release stops
the whole server: for pool_timeout on a small pool (parallel requests 20-30 s
late, many of them 500s), and for good on PostgreSQL, which has no lock timeout
by default — /health included.

These checks pin the fix: no database work on the event loop, one account lookup
per request however many middlewares want it, gates that never write, and a
burst of parallel requests through a pool as small as a serverless one that
finishes without anybody waiting the pool out.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-parallel-"))
DB_PATH = TMP_DIR / "parallel.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["BILLING_WEBHOOK_SECRET"] = "test-webhook-secret"
# The burst below makes dozens of AI-shaped calls; the limit itself is checked
# separately, with a rule of its own.
os.environ["AI_RATE_LIMIT"] = "100000"
os.environ["AUTH_RATE_LIMIT"] = "500"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlmodel import Session, create_engine, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402
from models.database import User  # noqa: E402
from services.rate_limit import RateLimitRule  # noqa: E402


EMAIL = "paralelo@example.com"
PASSWORD = "Senha@Forte123"
CPF = "52998224725"

# The routes a dashboard load fires together, plus one behind each gate: a
# module route, and the two async routes that also count as AI calls.
BURST: tuple[tuple[str, str, dict | None], ...] = (
    ("GET", "/api/auth/me", None),
    ("GET", "/api/parent/children", None),
    ("GET", "/api/parent/progress", None),
    ("GET", "/api/objectives", None),
    ("GET", "/api/study/dashboard", None),
    ("GET", "/api/study/resume", None),
    ("GET", "/api/study-log", None),
    ("GET", "/api/exams", None),
    ("POST", "/api/audio/speak", {"text": "hello"}),
    ("POST", "/api/chat", {"message": "hello", "history": []}),
)
WORKERS = 8
ROUNDS = 3
# What a serverless instance gets (1 + 2). A request stuck behind the event loop
# waits out the whole pool timeout, so the slowest request tells a stall from a
# queue: queueing for a connection here takes a second or two at most.
SMALL_POOL = {"pool_size": 1, "max_overflow": 2, "pool_timeout": 10}
# SQLite locks the whole file for a write and every route stamps last_seen_at, so
# the burst takes turns at that lock. Waiting for it in a worker thread is fine;
# the default 5 s before "database is locked" is just too short for a slow runner.
SQLITE_BUSY_TIMEOUT_SECONDS = 30
# The fixed server does the whole burst in seconds. The old one took seven
# minutes, a pool timeout at a time; this is where a regression stops.
BURST_DEADLINE_SECONDS = 60


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def new_client(*, raise_app_exceptions: bool = True) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(
            app=main.app, raise_app_exceptions=raise_app_exceptions
        ),
        base_url="http://testserver",
    )


def signed_webhook(payload: dict) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(payload).encode("utf-8")
    secret = os.environ["BILLING_WEBHOOK_SECRET"].encode("utf-8")
    signature = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return body, {"x-webhook-signature": signature, "content-type": "application/json"}


def on_event_loop_thread() -> bool:
    """True inside the loop's own thread, including sync code a coroutine calls."""

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    return True


class DatabaseWatch:
    """Every checkout and statement on an engine, and which of them ran on the loop."""

    def __init__(self, engine) -> None:
        self.engine = engine
        self.recording = False
        self.statements: list[str] = []
        self.on_loop: list[str] = []
        event.listen(engine, "checkout", self._checkout)
        event.listen(engine, "before_cursor_execute", self._execute)

    def close(self) -> None:
        event.remove(self.engine, "checkout", self._checkout)
        event.remove(self.engine, "before_cursor_execute", self._execute)

    def reset(self) -> None:
        self.statements.clear()
        self.on_loop.clear()

    def _checkout(self, dbapi_connection, connection_record, connection_proxy) -> None:
        if self.recording and on_event_loop_thread():
            self.on_loop.append("pool checkout")

    def _execute(self, conn, cursor, statement, parameters, context, executemany) -> None:
        if not self.recording:
            return
        compact = " ".join(statement.split())
        self.statements.append(compact)
        if on_event_loop_thread():
            self.on_loop.append(compact[:140])


async def sign_in(client: httpx.AsyncClient) -> int:
    assert_status(
        await client.post(
            "/api/auth/register",
            json={
                "first_name": "Pai",
                "last_name": "Paralelo",
                "email": EMAIL,
                "cpf": CPF,
                "password": PASSWORD,
                "child_name": "Lia",
            },
        ),
        201,
        "register",
    )
    await asyncio.to_thread(approve_all_accounts, main)
    assert_status(
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}),
        200,
        "login",
    )

    def account_id() -> int:
        with Session(main.engine) as db:
            user = db.exec(select(User).where(User.email == EMAIL)).one()
            return int(user.id)

    return await asyncio.to_thread(account_id)


async def check_no_database_work_on_the_event_loop(client: httpx.AsyncClient) -> None:
    body, headers = signed_webhook(
        {"id": "evt_parallel_1", "type": "payment.succeeded", "data": {"customer_email": "x@example.com"}}
    )
    requests_to_make = (
        *BURST,
        # Refused by the module gate itself: programming ships switched off.
        ("GET", "/api/coding/subjects", None),
    )

    watch = DatabaseWatch(main.engine)
    watch.recording = True
    try:
        for method, path, payload in requests_to_make:
            response = await client.request(method, path, json=payload)
            expected = 403 if path.startswith("/api/coding/") else 200
            assert_status(response, expected, f"{method} {path}")
        webhook = await client.post("/api/billing/webhook", content=body, headers=headers)
        assert_status(webhook, 202, "billing webhook")
    finally:
        watch.recording = False
        watch.close()

    require(watch.statements, "the watch saw no statements at all; it is not attached")
    require(
        not watch.on_loop,
        "database work ran on the event loop, where it stalls every other request:\n  "
        + "\n  ".join(watch.on_loop),
    )


async def check_gates_never_write(client: httpx.AsyncClient) -> None:
    """A request the module gate refuses reaches no route, so any write is the gate's."""

    watch = DatabaseWatch(main.engine)
    watch.recording = True
    try:
        assert_status(await client.get("/api/coding/subjects"), 403, "coding while it is off")
    finally:
        watch.recording = False
        watch.close()

    writes = [
        statement
        for statement in watch.statements
        if statement.split(" ", 1)[0].upper() in {"UPDATE", "INSERT", "DELETE"}
    ]
    require(
        not writes,
        "the middlewares must only read; a write takes a row lock that a route of the "
        "same account may be holding:\n  " + "\n  ".join(writes),
    )


async def check_one_account_lookup_per_request(client: httpx.AsyncClient) -> None:
    calls: list[str] = []
    original = main._lookup_request_account

    def counting(token: str):
        calls.append(token)
        return original(token)

    main._lookup_request_account = counting
    try:
        cases = (
            # access log only
            ("GET", "/api/auth/me", None),
            # access log + module gate
            ("GET", "/api/exams", None),
            # access log + rate limiter
            ("POST", "/api/audio/speak", {"text": "hello"}),
            # all three: a module route that is also an AI call. The body is
            # invalid on purpose — the route answers 422 before doing any work,
            # after every middleware has run.
            ("POST", "/api/study/diverse/questions/generate", {"unexpected": True}),
        )
        for method, path, payload in cases:
            calls.clear()
            await client.request(method, path, json=payload)
            require(
                len(calls) == 1,
                f"{method} {path} looked the account up {len(calls)} times; the "
                "middlewares must share one lookup",
            )

        async with new_client() as anonymous:
            calls.clear()
            assert_status(await anonymous.get("/api/auth/me"), 401, "signed-out /api/auth/me")
            require(not calls, "a request without a session token must not touch the database")
    finally:
        main._lookup_request_account = original


async def check_rate_limit_still_counts_per_account(client: httpx.AsyncClient, user_id: int) -> None:
    original = main.AI_RATE_RULE
    main.AI_RATE_RULE = RateLimitRule(name="ai-parallel-test", limit=2, window_seconds=60)
    try:
        for attempt in (1, 2):
            assert_status(
                await client.post("/api/audio/speak", json={"text": "hello"}),
                200,
                f"AI call {attempt} of 2",
            )
        refused = await client.post("/api/audio/speak", json={"text": "hello"})
        assert_status(refused, 429, "the AI call past the limit")
        require(
            int(refused.headers.get("retry-after", "0")) >= 1,
            f"a 429 must say when to come back, got {dict(refused.headers)}",
        )
        buckets = getattr(main.rate_limiter, "_hits", {})
        require(
            ("ai-parallel-test", f"user:{user_id}") in buckets,
            f"AI calls must be counted per account, got buckets {sorted(buckets)}",
        )
    finally:
        main.AI_RATE_RULE = original


async def check_parallel_burst_through_a_small_pool() -> None:
    small = create_engine(
        os.environ["DATABASE_URL"],
        connect_args={"check_same_thread": False, "timeout": SQLITE_BUSY_TIMEOUT_SECONDS},
        **SMALL_POOL,
    )
    original = main.engine
    main.engine = small
    results: list[tuple[str, int, float]] = []
    try:
        # Errors come back as 500 responses rather than exceptions, so one
        # stalled request cannot hide what happened to the others.
        async with new_client(raise_app_exceptions=False) as client:
            assert_status(
                await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}),
                200,
                "login for the burst",
            )

            async def worker() -> None:
                for _ in range(ROUNDS):
                    for method, path, payload in BURST:
                        started = time.perf_counter()
                        response = await client.request(method, path, json=payload)
                        results.append((f"{method} {path}", response.status_code, time.perf_counter() - started))

            started = time.perf_counter()
            try:
                await asyncio.wait_for(
                    asyncio.gather(*(worker() for _ in range(WORKERS))),
                    timeout=BURST_DEADLINE_SECONDS,
                )
            except asyncio.TimeoutError:
                raise AssertionError(
                    f"{WORKERS * ROUNDS * len(BURST)} requests did not finish in "
                    f"{BURST_DEADLINE_SECONDS}s ({len(results)} did); something waits on the event loop"
                ) from None
            elapsed = time.perf_counter() - started
    finally:
        main.engine = original
        small.dispose()

    failures = [result for result in results if result[1] != 200]
    slowest = max(results, key=lambda result: result[2])
    print(
        f"  burst: {len(results)} requests from {WORKERS} workers through a "
        f"{SMALL_POOL['pool_size']}+{SMALL_POOL['max_overflow']} pool in {elapsed:.2f}s; "
        f"slowest {slowest[0]} {slowest[2]:.2f}s; {len(failures)} not 200"
    )
    require(
        not failures,
        "parallel requests failed:\n  "
        + "\n  ".join(f"{label} -> {status} after {seconds:.2f}s" for label, status, seconds in failures[:12]),
    )
    # A request that waited the pool out was stuck behind the event loop, not
    # queueing for a connection or for SQLite's write lock.
    require(
        slowest[2] < SMALL_POOL["pool_timeout"] / 2,
        f"{slowest[0]} took {slowest[2]:.2f}s with a {SMALL_POOL['pool_timeout']}s pool timeout; "
        "something waited on the event loop",
    )


async def run_checks() -> None:
    main.on_startup()
    async with new_client() as client:
        user_id = await sign_in(client)
        await check_no_database_work_on_the_event_loop(client)
        await check_gates_never_write(client)
        await check_one_account_lookup_per_request(client)
        await check_rate_limit_still_counts_per_account(client, user_id)
    await check_parallel_burst_through_a_small_pool()


def main_entry() -> None:
    asyncio.run(run_checks())
    print("parallel requests: ok")


if __name__ == "__main__":
    main_entry()
