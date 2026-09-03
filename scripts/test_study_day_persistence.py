"""Behaviour tests for the write semantics behind the study-day data-loss fix.

These exercise real HTTP requests against the app instead of grepping the source,
so they survive refactors and actually catch the regression they describe.

The frontend guard (blocking a save when the day failed to load) only matters
because of what the backend does with the payload it receives: an omitted field
is left alone, an explicit empty string clears the stored value. If that ever
flips, the frontend guard alone would not be enough — so it is pinned here.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-study-day-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'test.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret-for-persistence"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402

VALID_CPF = "52998224725"
TODAY = date.today().isoformat()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def auth_headers(client: httpx.AsyncClient) -> dict[str, str]:
    await client.post(
        "/api/auth/register",
        json={
            "first_name": "Teste",
            "last_name": "Persistencia",
            "email": "persistencia@example.com",
            "cpf": VALID_CPF,
            "password": "senha-forte-123",
        },
    )
    approve_all_accounts(main)
    login = await client.post(
        "/api/auth/login",
        json={"email": "persistencia@example.com", "password": "senha-forte-123"},
    )
    require(login.status_code == 200, f"login failed: {login.text}")
    return {"Authorization": f"Bearer {login.json()['token']}"}


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await auth_headers(client)

        # Seed a day with real content.
        saved = await client.put(
            f"/api/study/day/{TODAY}",
            headers=headers,
            json={"plan_text": "plano do usuario", "studied_text": "estudei bastante"},
        )
        require(saved.status_code == 200, f"seeding the day failed: {saved.text}")

        # Omitting a field must leave the stored value untouched. This is what lets
        # the client save one field without destroying the others.
        partial = await client.put(
            f"/api/study/day/{TODAY}", headers=headers, json={"pomodoro_count": 2}
        )
        require(partial.status_code == 200, f"partial update failed: {partial.text}")
        body = partial.json()
        require(
            body["plan_text"] == "plano do usuario",
            f"omitted plan_text must be preserved, got {body['plan_text']!r}",
        )
        require(
            body["studied_text"] == "estudei bastante",
            f"omitted studied_text must be preserved, got {body['studied_text']!r}",
        )

        # An explicit empty string is a real edit and DOES clear the field. This is
        # precisely why the client must never send blanks it did not load: doing so
        # silently wipes the day.
        cleared = await client.put(
            f"/api/study/day/{TODAY}",
            headers=headers,
            json={"plan_text": "", "studied_text": ""},
        )
        require(cleared.status_code == 200, f"clearing failed: {cleared.text}")
        require(
            cleared.json()["plan_text"] == "",
            "an explicit empty string must clear the field",
        )

        # Reading back confirms it was persisted, not just echoed.
        fetched = await client.get(f"/api/study/day/{TODAY}", headers=headers)
        require(fetched.status_code == 200, f"reading the day failed: {fetched.text}")
        require(fetched.json()["plan_text"] == "", "the cleared value must be persisted")
        require(
            fetched.json()["pomodoro_count"] >= 2,
            "pomodoro_count must survive the later writes",
        )

        await coding_subject_context(client, headers)

    print("Study day persistence checks passed.")


async def coding_subject_context(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    """The per-subject AI context must round-trip through create, read and update."""
    created = await client.post(
        "/api/coding/subjects",
        headers=headers,
        json={
            "name": "AWS",
            "description": "Certificacao",
            "context": "Foco no exame SAA-C03, estilo de prova",
        },
    )
    require(created.status_code == 201, f"creating the subject failed: {created.text}")
    subject = created.json()
    require(
        subject["context"] == "Foco no exame SAA-C03, estilo de prova",
        f"context must be stored on create, got {subject.get('context')!r}",
    )

    listed = await client.get("/api/coding/subjects", headers=headers)
    require(listed.status_code == 200, f"listing subjects failed: {listed.text}")
    match = next(item for item in listed.json() if item["id"] == subject["id"])
    require(match["context"] == subject["context"], "context must survive a round trip")

    updated = await client.put(
        f"/api/coding/subjects/{subject['id']}",
        headers=headers,
        json={"context": "Agora foco em arquitetura serverless"},
    )
    require(updated.status_code == 200, f"updating the subject failed: {updated.text}")
    require(
        updated.json()["context"] == "Agora foco em arquitetura serverless",
        "context must be updatable",
    )
    require(updated.json()["name"] == "AWS", "updating context must not clobber the name")

    # An omitted context leaves the stored one in place.
    renamed = await client.put(
        f"/api/coding/subjects/{subject['id']}", headers=headers, json={"name": "AWS SAA"}
    )
    require(renamed.status_code == 200, f"renaming failed: {renamed.text}")
    require(
        renamed.json()["context"] == "Agora foco em arquitetura serverless",
        "omitting context must not erase it",
    )


if __name__ == "__main__":
    asyncio.run(run())
