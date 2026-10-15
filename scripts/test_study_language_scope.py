"""Switching the language being studied must empty the old language's queue.

A student who started in English and moved to French kept meeting English
cards: lessons private to the child were accessible whatever language they were
written in, and the review queue only knew whose card it was, never what it
taught. Both are pinned here through real HTTP requests:

  - a private lesson is listed only while its language is the one being studied;
  - vocabulary and lesson questions left over from the old language stop being
    due, and stop being counted on the home screen;
  - the new language's own cards do show up, so nothing is merely hidden.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-language-scope-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'language.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["SESSION_SECRET"] = "test-session-secret-for-language-scope"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "language-admin@example.com"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import ChildProfile, Lesson, LessonItem, ReviewItem  # noqa: E402
from services.review_service import build_mixed_review_cards  # noqa: E402

VALID_CPF = "52998224725"
EMAIL = "idioma@example.com"
PASSWORD = "Senha@Forte123"

ENGLISH_WORDS = [("Put shirts in drawers", "Guarde as camisas nas gavetas")]
FRENCH_WORDS = [("Bonjour", "Bom dia")]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def auth_headers(client: httpx.AsyncClient) -> dict[str, str]:
    await client.post(
        "/api/auth/register",
        json={
            "first_name": "Idioma",
            "last_name": "Escolhido",
            "email": EMAIL,
            "cpf": VALID_CPF,
            "password": PASSWORD,
        },
    )
    approve_all_accounts(main)
    enable_all_modules(main)
    login = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    require(login.status_code == 200, f"login failed: {login.text}")
    return {"Authorization": f"Bearer {login.json()['token']}"}


def child_id_of_account() -> int:
    with Session(main.engine) as session:
        child = session.exec(select(ChildProfile).order_by(ChildProfile.id)).first()
        require(child is not None, "the account should own a child profile")
        return child.id or 0


def seed_private_lesson(child_id: int, title: str, language: str, words: list[tuple[str, str]]) -> int:
    """A lesson generated for this child, the way the app stores its own."""

    with Session(main.engine) as session:
        lesson = Lesson(
            title=title,
            theme="Frases do dia",
            objective="Aprender frases úteis.",
            content={"daily_goal": "1 frase", "generated_by": "test"},
            child_id=child_id,
            level=None,
            target_language=language,
        )
        session.add(lesson)
        session.commit()
        session.refresh(lesson)
        for word_en, word_pt in words:
            session.add(
                LessonItem(
                    lesson_id=lesson.id,
                    word_en=word_en,
                    word_pt=word_pt,
                    example_sentence_en=f"{word_en}.",
                    example_sentence_pt=f"{word_pt}.",
                )
            )
        session.commit()
        return lesson.id or 0


def set_target_language(child_id: int, language: str) -> None:
    with Session(main.engine) as session:
        child = session.get(ChildProfile, child_id)
        require(child is not None, "child profile vanished")
        child.target_language = language
        session.add(child)
        session.commit()


async def complete_lesson(client: httpx.AsyncClient, headers: dict[str, str], lesson_id: int) -> None:
    done = await client.post(f"/api/lesson/complete?lesson_id={lesson_id}", headers=headers)
    require(done.status_code == 200, f"completing the lesson failed: {done.text}")


async def test_english_queue_before_the_switch(
    client: httpx.AsyncClient, headers: dict[str, str]
) -> None:
    review = await client.get("/api/review", headers=headers)
    require(review.status_code == 200, f"review failed: {review.text}")
    require(review.json()["total_due"] > 0, "the finished English lesson should leave cards due")


async def test_the_old_language_stops_being_offered(
    client: httpx.AsyncClient, headers: dict[str, str], english_lesson_id: int
) -> None:
    lessons = await client.get("/api/lessons", headers=headers)
    require(lessons.status_code == 200, f"listing lessons failed: {lessons.text}")
    listed = {item["id"] for item in lessons.json()}
    require(
        english_lesson_id not in listed,
        "a lesson written in the old language must not be listed while French is being studied",
    )

    review = await client.get("/api/review", headers=headers)
    body = review.json()
    require(body["total_due"] == 0, f"English cards still due after the switch: {body['total_due']}")
    require(body["items"] == [], "no English card should be handed to a French student")

    state = await client.get("/api/study/session", headers=headers)
    require(state.json()["due_review"] == 0, "the home screen must not count the English backlog")

    # The cards are still there, owed and unanswered — it is the language filter
    # that keeps them out, not an empty table. Without this the checks above
    # would pass on a queue that is broken for every language.
    with Session(main.engine) as session:
        unfiltered = build_mixed_review_cards(
            session=session, child_id=child_id_of_account(), limit=10
        )
    require(unfiltered, "the English cards should still exist, merely out of scope")


async def test_the_new_language_is_offered(
    client: httpx.AsyncClient, headers: dict[str, str]
) -> None:
    review = await client.get("/api/review", headers=headers)
    body = review.json()
    require(body["total_due"] > 0, "the finished French lesson should leave cards due")
    prompts = " ".join(str(item.get("prompt") or "") for item in body["items"])
    require("drawers" not in prompts.casefold(), f"an English card leaked into the queue: {prompts}")


def test_review_items_keep_their_language(child_id: int) -> None:
    with Session(main.engine) as session:
        languages = {
            item.word_en: item.target_language
            for item in session.exec(
                select(ReviewItem).where(ReviewItem.child_id == child_id)
            ).all()
        }
    require(
        languages.get("Put shirts in drawers") == "English",
        f"the English word lost its language: {languages}",
    )
    require(languages.get("Bonjour") == "French", f"the French word lost its language: {languages}")


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await auth_headers(client)
        child_id = child_id_of_account()

        english_lesson_id = seed_private_lesson(child_id, "English day", "English", ENGLISH_WORDS)
        await complete_lesson(client, headers, english_lesson_id)
        await test_english_queue_before_the_switch(client, headers)

        set_target_language(child_id, "French")
        await test_the_old_language_stops_being_offered(client, headers, english_lesson_id)

        french_lesson_id = seed_private_lesson(child_id, "Jour de français", "French", FRENCH_WORDS)
        await complete_lesson(client, headers, french_lesson_id)
        await test_the_new_language_is_offered(client, headers)
        test_review_items_keep_their_language(child_id)

    print("study language scope: all checks passed")


if __name__ == "__main__":
    asyncio.run(run())
