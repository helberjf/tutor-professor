"""Outras matérias are studied exactly like programming, on their own list.

Pins what the unification promised:
- /api/general/ serves the curriculum for general subjects and needs only the
  "diverse" module, while /api/coding/ stays behind the programming switch;
- each list only sees its own subjects, and the LeetCode trainer is not copied;
- a general lesson may come without code, a programming one may not;
- studying a general subject credits "Outras matérias", not programming;
- "Sugerir matéria por IA" proposes the next subject from what the list holds;
- the questions saved in the old per-date shape move into the new one.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-general-track-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'general.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["SESSION_SECRET"] = "test-session-secret-for-general-track"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "general-track-admin@example.com"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402
from models.database import (  # noqa: E402
    ChildProfile,
    DailyActivity,
    DiverseDay,
    ProgrammingFlashcard,
    ProgrammingSubject,
    ProgrammingTopic,
    User,
)
from services import coding_service  # noqa: E402


PASSWORD = "Senha@Forte123"
EMAIL = "general-track@example.com"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def set_modules(**modules: bool) -> None:
    with Session(main.engine) as session:
        for user in session.exec(select(User)).all():
            user.enabled_modules = dict(modules)
            session.add(user)
        session.commit()


def general_lesson() -> dict:
    """A lesson on French with no code anywhere, as the general prompt allows."""
    return {
        "title": "Passé composé com être",
        "sections": [
            {"title": "Introdução", "body": "Verbos de movimento usam être.", "code_example": None},
            {"title": "Concordância", "body": "O particípio concorda com o sujeito.", "code_example": "Elle est allée."},
            {"title": "Armadilhas", "body": "Verbos pronominais também usam être.", "code_example": None},
        ],
        "quiz": [
            {
                "id": index,
                "question": f"Qual auxiliar no caso {index}?",
                "options": ["être", "avoir", "aller", "faire"],
                "correct_option": "être",
                "explanation": "Verbos de movimento usam être.",
            }
            for index in range(1, 6)
        ],
        "flashcards": [
            {"front": f"Quando se usa être no caso {index}?", "back": "Com verbos de movimento.", "code_example": None}
            for index in range(1, 6)
        ],
    }


async def register_and_login(client: httpx.AsyncClient) -> dict[str, str]:
    registered = await client.post(
        "/api/auth/register",
        json={
            "first_name": "Outras",
            "last_name": "Matérias",
            "email": EMAIL,
            "cpf": "52998224725",
            "password": PASSWORD,
        },
    )
    require(registered.status_code == 201, registered.text)
    approve_all_accounts(main)
    login = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    require(login.status_code == 200, login.text)
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    settings = await client.put(
        "/api/ai/settings",
        headers=headers,
        json={"provider": "gemini", "api_key": "fake-test-key", "model": "gemini-2.5-flash"},
    )
    require(settings.status_code == 200, settings.text)
    return headers


async def check_api() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await register_and_login(client)

        # Programming is off by default; other subjects must still work.
        set_modules(coding=False, diverse=True)
        created = await client.post("/api/general/subjects", headers=headers, json={"name": "Francês"})
        require(created.status_code == 201, created.text)
        french = created.json()
        require(french["track"] == "general", "a subject created under /api/general/ is general")

        page = await client.get("/api/general/subjects/page", headers=headers)
        require(page.status_code == 200, page.text)
        require([item["name"] for item in page.json()["items"]] == ["Francês"], page.text)

        blocked = await client.get("/api/coding/subjects/page", headers=headers)
        require(blocked.status_code == 403, "programming stays behind its own switch")
        leetcode = await client.get("/api/general/leetcode", headers=headers)
        require(leetcode.status_code in (403, 404, 405), "the LeetCode trainer is programming-only")

        set_modules(coding=True, diverse=False)
        off = await client.get("/api/general/subjects/page", headers=headers)
        require(off.status_code == 403, "general subjects follow the diverse switch")

        set_modules(coding=True, diverse=True)
        coding_page = await client.get("/api/coding/subjects/page", headers=headers)
        require(coding_page.status_code == 200, coding_page.text)
        require(
            "Francês" not in [item["name"] for item in coding_page.json()["items"]],
            "a general subject never shows up in the programming list",
        )

        # A lesson without code is fine for French...
        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service, "generate_json_text", return_value=json.dumps(general_lesson())
        ) as generate:
            topic = await client.post(f"/api/general/subjects/{french['id']}/topics/generate", headers=headers)
            require(topic.status_code == 201, topic.text)
            prompt = generate.call_args.kwargs["prompt"]
            require("logical study order" in prompt, "general topics follow a logical study order")
            require("technical interview" not in prompt, "general lessons are not interview prep")
        require(topic.json()["flashcard_count"] == 5, topic.text)

        # ...and still refused for a programming subject.
        python = await client.post("/api/coding/subjects", headers=headers, json={"name": "Python"})
        require(python.status_code == 201 and python.json()["track"] == "programming", python.text)
        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service, "generate_json_text", return_value=json.dumps(general_lesson())
        ):
            refused = await client.post(f"/api/coding/subjects/{python.json()['id']}/topics/generate", headers=headers)
        require(refused.status_code == 502, "programming lessons still need code")

        # Marking a French topic studied credits "Outras matérias".
        topic_id = topic.json()["id"]
        studied = await client.put(f"/api/general/topics/{topic_id}", headers=headers, json={"status": "studied"})
        require(studied.status_code == 200, studied.text)
        with Session(main.engine) as session:
            types = [row.activity_type for row in session.exec(select(DailyActivity)).all()]
        require("diverse" in types and "coding_topic" not in types, f"activity types: {types}")

        # Suggest the next subject from what the list already holds.
        suggestion_json = {
            "name": "Francês intermediário",
            "description": "Tempos compostos e pronomes.",
            "icon_emoji": "🇫🇷",
            "reason": "Vem depois do básico.",
        }
        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service, "generate_json_text", return_value=json.dumps(suggestion_json)
        ) as generate:
            suggested = await client.post("/api/general/subjects/suggest", headers=headers, json={})
            prompt = generate.call_args.kwargs["prompt"]
        require(suggested.status_code == 200, suggested.text)
        require(suggested.json()["name"] == "Francês intermediário", suggested.text)
        require("Francês: 1 de 1 tópicos estudados" in prompt, "the suggestion sees the list and its progress")
        require("Python" not in prompt, "the general suggestion ignores the programming list")
        with Session(main.engine) as session:
            general_count = len(
                session.exec(select(ProgrammingSubject).where(ProgrammingSubject.track == "general")).all()
            )
        require(general_count == 1, "a suggestion saves nothing until the reader creates it")

        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps({**suggestion_json, "name": "francês"}),
        ):
            repeated = await client.post("/api/general/subjects/suggest", headers=headers, json={})
        require(repeated.status_code == 502, "a suggestion never repeats a subject already there")

        sources = await client.get("/api/exams/sources", headers=headers)
        require(sources.status_code == 200, sources.text)
        require(
            any(source["area"] == "general" and source["subject_name"] == "Francês" for source in sources.json()),
            "a general subject with questions can become a simulado",
        )


def check_migration() -> None:
    spec = importlib.util.spec_from_file_location(
        "migration_0034", API_DIR / "alembic" / "versions" / "0034_general_subject_track.py"
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    engine = create_engine(f"sqlite:///{(TMP_DIR / 'migration.sqlite').as_posix()}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(first_name="M", last_name="G", email="m@example.com", password_hash="x", cpf_hash="x")
        session.add(user)
        session.flush()
        child = ChildProfile(user_id=user.id, name="Aluno", age_group="18+")
        session.add(child)
        session.flush()
        child_id = child.id

        def question(qid: str, text: str) -> dict:
            return {"id": qid, "topic": text, "answer": f"Resposta de {text}", "code_example": None, "done": False}

        session.add(DiverseDay(
            child_id=child_id,
            study_date=date(2026, 7, 14),
            custom_subjects=[{"id": "s1", "name": "frances", "topics": [question("q1", "Tu ou vous?")], "lessons": []}],
        ))
        session.add(DiverseDay(
            child_id=child_id,
            study_date=date(2026, 9, 23),
            custom_subjects=[{
                "id": "s2",
                "name": "Frances",
                "topics": [question("q1", "Tu ou vous?"), question("q2", "Y ou en?"), question("q3", "Passé composé?")],
                "lessons": [{"id": "l1", "title": "Pronomes", "topic_ids": ["q2"]}],
            }],
        ))
        session.commit()

    for _ in range(2):  # the second run must not duplicate anything
        with engine.begin() as connection:
            migration._move_diverse_subjects(connection)

    with Session(engine) as session:
        subjects = session.exec(select(ProgrammingSubject)).all()
        require(len(subjects) == 1, f"one merged subject, got {[s.name for s in subjects]}")
        require(subjects[0].track == "general", "moved subjects land on the general list")
        topics = session.exec(select(ProgrammingTopic).order_by(ProgrammingTopic.order_index)).all()
        require([t.title for t in topics] == ["Pronomes", "Perguntas salvas"], [t.title for t in topics])
        fronts = sorted(card.front for card in session.exec(select(ProgrammingFlashcard)).all())
        require(fronts == ["Passé composé?", "Tu ou vous?", "Y ou en?"], f"every saved question kept once: {fronts}")


def main_test() -> None:
    asyncio.run(check_api())
    check_migration()
    print("general subject track: ok")


if __name__ == "__main__":
    main_test()
