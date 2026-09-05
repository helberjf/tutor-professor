"""AI credits: one credit per generation the provider actually answered.

Credits meter the administrator's own key. An account paying for its own key is
never metered, and a call that fails costs nothing.

The provider HTTP layer is stubbed rather than generate_json_text itself, so the
metering hook inside generate_json_text still runs - patching one level higher
would silently skip the very thing under test.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-credits-"))
DB_PATH = TMP_DIR / "kids_tutor_credits.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
# The administrator's own key: this is what credits are metering.
os.environ["GEMINI_API_KEY"] = "global-admin-key"
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402
from models.database import User  # noqa: E402


ADMIN_CPF = "52998224725"
FAMILY_CPF = "39053344705"
OWN_KEY_CPF = "16899535009"

GENERATE_URL = "/api/study/diverse/generate-flashcards"


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


def fake_generation(count: int = 2) -> str:
    return json.dumps(
        {
            "subject": "Historia",
            "flashcards": [
                {
                    "question": f"Pergunta numero {index} sobre o Brasil colonia?",
                    "answer": f"Resposta objetiva numero {index} para estudo.",
                    "code_example": None,
                }
                for index in range(1, count + 1)
            ],
        }
    )


def stub_provider(response_text: str | None = None, error: Exception | None = None):
    """Patch the provider call underneath generate_json_text."""

    def call(*args, **kwargs):
        if error is not None:
            raise error
        return response_text if response_text is not None else fake_generation()

    return patch.object(main.phrase_generation_service, "_generate_gemini_json_text", side_effect=call)


async def register_and_login(client: httpx.AsyncClient, *, email: str, cpf: str, name: str) -> None:
    assert_status(
        await client.post(
            "/api/auth/register",
            json={
                "first_name": name,
                "last_name": "Teste",
                "email": email,
                "cpf": cpf,
                "password": "Secret@123",
                "child_name": f"Filho de {name}",
            },
        ),
        201,
        f"register {email}",
    )
    approve_all_accounts(main)
    assert_status(
        await client.post("/api/auth/login", json={"email": email, "password": "Secret@123"}),
        200,
        f"login {email}",
    )


async def credits_of(client: httpx.AsyncClient) -> dict:
    response = await client.get("/api/ai/credits")
    assert_status(response, 200, "read own credits")
    return response.json()


async def run() -> None:
    main.create_db_and_tables()
    main._run_schema_migrations()

    async with new_client() as admin_client, new_client() as family_client, new_client() as own_key_client:
        await register_and_login(admin_client, email="admin@example.com", cpf=ADMIN_CPF, name="Admin")
        await register_and_login(family_client, email="familia@example.com", cpf=FAMILY_CPF, name="Familia")
        await register_and_login(own_key_client, email="propria@example.com", cpf=OWN_KEY_CPF, name="Propria")

        users = (await admin_client.get("/api/admin/users")).json()
        family_id = next(row["id"] for row in users if row["email"] == "familia@example.com")
        own_key_id = next(row["id"] for row in users if row["email"] == "propria@example.com")

        health = await admin_client.get("/api/admin/health")
        assert_status(health, 200, "admin system health")
        require(
            health.json()["status"] == "ok" and health.json()["database"] == "ok",
            f"admin health must include API and database state, got {health.text}",
        )
        assert_status(
            await family_client.get("/api/admin/health"),
            403,
            "system health is restricted to admin",
        )

        # The administrator is never metered on their own key.
        admin_credits = await credits_of(admin_client)
        require(
            admin_credits["unlimited"] and not admin_credits["metered"],
            f"the administrator must not be metered, got {admin_credits}",
        )

        # Every normal account starts on the global Gemini key with three daily credits.
        starting = await credits_of(family_client)
        require(
            starting["credits"] == 3
            and starting["used"] == 0
            and starting["daily_limit"] == 3
            and starting["metered"],
            f"a new account must start with three daily credits, got {starting}",
        )
        users = (await admin_client.get("/api/admin/users")).json()
        family_row = next(row for row in users if row["id"] == family_id)
        require(
            family_row["ai_settings"]["provider"] == "gemini"
            and family_row["ai_settings"]["use_global_key"],
            f"new accounts must use the global Gemini key, got {family_row}",
        )

        with stub_provider() as provider:
            assert_status(
                await family_client.post(GENERATE_URL, json={"subject": "Historia", "count": 2}),
                200,
                "default daily credit allows generation",
            )
            require(provider.called, "the provider must be called while daily credits remain")

        # The admin can change the recurring daily allowance and today's balance.
        grant = await admin_client.post(
            f"/api/admin/users/{family_id}/ai-credits", json={"daily_limit": 5, "credits": 2}
        )
        assert_status(grant, 200, "grant credits")
        require(
            grant.json()["ai_credits"]["credits"] == 2
            and grant.json()["ai_credits"]["daily_limit"] == 5,
            f"expected a five-credit daily limit and two today, got {grant.text}",
        )

        with stub_provider():
            assert_status(
                await family_client.post(GENERATE_URL, json={"subject": "Historia", "count": 2}),
                200,
                "generation with credits",
            )
        after_one = await credits_of(family_client)
        require(
            after_one["credits"] == 1 and after_one["used"] == 2,
            f"one generation costs exactly one credit, got {after_one}",
        )

        # A failed provider call is free.
        with stub_provider(error=RuntimeError("provider exploded")):
            assert_status(
                await family_client.post(GENERATE_URL, json={"subject": "Historia", "count": 2}),
                502,
                "a failing provider surfaces as an error",
            )
        after_failure = await credits_of(family_client)
        require(
            after_failure["credits"] == 1 and after_failure["used"] == 2,
            f"a failed call must not be charged, got {after_failure}",
        )

        # Spending the last credit locks the next call out.
        with stub_provider():
            assert_status(
                await family_client.post(GENERATE_URL, json={"subject": "Historia", "count": 2}),
                200,
                "spend the last credit",
            )
        drained = await credits_of(family_client)
        require(drained["credits"] == 0 and drained["used"] == 3, f"expected an empty balance, got {drained}")
        with stub_provider():
            assert_status(
                await family_client.post(GENERATE_URL, json={"subject": "Historia", "count": 2}),
                402,
                "an empty balance blocks the next generation",
            )

        # Topping up adds to what is left rather than replacing it.
        assert_status(
            await admin_client.post(f"/api/admin/users/{family_id}/ai-credits", json={"add": 3}),
            200,
            "top up",
        )
        topped = await credits_of(family_client)
        require(topped["credits"] == 3, f"expected three credits after topping up, got {topped}")

        # Books use the same pool: a successful outline is one AI generation.
        book_outline = json.dumps({
            "title": "A aventura azul",
            "theme": "cores",
            "synopsis": "Uma aventura curta sobre cores.",
            "characters": ["Lia"],
            "page_outlines": [{"page_number": 1, "scene": "Lia encontra uma bola azul.", "key_vocabulary": ["blue"]}],
            "level": 1,
            "num_pages": 1,
            "target_language": "English",
        })
        with patch.object(
            main.book_generation_service.text_generation_service,
            "_generate_gemini_json_text",
            return_value=book_outline,
        ):
            assert_status(
                await family_client.post("/api/books/outline", json={"level": 1, "num_pages": 1, "theme": "cores"}),
                200,
                "book outline generation",
            )
        after_book = await credits_of(family_client)
        require(after_book["credits"] == 2, f"a book outline must spend one shared AI credit, got {after_book}")

        # A new local day refills to the per-user limit selected by the admin.
        with main.Session(main.engine) as session:
            family = session.get(User, family_id)
            family.ai_credits = 0
            family.ai_credits_reset_date = main.activity_today() - timedelta(days=1)
            session.add(family)
            session.commit()
        refilled = await credits_of(family_client)
        require(
            refilled["credits"] == 5 and refilled["used"] == 0,
            f"the next day must refill the configured daily limit, got {refilled}",
        )

        # Unlimited stops the metering without touching the balance.
        assert_status(
            await admin_client.post(
                f"/api/admin/users/{family_id}/ai-credits", json={"unlimited": True}
            ),
            200,
            "make unlimited",
        )
        with stub_provider():
            assert_status(
                await family_client.post(GENERATE_URL, json={"subject": "Historia", "count": 2}),
                200,
                "unlimited generation",
            )
        unlimited = await credits_of(family_client)
        require(
            unlimited["unlimited"] and not unlimited["metered"] and unlimited["credits"] == 5,
            f"unlimited must not spend credits, got {unlimited}",
        )

        assert_status(
            await admin_client.post(f"/api/admin/users/{family_id}/ai-credits", json={}),
            422,
            "an empty credit payload is refused",
        )
        assert_status(
            await admin_client.post("/api/admin/users/9999/ai-credits", json={"credits": 1}),
            404,
            "granting credits to an unknown account is a 404",
        )

        # An account paying for its own key is never metered.
        assert_status(
            await admin_client.put(
                f"/api/admin/users/{own_key_id}/ai-settings",
                json={"provider": "gemini", "api_key": "a-key-of-their-own"},
            ),
            200,
            "save an own key",
        )
        with stub_provider():
            assert_status(
                await own_key_client.post(GENERATE_URL, json={"subject": "Historia", "count": 2}),
                200,
                "own key generates without credits",
            )
        own = await credits_of(own_key_client)
        require(
            own["credits"] == 3 and own["used"] == 0,
            f"an own-key account must not spend credits, got {own}",
        )

        overview = (await admin_client.get("/api/admin/overview")).json()
        require(
            overview["ai_credits_spent"] == 4,
            f"the overview must count every credit spent, got {overview}",
        )

    print("AI credit tests passed.")


if __name__ == "__main__":
    asyncio.run(run())
