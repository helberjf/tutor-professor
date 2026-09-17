"""Programming subjects load in bounded, sortable pages with saved relevance."""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-coding-subject-pages-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'subjects.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["SESSION_SECRET"] = "test-session-secret-for-coding-pages"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "coding-pages-admin@example.com"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import ProgrammingTopic  # noqa: E402


PASSWORD = "Senha@Forte123"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def register_and_login(client: httpx.AsyncClient) -> dict[str, str]:
    registered = await client.post(
        "/api/auth/register",
        json={
            "first_name": "Paginação",
            "last_name": "Programação",
            "email": "coding-pages@example.com",
            "cpf": "52998224725",
            "password": PASSWORD,
        },
    )
    require(registered.status_code == 201, registered.text)
    approve_all_accounts(main)
    enable_all_modules(main)
    login = await client.post(
        "/api/auth/login",
        json={"email": "coding-pages@example.com", "password": PASSWORD},
    )
    require(login.status_code == 200, login.text)
    return {"Authorization": f"Bearer {login.json()['token']}"}


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await register_and_login(client)
        names = [
            "Zig",
            "Alpha",
            "Kotlin",
            "Banco de Dados",
            "React",
            "Docker",
            "Git",
            "Python",
            "Java",
            "Cloud",
            "TypeScript",
            "Node",
        ]
        created: list[dict] = []
        for name in names:
            response = await client.post(
                "/api/coding/subjects",
                headers=headers,
                json={"name": name},
            )
            require(response.status_code == 201, response.text)
            created.append(response.json())

        with Session(main.engine) as session:
            session.add(
                ProgrammingTopic(
                    subject_id=created[1]["id"],
                    title="Começar",
                    status="studied",
                )
            )
            session.add(
                ProgrammingTopic(
                    subject_id=created[1]["id"],
                    title="Continuar",
                )
            )
            session.commit()

        statements: list[str] = []

        def capture_statement(_conn, _cursor, statement, _parameters, _context, _executemany) -> None:
            statements.append(statement)

        event.listen(main.engine, "before_cursor_execute", capture_statement)
        try:
            alphabetical = await client.get(
                "/api/coding/subjects/page?page=1&sort=alphabetical",
                headers=headers,
            )
        finally:
            event.remove(main.engine, "before_cursor_execute", capture_statement)
        require(alphabetical.status_code == 200, alphabetical.text)
        select_count = sum(
            1 for statement in statements if statement.lstrip().lower().startswith("select")
        )
        require(
            select_count <= 20,
            f"paged listing regressed to per-subject queries ({select_count} SELECTs)",
        )
        first_page = alphabetical.json()
        require(first_page["page_size"] == 10, "subject pages must always contain at most 10 cards")
        require(first_page["total"] == 12 and first_page["total_pages"] == 2, first_page)
        require(len(first_page["items"]) == 10, first_page)
        require(
            [item["name"] for item in first_page["items"]]
            == sorted(names, key=str.casefold)[:10],
            first_page,
        )
        require(first_page["topic_count"] == 2, first_page)
        require(first_page["studied_count"] == 1, first_page)

        second_page_response = await client.get(
            "/api/coding/subjects/page?page=2&sort=alphabetical",
            headers=headers,
        )
        require(second_page_response.status_code == 200, second_page_response.text)
        second_page = second_page_response.json()
        require(len(second_page["items"]) == 2, second_page)
        require(
            {item["id"] for item in first_page["items"]}.isdisjoint(
                {item["id"] for item in second_page["items"]}
            ),
            "pages must not repeat subjects",
        )

        newest = await client.get(
            "/api/coding/subjects/page?page=1&sort=created_at",
            headers=headers,
        )
        require(newest.status_code == 200, newest.text)
        require(newest.json()["items"][0]["id"] == created[-1]["id"], newest.text)

        relevance = await client.put(
            f"/api/coding/subjects/{created[2]['id']}",
            headers=headers,
            json={"relevance": 5},
        )
        require(relevance.status_code == 200, relevance.text)
        require(relevance.json()["relevance"] == 5, relevance.text)
        invalid_relevance = await client.put(
            f"/api/coding/subjects/{created[2]['id']}",
            headers=headers,
            json={"relevance": 6},
        )
        require(invalid_relevance.status_code == 422, invalid_relevance.text)
        by_relevance = await client.get(
            "/api/coding/subjects/page?page=1&sort=relevance",
            headers=headers,
        )
        require(by_relevance.status_code == 200, by_relevance.text)
        require(by_relevance.json()["items"][0]["id"] == created[2]["id"], by_relevance.text)

        used = await client.post(
            f"/api/coding/subjects/{created[4]['id']}/use",
            headers=headers,
        )
        require(used.status_code == 200, used.text)
        require(used.json()["last_used_at"], used.text)
        by_last_use = await client.get(
            "/api/coding/subjects/page?page=1&sort=last_used",
            headers=headers,
        )
        require(by_last_use.status_code == 200, by_last_use.text)
        require(by_last_use.json()["items"][0]["id"] == created[4]["id"], by_last_use.text)

        direct = await client.get(
            f"/api/coding/subjects/{created[4]['id']}",
            headers=headers,
        )
        require(direct.status_code == 200 and direct.json()["id"] == created[4]["id"], direct.text)

        invalid_sort = await client.get(
            "/api/coding/subjects/page?page=1&sort=unknown",
            headers=headers,
        )
        require(invalid_sort.status_code == 422, invalid_sort.text)

    print("coding subject pagination checks passed")


if __name__ == "__main__":
    asyncio.run(run())
