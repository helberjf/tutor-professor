"""Account approval: a new signup waits until the administrator lets it in.

Runs the FastAPI app over a throwaway SQLite database so it never touches local
development data.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-approval-"))
DB_PATH = TMP_DIR / "kids_tutor_approval.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402

import main  # noqa: E402


ADMIN_CPF = "52998224725"
FAMILY_CPF = "39053344705"
OTHER_CPF = "16899535009"


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app),
        base_url="http://testserver",
    )


async def register(client: httpx.AsyncClient, *, email: str, cpf: str, name: str) -> dict:
    response = await client.post(
        "/api/auth/register",
        json={
            "first_name": name,
            "last_name": "Teste",
            "email": email,
            "cpf": cpf,
            "password": "secret123",
            "child_name": f"Filho de {name}",
        },
    )
    assert_status(response, 201, f"register {email}")
    return response.json()


async def login(client: httpx.AsyncClient, email: str) -> dict:
    response = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "secret123"},
    )
    assert_status(response, 200, f"login {email}")
    return response.json()


async def run() -> None:
    main.create_db_and_tables()
    main._run_schema_migrations()

    async with new_client() as admin_client, new_client() as family_client, new_client() as other_client:
        # The administrator's own account never waits in its own queue.
        admin_registration = await register(
            admin_client, email="admin@example.com", cpf=ADMIN_CPF, name="Admin"
        )
        require(
            admin_registration["status"] == "approved",
            f"admin registration must be approved on creation, got {admin_registration}",
        )
        require(admin_registration["is_admin"], "admin registration must report is_admin")

        admin_login = await login(admin_client, "admin@example.com")
        require(
            admin_login["account_status"] == "approved",
            f"admin login must report approved, got {admin_login}",
        )
        assert_status(await admin_client.get("/api/parent/children"), 200, "admin reaches the app")

        # A fresh signup lands in the queue.
        family_registration = await register(
            family_client, email="familia@example.com", cpf=FAMILY_CPF, name="Familia"
        )
        require(
            family_registration["status"] == "pending",
            f"new signup must be pending, got {family_registration}",
        )

        family_login = await login(family_client, "familia@example.com")
        require(
            family_login["account_status"] == "pending",
            f"pending login must report its status, got {family_login}",
        )

        # A pending account holds a session only so the app can explain the wait.
        me_response = await family_client.get("/api/auth/me")
        assert_status(me_response, 200, "pending account reads its own status")
        require(
            me_response.json()["status"] == "pending",
            f"expected pending status on /api/auth/me, got {me_response.text}",
        )
        assert_status(
            await family_client.get("/api/parent/children"),
            403,
            "pending account cannot reach the app",
        )
        assert_status(
            await family_client.get("/api/study/dashboard"),
            403,
            "pending account cannot reach the study dashboard",
        )
        assert_status(
            await family_client.get("/api/admin/users"),
            403,
            "pending account cannot reach the admin area",
        )

        # The queue is what the administrator reviews.
        pending_response = await admin_client.get("/api/admin/users?status=pending")
        assert_status(pending_response, 200, "admin lists the pending queue")
        pending = pending_response.json()
        require(
            [row["email"] for row in pending] == ["familia@example.com"],
            f"expected only the new signup pending, got {pending}",
        )
        family_id = pending[0]["id"]

        assert_status(
            await admin_client.get("/api/admin/users?status=nonsense"),
            422,
            "unknown status filter is refused",
        )

        overview_response = await admin_client.get("/api/admin/overview")
        assert_status(overview_response, 200, "admin overview")
        overview = overview_response.json()
        require(
            overview["pending_users"] == 1 and overview["approved_users"] == 1,
            f"expected one pending and one approved account, got {overview}",
        )
        require(overview["total_users"] == 2, f"expected two accounts, got {overview}")

        approve_response = await admin_client.post(
            f"/api/admin/users/{family_id}/approve",
            json={"note": "Familia conhecida"},
        )
        assert_status(approve_response, 200, "approve the pending account")
        approved = approve_response.json()
        require(approved["status"] == "approved", f"expected approved, got {approved}")
        require(approved["review_note"] == "Familia conhecida", f"expected the note kept, got {approved}")
        require(approved["reviewed_at"] is not None, f"expected a review timestamp, got {approved}")

        # The approval reaches an already-open session without a new login.
        assert_status(
            await family_client.get("/api/parent/children"),
            200,
            "approved account reaches the app",
        )

        # Approval and AI authorization are two independent switches: being let
        # into the app grants no AI on its own.
        ai_settings = (await family_client.get("/api/ai/settings")).json()
        require(
            not ai_settings["has_api_key"] and not ai_settings["use_global_key"],
            f"approval must not hand out AI access, got {ai_settings}",
        )
        assert_status(
            await family_client.post(
                "/api/study/diverse/generate-flashcards",
                json={"subject": "Historia", "count": 2},
            ),
            403,
            "an approved account without AI cannot generate",
        )

        approved_row = next(
            row
            for row in (await admin_client.get("/api/admin/users?status=approved")).json()
            if row["email"] == "familia@example.com"
        )
        require(
            approved_row["ai_settings"]["use_global_key"] is False,
            f"expected no AI authorization after approval, got {approved_row}",
        )

        assert_status(
            await admin_client.put(
                f"/api/admin/users/{family_id}/ai-settings",
                json={"provider": "gemini", "use_global_key": True},
            ),
            200,
            "authorize the global AI key",
        )
        granted = (await family_client.get("/api/ai/settings")).json()
        require(
            granted["use_global_key"],
            f"expected the global key authorization to stick, got {granted}",
        )

        # Revoking the AI leaves the account itself working.
        revoke_response = await admin_client.delete(f"/api/admin/users/{family_id}/ai-settings")
        assert_status(revoke_response, 200, "revoke the AI authorization")
        require(
            not revoke_response.json()["use_global_key"],
            f"expected the authorization dropped, got {revoke_response.text}",
        )
        assert_status(
            await family_client.get("/api/parent/children"),
            200,
            "revoking AI does not remove app access",
        )
        after_revoke = (await family_client.get("/api/ai/settings")).json()
        require(
            not after_revoke["has_api_key"] and not after_revoke["use_global_key"],
            f"expected no AI settings after revoking, got {after_revoke}",
        )

        # A refused account loses its access immediately.
        await register(other_client, email="outro@example.com", cpf=OTHER_CPF, name="Outro")
        await login(other_client, "outro@example.com")
        other_id = (await admin_client.get("/api/admin/users?status=pending")).json()[0]["id"]

        reject_response = await admin_client.post(
            f"/api/admin/users/{other_id}/reject",
            json={"note": "Nao reconheco"},
        )
        assert_status(reject_response, 200, "reject the pending account")
        require(
            reject_response.json()["status"] == "rejected",
            f"expected rejected, got {reject_response.text}",
        )
        assert_status(
            await other_client.get("/api/auth/me"),
            401,
            "rejecting drops every open session",
        )
        rejected_login = await login(other_client, "outro@example.com")
        require(
            rejected_login["account_status"] == "rejected",
            f"rejected login must report its status, got {rejected_login}",
        )
        assert_status(
            await other_client.get("/api/parent/children"),
            403,
            "rejected account cannot reach the app",
        )

        # A rejection is reversible.
        assert_status(
            await admin_client.post(f"/api/admin/users/{other_id}/approve"),
            200,
            "reopen a rejected account",
        )
        rejected_response = await admin_client.get("/api/admin/users?status=rejected")
        require(
            rejected_response.json() == [],
            f"expected the rejected queue empty after reopening, got {rejected_response.text}",
        )

        # The administrator cannot be pushed through the queue.
        admin_id = (await admin_client.get("/api/admin/users?status=approved")).json()
        admin_row = next(row for row in admin_id if row["email"] == "admin@example.com")
        assert_status(
            await admin_client.post(f"/api/admin/users/{admin_row['id']}/reject"),
            400,
            "the administrator account cannot be rejected",
        )
        assert_status(
            await admin_client.post("/api/admin/users/9999/approve"),
            404,
            "approving an unknown account is a 404",
        )

        # The legacy shared parent password has no user row and stays unaffected.
        async with new_client() as legacy_client:
            assert_status(
                await legacy_client.post("/api/parent/login", json={"password": "parent-pass"}),
                200,
                "legacy parent login",
            )
            assert_status(
                await legacy_client.get("/api/parent/children"),
                200,
                "legacy parent session is not gated by approval",
            )

    print("Admin account approval tests passed.")


if __name__ == "__main__":
    asyncio.run(run())
