"""Optional modules: programming is off until the account asks for it.

The gate lives in one middleware rather than in every coding endpoint, so what
matters is that a whole route family is closed, that switching it on in the
settings opens it, and that the switch cannot be used to turn the product off.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-modules-"))
DB_PATH = TMP_DIR / "modules.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"
os.environ["PARENT_COOKIE_SECURE"] = "false"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402


EMAIL = "modulos@example.com"
PASSWORD = "Senha@Forte123"
CPF = "52998224725"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def test_defaults_keep_programming_out_of_the_way() -> None:
    from services.modules import resolve_modules

    defaults = resolve_modules(None)
    require(defaults["coding"] is False, "programming must ship switched off")
    require(defaults["language"] is True, "the language module is the product")


def test_locked_module_cannot_be_switched_off() -> None:
    from services.modules import apply_module_changes

    try:
        apply_module_changes({}, {"language": False})
    except ValueError:
        pass
    else:
        raise AssertionError("switching off the language module should be refused")

    try:
        apply_module_changes({}, {"quantum-physics": True})
    except ValueError:
        pass
    else:
        raise AssertionError("an unknown module should be refused")


def test_unknown_keys_from_storage_are_ignored() -> None:
    from services.modules import resolve_modules

    resolved = resolve_modules({"coding": True, "legacy-thing": True})
    require(resolved["coding"] is True, "a stored choice must win over the default")
    require("legacy-thing" not in resolved, "unknown stored keys must not be trusted")


async def run_http_checks() -> None:
    main.on_startup()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app), base_url="http://testserver"
    ) as client:
        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": EMAIL,
                    "cpf": CPF,
                    "password": PASSWORD,
                    "child_name": "Lia",
                },
            ),
            201,
            "register",
        )
        approve_all_accounts(main)
        assert_status(
            await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}),
            200,
            "login",
        )

        me = (await client.get("/api/auth/me")).json()
        require(me["modules"]["coding"] is False, f"expected coding off for a new account, got {me}")

        # The whole route family is closed, not just the first endpoint.
        for path in ("/api/coding/subjects", "/api/coding/review", "/api/coding/leetcode"):
            response = await client.get(path)
            assert_status(response, 403, f"{path} while the module is off")
            require(
                response.json().get("module") == "coding",
                f"{path} should name the module that is off, got {response.text}",
            )

        # A module that is on keeps working.
        assert_status(await client.get("/api/lessons"), 200, "language module stays open")

        listing = await client.get("/api/account/modules")
        assert_status(listing, 200, "list modules")
        by_id = {module["id"]: module for module in listing.json()["modules"]}
        require(by_id["coding"]["enabled"] is False, "coding listed as off")
        require(by_id["language"]["locked"] is True, "language listed as locked")

        assert_status(
            await client.put("/api/account/modules", json={"modules": {"language": False}}),
            422,
            "refuse to switch off a locked module",
        )
        assert_status(
            await client.put("/api/account/modules", json={"modules": {"nope": True}}),
            422,
            "refuse an unknown module",
        )

        assert_status(
            await client.put("/api/account/modules", json={"modules": {"coding": True}}),
            200,
            "switch coding on",
        )
        assert_status(await client.get("/api/coding/subjects"), 200, "coding is reachable once on")
        me_after = (await client.get("/api/auth/me")).json()
        require(me_after["modules"]["coding"] is True, "the switch must show up in /api/auth/me")

        # And it switches back off.
        assert_status(
            await client.put("/api/account/modules", json={"modules": {"coding": False}}),
            200,
            "switch coding off again",
        )
        assert_status(await client.get("/api/coding/subjects"), 403, "coding closed again")


def main_entry() -> None:
    test_defaults_keep_programming_out_of_the_way()
    test_locked_module_cannot_be_switched_off()
    test_unknown_keys_from_storage_are_ignored()
    asyncio.run(run_http_checks())
    print("account modules: ok")


if __name__ == "__main__":
    main_entry()
