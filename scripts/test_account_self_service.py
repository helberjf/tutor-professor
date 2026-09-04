"""Everything an account can do without asking the administrator.

Covers the flows that turned into a message to the owner before: verifying an
address, resetting a forgotten password, changing a password, signing out
everywhere. Also covers the two things that must NOT happen: telling a stranger
whether an address has an account, and letting a spent link work twice.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-selfservice-"))
DB_PATH = TMP_DIR / "selfservice.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["EMAIL_PROVIDER"] = "console"
# Open signup: a verified address is the barrier instead of the approval queue.
os.environ["SIGNUP_MODE"] = "open"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402

import main  # noqa: E402


EMAIL = "familia@example.com"
PASSWORD = "Senha@Forte123"
NEW_PASSWORD = "OutraSenha@456"
CPF = "52998224725"

sent_emails: list = []


def capture_emails() -> None:
    """Collect messages instead of sending them, keeping the real body."""

    def fake_send(message):
        sent_emails.append(message)
        return True

    main.email_service.send = fake_send  # type: ignore[method-assign]


def token_from_last_email(kind: str) -> str:
    for message in reversed(sent_emails):
        match = re.search(rf"{kind}\?token=([A-Za-z0-9_\-]+)", message.body)
        if match:
            return match.group(1)
    raise AssertionError(f"no {kind} link in {[m.subject for m in sent_emails]}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app), base_url="http://testserver"
    )


async def run_checks() -> None:
    main.on_startup()
    capture_emails()

    async with new_client() as client:
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
        require(len(sent_emails) == 1, "registration must send a verification e-mail")

        # Open signup: the account is pending until the address is verified.
        assert_status(
            await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}),
            200,
            "login while pending",
        )
        me = (await client.get("/api/auth/me")).json()
        require(me["status"] == "pending", f"expected a pending account, got {me}")
        assert_status(await client.get("/api/lessons"), 403, "pending account is held back")

        verify = await client.post(
            "/api/auth/email/verify", json={"token": token_from_last_email("verify-email")}
        )
        assert_status(verify, 200, "verify e-mail")
        require(
            verify.json()["status"] == "approved",
            f"open signup should approve on verification, got {verify.json()}",
        )
        assert_status(await client.get("/api/lessons"), 200, "verified account reaches the app")

        # A spent token is spent.
        assert_status(
            await client.post(
                "/api/auth/email/verify", json={"token": token_from_last_email("verify-email")}
            ),
            400,
            "reuse of a verification token",
        )

    # An unknown address gets the same answer as a known one, and no e-mail.
    async with new_client() as stranger:
        before = len(sent_emails)
        assert_status(
            await stranger.post("/api/auth/password/forgot", json={"email": "ninguem@example.com"}),
            202,
            "forgot password for an unknown address",
        )
        require(len(sent_emails) == before, "no e-mail may be sent for an unknown address")

        assert_status(
            await stranger.post("/api/auth/password/forgot", json={"email": EMAIL}),
            202,
            "forgot password for a real address",
        )
        require(len(sent_emails) == before + 1, "a real address gets a reset e-mail")

        reset_token = token_from_last_email("reset-password")
        assert_status(
            await stranger.post(
                "/api/auth/password/reset", json={"token": reset_token, "password": "curta"}
            ),
            422,
            "a weak new password is refused",
        )
        assert_status(
            await stranger.post(
                "/api/auth/password/reset", json={"token": reset_token, "password": NEW_PASSWORD}
            ),
            204,
            "reset the password",
        )
        assert_status(
            await stranger.post(
                "/api/auth/password/reset", json={"token": reset_token, "password": NEW_PASSWORD}
            ),
            400,
            "reuse of a reset token",
        )

    async with new_client() as client:
        assert_status(
            await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}),
            401,
            "the old password stops working",
        )
        assert_status(
            await client.post("/api/auth/login", json={"email": EMAIL, "password": NEW_PASSWORD}),
            200,
            "the new password works",
        )

        assert_status(
            await client.post(
                "/api/account/password",
                json={"current_password": "errada", "new_password": PASSWORD},
            ),
            401,
            "changing a password needs the current one",
        )
        assert_status(
            await client.post(
                "/api/account/password",
                json={"current_password": NEW_PASSWORD, "new_password": PASSWORD},
            ),
            204,
            "change own password",
        )
        # Changing the password signs every session out, including this one.
        assert_status(await client.get("/api/auth/me"), 401, "sessions dropped after the change")


def test_audio_links_are_signed() -> None:
    """A cached audio file is reachable only through a link the API signed."""

    filename = "sample.mp3"
    (TMP_DIR / "audio").mkdir(parents=True, exist_ok=True)
    (TMP_DIR / "audio" / filename).write_bytes(b"not really audio")

    async def check() -> None:
        async with new_client() as client:
            unsigned = await client.get(f"/api/audio/file/{filename}")
            require(
                unsigned.status_code == 403,
                f"an unsigned audio link must be refused, got {unsigned.status_code}",
            )

            expires = int(__import__("datetime").datetime.utcnow().timestamp()) + 600
            signature = main.sign_audio_filename(filename, expires)
            signed = await client.get(
                f"/api/audio/file/{filename}?expires={expires}&signature={signature}"
            )
            require(signed.status_code == 200, f"a signed link must work, got {signed.status_code}")

            tampered = await client.get(
                f"/api/audio/file/{filename}?expires={expires + 1}&signature={signature}"
            )
            require(
                tampered.status_code == 403,
                "changing the expiry must invalidate the signature",
            )

            traversal = await client.get(
                f"/api/audio/file/..%2F..%2Fmain.py?expires={expires}&signature=x"
            )
            require(
                traversal.status_code in (403, 404),
                f"path traversal must not be served, got {traversal.status_code}",
            )

    asyncio.run(check())


def main_entry() -> None:
    asyncio.run(run_checks())
    test_audio_links_are_signed()
    print("account self-service: ok")


if __name__ == "__main__":
    main_entry()
