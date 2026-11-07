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
            "password": "Secret@123",
            "child_name": f"Filho de {name}",
        },
    )
    assert_status(response, 201, f"register {email}")
    return response.json()


async def login(client: httpx.AsyncClient, email: str) -> dict:
    response = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "Secret@123"},
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
        notifications = overview.get("recent_notifications")
        require(
            isinstance(notifications, list) and len(notifications) == 1,
            f"expected one recent account notification, got {overview}",
        )
        require(
            notifications[0]["type"] == "account_approval_requested"
            and notifications[0]["user_id"] == family_id
            and notifications[0]["user_name"] == "Familia Teste"
            and notifications[0]["user_email"] == "familia@example.com"
            and notifications[0]["status"] == "pending"
            and notifications[0]["occurred_at"] == pending[0]["created_at"],
            f"expected the pending signup as the latest notification, got {notifications}",
        )

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

        streak_url = f"/api/admin/users/{family_id}/study-streaks"
        assert_status(await family_client.get(streak_url), 403, "only admins can read streaks")
        assert_status(
            await admin_client.get("/api/admin/users/0/study-streaks"), 404, "unknown streak account"
        )
        today = main.activity_today()
        yesterday = today - main.timedelta(days=1)
        with main.Session(main.engine) as session:
            profiles = session.exec(
                main.select(main.ChildProfile.id).where(main.ChildProfile.user_id == family_id)
            ).all()
            active = main.ChildProfile(user_id=family_id, name="Ativo", age_group="18+")
            inactive = main.ChildProfile(user_id=family_id, name="Inativo", age_group="18+")
            session.add(active)
            session.add(inactive)
            session.flush()
            for profile, day in (
                (active, today),
                (active, yesterday),
                (inactive, today - main.timedelta(days=3)),
            ):
                session.add(main.StudyDay(child_id=profile.id, study_date=day, studied_text="Estudo"))
            active_id, inactive_id = active.id, inactive.id
            session.commit()

        streak_response = await admin_client.get(streak_url)
        assert_status(streak_response, 200, "admin reads streaks by profile")
        streaks = {row["profile_id"]: row for row in streak_response.json()}
        require(set(streaks) == {active_id, inactive_id, *profiles}, "only owned profiles")
        require(
            streaks[active_id] == {
                "profile_id": active_id,
                "profile_name": "Ativo",
                "streak_days": 2,
                "last_study_date": today.isoformat(),
            },
            f"expected two consecutive study days, got {streaks[active_id]}",
        )
        require(
            streaks[inactive_id]["streak_days"] == 0
            and streaks[inactive_id]["last_study_date"] == (today - main.timedelta(days=3)).isoformat(),
            "expired streak retains the last study date",
        )
        for profile_id in profiles:
            require(
                streaks[profile_id]["streak_days"] == 0 and streaks[profile_id]["last_study_date"] is None,
                "profile without activity has no streak or study date",
            )

        for profile_id in (active_id, inactive_id, *profiles):
            headers = {"X-Child-ID": str(profile_id)}
            expected_days = streaks[profile_id]["streak_days"]
            for endpoint in ("/api/progress", "/api/study/dashboard"):
                response = await family_client.get(endpoint, headers=headers)
                assert_status(response, 200, f"learner reads their own streak from {endpoint}")
                require(
                    response.json().get("study_streak_count") == expected_days,
                    f"expected {expected_days} active study days from {endpoint}, got {response.text}",
                )

        # New accounts already use the global Gemini configuration. Approval
        # only controls when they may enter the app.
        ai_settings = (await family_client.get("/api/ai/settings")).json()
        require(
            not ai_settings["has_api_key"]
            and ai_settings["use_global_key"]
            and ai_settings["provider"] == "gemini",
            f"approval must keep the default Gemini access, got {ai_settings}",
        )
        credits = (await family_client.get("/api/ai/credits")).json()
        require(
            credits["credits"] == 3 and credits["daily_limit"] == 3,
            f"an approved account must keep its three daily credits, got {credits}",
        )

        approved_row = next(
            row
            for row in (await admin_client.get("/api/admin/users?status=approved")).json()
            if row["email"] == "familia@example.com"
        )
        require(
            approved_row["ai_settings"]["use_global_key"] is True,
            f"expected default AI authorization after approval, got {approved_row}",
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

        # The administrator can permanently erase any regular account, using
        # the same complete cleanup as the account owner's LGPD self-service.
        assert_status(
            await admin_client.delete("/api/admin/users/9999"),
            404,
            "deleting an unknown account is a 404",
        )
        assert_status(
            await admin_client.delete(f"/api/admin/users/{admin_row['id']}"),
            409,
            "the administrator account cannot be deleted",
        )
        delete_response = await admin_client.delete(f"/api/admin/users/{family_id}")
        assert_status(delete_response, 200, "admin deletes a regular account")
        deletion = delete_response.json()
        require(deletion["status"] == "deleted", f"expected deletion status, got {deletion}")
        require(
            deletion["removed"].get("User") == 1
            and deletion["removed"].get("ChildProfile") == len(profiles) + 2
            and deletion["removed"].get("StudyDay") == 3,
            f"expected the account and its child data removed, got {deletion}",
        )
        assert_status(
            await family_client.get("/api/auth/me"),
            401,
            "deleting an account revokes its open sessions",
        )
        users_after_delete = (await admin_client.get("/api/admin/users")).json()
        require(
            all(row["id"] != family_id for row in users_after_delete),
            f"deleted account must disappear from the admin list, got {users_after_delete}",
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
