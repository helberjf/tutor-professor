"""Two accounts must never see each other's data — proved, not assumed.

Three separate guarantees are checked here:

1. A request with no session reaches nothing. The app used to fall back to the
   shared child row (user_id IS NULL) for anybody who showed up without a
   cookie, which for a hosted product is one bucket every visitor writes to.
2. Account A cannot reach account B's child by asking for it, whatever it sends
   in X-Child-ID.
3. Every data route resolves its tenant through one of the approved helpers.
   This is the guard that survives new features: adding a route that queries by
   an id from the URL without scoping it turns this test red, instead of
   shipping and leaking quietly.
"""
from __future__ import annotations

import asyncio
import inspect
import os
import re
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-tenancy-"))
DB_PATH = TMP_DIR / "tenancy.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"
# The point of the suite: the guest fallback stays off, as it is in production.
os.environ.pop("ALLOW_GUEST_ACCESS", None)
# Registration is rate limited; this suite registers a handful of accounts.
os.environ["AUTH_RATE_LIMIT"] = "500"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402


PASSWORD = "Senha@Forte123"
PARENT_A = ("a@example.com", "52998224725", "Ana")
PARENT_B = ("b@example.com", "39053344705", "Bruno")

# Routes that legitimately answer without resolving a child: they are about the
# account, the catalogue of providers, or the service itself.
TENANT_FREE_ROUTES = {
    "/health",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/auth/google/start",
    "/api/auth/google/callback",
    "/api/auth/email/resend",
    "/api/auth/email/verify",
    "/api/auth/password/forgot",
    "/api/auth/password/reset",
    "/api/account/modules",
    "/api/account/password",
    "/api/account/sessions/revoke",
    "/api/account/export",
    "/api/account/delete",
    "/api/parent/login",
    "/api/parent/logout",
    "/api/parent/children",
    "/api/parent/progress",
    "/api/ai/providers",
    "/api/ai/credits",
    "/api/ai/settings",
    "/api/user/ai-settings",
    "/api/audio/file/{filename}",
    "/api/billing/plans",
    "/api/billing/webhook",
    "/api/runtime/tts-backend",
    "/api/billing/subscription",
    "/api/billing/checkout",
}

# Any one of these in a route body means the route resolved its own tenant.
TENANT_RESOLVERS = (
    "get_requested_child",
    "get_child_id_from_session",
    "require_parent_session",
    "require_admin",
    "get_request_user",
    "_require_owned_subject",
    "_topic_for_child",
    "_require_exam",
    "_require_attempt",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def route_source(endpoint, depth: int = 2) -> str:
    """The route body plus the bodies of the helpers it calls.

    A route is allowed to delegate its check — several admin routes hand the
    whole job to a shared helper — so reading only the route body would report
    them as unguarded. Two levels is enough for the shapes in this codebase and
    stops the walk from wandering into the whole module.
    """

    try:
        source = inspect.getsource(endpoint)
    except (OSError, TypeError):  # pragma: no cover - defensive
        return ""
    if depth <= 0:
        return source

    collected = [source]
    for name in set(re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", source)):
        helper = getattr(main, name, None)
        if helper is None or helper is endpoint or not inspect.isfunction(helper):
            continue
        if getattr(helper, "__module__", "") != "main":
            continue
        collected.append(route_source(helper, depth - 1))
    return "\n".join(collected)


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app),
        base_url="http://testserver",
    )


async def register(client: httpx.AsyncClient, parent: tuple[str, str, str]) -> None:
    email, cpf, child_name = parent
    assert_status(
        await client.post(
            "/api/auth/register",
            json={
                "first_name": child_name,
                "last_name": "Teste",
                "email": email,
                "cpf": cpf,
                "password": PASSWORD,
                "child_name": child_name,
            },
        ),
        201,
        f"register {email}",
    )


async def login(client: httpx.AsyncClient, email: str) -> None:
    assert_status(
        await client.post("/api/auth/login", json={"email": email, "password": PASSWORD}),
        200,
        f"login {email}",
    )


def test_every_data_route_resolves_a_tenant() -> None:
    """Static audit: no data route may skip tenant resolution."""

    offenders: list[str] = []
    for route in main.app.routes:
        path = getattr(route, "path", "")
        endpoint = getattr(route, "endpoint", None)
        if not path.startswith("/api") or endpoint is None:
            continue
        if path in TENANT_FREE_ROUTES or path.startswith("/api/admin"):
            continue
        source = route_source(endpoint)
        if not any(resolver in source for resolver in TENANT_RESOLVERS):
            offenders.append(f"{path} -> {endpoint.__name__}")

    require(
        not offenders,
        "these routes never resolve a tenant, so they answer with whatever id was "
        "asked for:\n  " + "\n  ".join(sorted(offenders)),
    )


def test_admin_routes_are_behind_the_admin_check() -> None:
    offenders: list[str] = []
    for route in main.app.routes:
        path = getattr(route, "path", "")
        endpoint = getattr(route, "endpoint", None)
        if not path.startswith("/api/admin") or endpoint is None:
            continue
        source = route_source(endpoint)
        if "require_admin" not in source and "user_is_admin" not in source:
            offenders.append(f"{path} -> {endpoint.__name__}")
    require(not offenders, "admin routes without an admin check:\n  " + "\n  ".join(offenders))


async def run_http_checks() -> None:
    main.on_startup()
    async with new_client() as anonymous:
        await register(anonymous, PARENT_A)
        await register(anonymous, PARENT_B)
        approve_all_accounts(main)

        # 1. No session, no data — and no shared child conjured up on the way.
        for path in ("/api/lessons", "/api/progress", "/api/parent/children", "/api/review"):
            response = await anonymous.get(path)
            require(
                response.status_code == 401,
                f"{path} answered {response.status_code} without a session; expected 401",
            )

    async with new_client() as client_a, new_client() as client_b:
        await login(client_a, PARENT_A[0])
        await login(client_b, PARENT_B[0])

        children_a = (await client_a.get("/api/parent/children")).json()
        children_b = (await client_b.get("/api/parent/children")).json()
        require(len(children_a) == 1 and len(children_b) == 1, "each account starts with one child")
        child_a, child_b = children_a[0]["id"], children_b[0]["id"]
        require(child_a != child_b, "the two accounts must not share a child row")

        # 2. Asking for the other family's child is a 404, not a peek.
        for path in ("/api/progress", "/api/lessons", "/api/parent/settings", "/api/child/level"):
            response = await client_a.get(path, headers={"X-Child-ID": str(child_b)})
            require(
                response.status_code == 404,
                f"A reached B's child through {path}: {response.status_code} {response.text}",
            )

        # And the id it does own still works, so the check is not just refusing
        # everything.
        assert_status(
            await client_a.get("/api/progress", headers={"X-Child-ID": str(child_a)}),
            200,
            "A reads its own child",
        )

        # 3. A malformed header is rejected outright rather than falling back.
        response = await client_a.get("/api/progress", headers={"X-Child-ID": "not-a-number"})
        require(response.status_code == 400, f"expected 400 for a junk X-Child-ID, got {response.status_code}")


def test_guest_fallback_is_off_by_default() -> None:
    require(
        main.ALLOW_GUEST_ACCESS is False,
        "ALLOW_GUEST_ACCESS must default to off: on means every signed-out "
        "visitor shares one child profile",
    )


def test_no_route_source_selects_a_child_by_raw_header() -> None:
    """The X-Child-ID header may only be read by the one helper that checks it."""

    source = (API_DIR / "main.py").read_text(encoding="utf-8")
    readers = re.findall(r'headers\.get\(\s*"x-child-id"', source, re.IGNORECASE)
    require(
        len(readers) == 1,
        f"x-child-id is read in {len(readers)} places; ownership is checked in only one",
    )


def main_entry() -> None:
    test_guest_fallback_is_off_by_default()
    test_every_data_route_resolves_a_tenant()
    test_admin_routes_are_behind_the_admin_check()
    test_no_route_source_selects_a_child_by_raw_header()
    asyncio.run(run_http_checks())
    print("tenant isolation: ok")


if __name__ == "__main__":
    main_entry()
