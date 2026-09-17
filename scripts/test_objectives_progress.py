"""Objectives: the checklist a learner writes, and the percentage it adds up to.

The number on screen is the whole feature, so what is pinned here is how it is
computed rather than that the routes answer 200:

  - an objective with no items yet is 0%, not a finished goal;
  - weights count, because "ler um capítulo" and "terminar o curso" are not the
    same amount of study;
  - the percentage follows the current list — deleting an item or unchecking it
    moves the number back, and the "conquistado" badge with it;
  - one account never reaches another account's objectives.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-objectives-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'test.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret-for-objectives"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["AUTH_RATE_LIMIT"] = "500"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402


ACCOUNT_A = ("objetivos-a@example.com", "52998224725", "Ana")
ACCOUNT_B = ("objetivos-b@example.com", "39053344705", "Bruno")
PASSWORD = "Senha@Forte123"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def sign_in(client: httpx.AsyncClient, account: tuple[str, str, str]) -> dict[str, str]:
    email, cpf, first_name = account
    await client.post(
        "/api/auth/register",
        json={
            "first_name": first_name,
            "last_name": "Objetivos",
            "email": email,
            "cpf": cpf,
            "password": PASSWORD,
        },
    )
    approve_all_accounts(main)
    enable_all_modules(main)
    login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    require(login.status_code == 200, f"login failed: {login.text}")
    return {"Authorization": f"Bearer {login.json()['token']}"}


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await sign_in(client, ACCOUNT_A)

        # ── An objective starts empty, and empty is 0% ───────────────────────
        target = (main.activity_today() + timedelta(days=30)).isoformat()
        created = await client.post(
            "/api/objectives",
            headers=headers,
            json={
                "title": "Passar na prova de inglês",
                "description": "B2 até o fim do mês",
                "icon_emoji": "🎯",
                "target_date": target,
            },
        )
        require(created.status_code == 201, f"create objective failed: {created.text}")
        objective = created.json()
        require(objective["progress_percent"] == 0, f"an empty objective is 0%, got {objective}")
        require(objective["item_count"] == 0, f"nothing was added yet, got {objective}")
        require(objective["achieved_at"] is None, "an empty objective is not achieved")
        require(objective["days_remaining"] == 30, f"expected 30 days left, got {objective}")
        objective_id = objective["id"]

        # ── Items are the study; the percentage is how much of it is done ────
        for title, weight in (("Ler o capítulo 3", 1), ("Fazer um simulado", 3)):
            added = await client.post(
                f"/api/objectives/{objective_id}/items",
                headers=headers,
                json={"title": title, "area": "language", "weight": weight},
            )
            require(added.status_code == 201, f"add item failed: {added.text}")
        objective = added.json()
        require(objective["item_count"] == 2, f"expected two items, got {objective}")
        require(objective["progress_percent"] == 0, f"nothing is done yet, got {objective}")

        items = {item["title"]: item for item in objective["items"]}
        chapter = items["Ler o capítulo 3"]
        simulado = items["Fazer um simulado"]

        # Weight 1 of 4 done is 25%, not "one of two items" = 50%.
        done = await client.put(
            f"/api/objectives/items/{chapter['id']}",
            headers=headers,
            json={"done": True},
        )
        require(done.status_code == 200, f"check item failed: {done.text}")
        require(done.json()["progress_percent"] == 25, f"weights must count, got {done.json()}")
        require(done.json()["done_count"] == 1, f"expected one checked item, got {done.json()}")

        done = await client.put(
            f"/api/objectives/items/{simulado['id']}",
            headers=headers,
            json={"done": True},
        )
        reached = done.json()
        require(reached["progress_percent"] == 100, f"the whole list is done, got {reached}")
        require(reached["achieved_at"] is not None, f"100% is the achievement, got {reached}")

        # The achievement lands in the activity feed for the day it happened.
        feed = await client.get("/api/activity/today", headers=headers)
        require(feed.status_code == 200, f"activity feed failed: {feed.text}")
        titles = [entry["activity_title"] for entry in feed.json()["activities"]]
        require(
            any("Passar na prova de inglês" in title for title in titles),
            f"reaching an objective should be logged, got {titles}",
        )

        # ── The badge describes the current list, not its best moment ────────
        undone = await client.put(
            f"/api/objectives/items/{simulado['id']}",
            headers=headers,
            json={"done": False},
        )
        require(undone.json()["progress_percent"] == 25, f"unchecking moves it back, got {undone.json()}")
        require(undone.json()["achieved_at"] is None, "an unfinished list is not achieved")

        # Deleting the only pending item finishes the objective again.
        removed = await client.delete(
            f"/api/objectives/items/{simulado['id']}",
            headers=headers,
        )
        require(removed.status_code == 200, f"delete item failed: {removed.text}")
        require(removed.json()["progress_percent"] == 100, f"only done work is left, got {removed.json()}")

        # ── The summary is what the dashboard card reads ─────────────────────
        second = await client.post(
            "/api/objectives",
            headers=headers,
            json={
                "title": "Terminar o curso de AWS",
                "items": [
                    {"title": "Módulo 1", "area": "coding"},
                    {"title": "Módulo 2", "area": "coding"},
                ],
            },
        )
        require(second.status_code == 201, f"create with items failed: {second.text}")
        require(second.json()["item_count"] == 2, f"items sent on create must stick, got {second.json()}")

        summary = await client.get("/api/objectives/summary", headers=headers)
        require(summary.status_code == 200, f"summary failed: {summary.text}")
        body = summary.json()
        require(body["active_count"] == 2, f"expected two active objectives, got {body}")
        require(body["achieved_count"] == 1, f"expected one finished objective, got {body}")
        # (100 + 0) / 2
        require(body["average_progress_percent"] == 50, f"expected an average of 50, got {body}")
        require(body["total_items"] == 3 and body["done_items"] == 1, f"item totals are off: {body}")

        # ── Archiving hides it from the list without losing it ──────────────
        archived = await client.put(
            f"/api/objectives/{objective_id}",
            headers=headers,
            json={"status": "archived"},
        )
        require(archived.status_code == 200, f"archive failed: {archived.text}")
        listed = await client.get("/api/objectives", headers=headers)
        require(
            [item["id"] for item in listed.json()] == [second.json()["id"]],
            f"an archived objective should drop out of the list, got {listed.json()}",
        )
        with_archived = await client.get("/api/objectives?include_archived=true", headers=headers)
        require(
            len(with_archived.json()) == 2,
            f"archived objectives are kept, got {with_archived.json()}",
        )

        # Clearing a date is a different request from not sending one.
        cleared = await client.put(
            f"/api/objectives/{objective_id}",
            headers=headers,
            json={"clear_target_date": True},
        )
        require(cleared.json()["target_date"] is None, f"the date should be gone, got {cleared.json()}")
        require(cleared.json()["days_remaining"] is None, "no date means no countdown")

    # ── Another account reaches none of it ──────────────────────────────────
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as intruder:
        other_headers = await sign_in(intruder, ACCOUNT_B)
        require(
            (await intruder.get("/api/objectives", headers=other_headers)).json() == [],
            "a fresh account starts with no objectives",
        )
        for method, path in (
            ("GET", f"/api/objectives/{objective_id}/items"),
            ("PUT", f"/api/objectives/{objective_id}"),
            ("DELETE", f"/api/objectives/{objective_id}"),
            ("PUT", f"/api/objectives/items/{chapter['id']}"),
            ("DELETE", f"/api/objectives/items/{chapter['id']}"),
        ):
            response = await intruder.request(
                method,
                path,
                headers=other_headers,
                json={"title": "invadido"} if method == "PUT" else None,
            )
            require(
                response.status_code in (404, 405),
                f"{method} {path} leaked another account's objective: {response.status_code}",
            )

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as anonymous:
        for path in ("/api/objectives", "/api/objectives/summary"):
            response = await anonymous.get(path)
            require(
                response.status_code == 401,
                f"{path} answered {response.status_code} without a session; expected 401",
            )

    print("Objectives progress checks passed.")


if __name__ == "__main__":
    asyncio.run(run())
