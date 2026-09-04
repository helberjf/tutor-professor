"""The switches that let the same code run on one server or on many.

Every one of these has the same shape: the default is what a long-running server
already did, and only an explicit setting (or the platform's own marker) changes
it. That is what keeps the VPS, Docker, local development and the rest of this
suite working while a serverless host gets what it needs.

The tests worth having here are the ones that would fail silently otherwise — a
default that quietly flipped, a lock key that collides across namespaces, a
half-configured object store that swallows audio.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-serverless-"))
DB_PATH = TMP_DIR / "serverless.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"
os.environ["RUNTIME_SYNC_TOKEN"] = "tts-sync-token"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402
from models.database import AppConfig  # noqa: E402
from services.audio_store import build_audio_store  # noqa: E402
from services.rate_limit import SlidingWindowRateLimiter, build_rate_limiter  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def with_env(**values):
    """Set env vars for one block and restore them, including absence."""

    class _Scope:
        def __enter__(self):
            self.previous = {key: os.environ.get(key) for key in values}
            for key, value in values.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        def __exit__(self, *exc):
            for key, value in self.previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            return False

    return _Scope()


def test_startup_schema_work_defaults_to_on() -> None:
    """The gate must never take a schema away from something that had one."""

    with with_env(RUN_STARTUP_MIGRATIONS=None, VERCEL=None):
        require(main._startup_schema_work_enabled(), "the default must be on")

    with with_env(RUN_STARTUP_MIGRATIONS=None, VERCEL="1"):
        require(
            not main._startup_schema_work_enabled(),
            "a serverless host must not run migrations on every cold start",
        )

    with with_env(RUN_STARTUP_MIGRATIONS="true", VERCEL="1"):
        require(
            main._startup_schema_work_enabled(),
            "an explicit opt-in must win over the platform marker",
        )

    with with_env(RUN_STARTUP_MIGRATIONS="false", VERCEL=None):
        require(not main._startup_schema_work_enabled(), "an explicit opt-out must be honoured")


def test_engine_settings_leave_sqlite_alone() -> None:
    sqlite_kwargs = main._engine_kwargs("sqlite:///./x.sqlite")
    require(
        sqlite_kwargs == {"connect_args": {"check_same_thread": False}},
        f"SQLite must keep exactly its old settings, got {sqlite_kwargs}",
    )

    with with_env(DB_POOL_MODE=None):
        pooled = main._engine_kwargs("postgresql://u:p@host/db")
    require("poolclass" not in pooled, "the default Postgres pool is a QueuePool")
    require(pooled["pool_pre_ping"] is True, "a recycled connection must be detected")
    require(
        pooled["connect_args"]["keepalives"] == 1,
        "keepalives matter: a frozen instance leaves a half-open socket behind",
    )
    require(
        pooled["connect_args"]["sslmode"] == "prefer",
        "the default must be prefer: a Postgres on a private network has no TLS, "
        "and requiring it there refuses to connect at all",
    )

    with with_env(DB_POOL_MODE="null"):
        unpooled = main._engine_kwargs("postgresql://u:p@host/db")
    require("poolclass" in unpooled, "DB_POOL_MODE=null must be the escape hatch it claims")


def test_advisory_keys_are_stable_and_namespaced() -> None:
    first = main._advisory_key("lesson_question", 3, 7)
    require(first == main._advisory_key("lesson_question", 3, 7), "the key must be stable")
    require(
        first != main._advisory_key("topic_question", 3, 7),
        "two namespaces with the same ids must not share a lock",
    )
    require(
        main._advisory_key("topic_question", 7) != main._advisory_key("lesson_question", 7),
        "lesson 7 and topic 7 must not collide",
    )
    # Must fit in a signed bigint or PostgreSQL rejects it.
    require(-(2**63) <= first < 2**63, f"key out of bigint range: {first}")


def test_rate_limiter_stays_in_process_on_sqlite() -> None:
    limiter = build_rate_limiter(main.engine)
    require(
        isinstance(limiter, SlidingWindowRateLimiter),
        f"SQLite must keep the in-process limiter, got {type(limiter).__name__}",
    )


def test_audio_store_is_off_unless_fully_configured() -> None:
    with with_env(SUPABASE_URL=None, SUPABASE_SERVICE_ROLE_KEY=None, AUDIO_BUCKET=None):
        require(build_audio_store() is None, "no configuration means no store")

    # Half-configured must stay off: a store that silently swallowed audio would
    # be worse than no store.
    with with_env(
        SUPABASE_URL="https://x.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY=None,
        AUDIO_BUCKET="audio-cache",
    ):
        require(build_audio_store() is None, "a missing key must not half-enable the store")

    with with_env(
        SUPABASE_URL="https://x.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="service-key",
        AUDIO_BUCKET="audio-cache",
    ):
        require(build_audio_store() is not None, "all three present must enable it")


def test_audio_url_never_points_at_a_file_that_may_not_be_there() -> None:
    """A store URL is only used when this instance has no local copy.

    Signing succeeds whether or not the object exists, so a signed URL is no
    proof that an upload worked. Returning one for a file we just wrote locally
    would hand the browser a dead link whenever an upload had failed; returning
    the local link instead cannot, because the route falls back to the store on
    a miss anyway.
    """

    import types

    calls: list[str] = []

    class SigningStore:
        def signed_url(self, filename: str, ttl: int) -> str:
            calls.append(filename)
            return f"https://storage.example.com/{filename}"

    original_store = main.audio_store
    main.audio_store = SigningStore()
    try:
        present = main.audio_cache_dir / "present.mp3"
        main.audio_cache_dir.mkdir(parents=True, exist_ok=True)
        present.write_bytes(b"local audio")

        local_url = main.build_audio_url(str(present))
        require(
            local_url.startswith("/api/audio/file/") and not calls,
            f"a file that is here must be served from here, got {local_url}",
        )

        missing_url = main.build_audio_url(str(main.audio_cache_dir / "absent.mp3"))
        require(
            missing_url.startswith("https://storage.example.com/"),
            f"a file that is not here must come from the store, got {missing_url}",
        )
    finally:
        main.audio_store = original_store


def test_kokoro_url_prefers_a_static_setting() -> None:
    with with_env(KOKORO_URL="https://kokoro.example.com/v1/audio/speech"):
        require(
            main.resolve_kokoro_url() == "https://kokoro.example.com/v1/audio/speech",
            "a fixed address must short-circuit the config row entirely",
        )


def test_generation_budget_defaults_match_the_old_behaviour() -> None:
    require(
        main.MAX_LESSONS_PER_REQUEST == 10,
        "the default ceiling must stay what a long-running server always allowed",
    )
    require(main.REQUEST_TIME_BUDGET_SECONDS >= 600, "the default budget must not constrain a server")


async def run_publisher_checks() -> None:
    main.on_startup()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app), base_url="http://testserver"
    ) as client:
        url = "https://tunnel.example.com/v1/audio/speech"

        no_token = await client.post("/api/runtime/tts-backend", json={"base_url": url})
        require(no_token.status_code == 401, f"no token must be refused, got {no_token.status_code}")

        wrong = await client.post(
            "/api/runtime/tts-backend",
            json={"base_url": url},
            headers={"Authorization": "Bearer not-the-token"},
        )
        require(wrong.status_code == 401, f"a wrong token must be refused, got {wrong.status_code}")

        headers = {"Authorization": "Bearer tts-sync-token"}
        insecure = await client.post(
            "/api/runtime/tts-backend",
            json={"base_url": "http://tunnel.example.com/v1/audio/speech"},
            headers=headers,
        )
        require(
            insecure.status_code == 422,
            f"plain http must be refused: the shared secret travels with it, got {insecure.status_code}",
        )

        ok = await client.post("/api/runtime/tts-backend", json={"base_url": url}, headers=headers)
        require(ok.status_code == 204, f"a valid publish must be accepted, got {ok.status_code}")

    with Session(main.engine) as session:
        row = session.get(AppConfig, main.KOKORO_URL_CONFIG_KEY)
        require(row is not None and row.value == url, "the address must be stored")

    # With no static override, the resolver reads what was just published.
    with with_env(KOKORO_URL=None):
        require(
            main.resolve_kokoro_url(force_refresh=True) == url,
            "the resolver must return the published address",
        )


def main_entry() -> None:
    test_startup_schema_work_defaults_to_on()
    test_engine_settings_leave_sqlite_alone()
    test_advisory_keys_are_stable_and_namespaced()
    test_rate_limiter_stays_in_process_on_sqlite()
    test_audio_store_is_off_unless_fully_configured()
    test_audio_url_never_points_at_a_file_that_may_not_be_there()
    test_kokoro_url_prefers_a_static_setting()
    test_generation_budget_defaults_match_the_old_behaviour()
    asyncio.run(run_publisher_checks())
    print("serverless readiness: ok")


if __name__ == "__main__":
    main_entry()
