"""Outras disciplinas are studied exactly like programming, which is one of them.

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
    StudyDiscipline,
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

        # Programming is off by default; the other disciplines must still work.
        set_modules(coding=False, diverse=True)
        created = await client.post(
            "/api/general/disciplines", headers=headers, json={"name": "Francês", "icon_emoji": "🇫🇷"}
        )
        require(created.status_code == 201, created.text)
        french_discipline = created.json()
        duplicate = await client.post("/api/general/disciplines", headers=headers, json={"name": "francês"})
        require(duplicate.status_code == 409, "one discipline per name")
        law = (await client.post("/api/general/disciplines", headers=headers, json={"name": "Direito"})).json()

        in_french = f"?discipline_id={french_discipline['id']}"
        in_law = f"?discipline_id={law['id']}"
        grammar_response = await client.post(f"/api/general/subjects{in_french}", headers=headers, json={"name": "Gramática"})
        require(grammar_response.status_code == 201, grammar_response.text)
        french = grammar_response.json()
        require(french["track"] == "general", "a subject created under /api/general/ is general")
        require(french["discipline_id"] == french_discipline["id"], "a subject belongs to the discipline it was created in")
        penal = await client.post(f"/api/general/subjects{in_law}", headers=headers, json={"name": "Penal"})
        require(penal.status_code == 201, penal.text)

        page = await client.get(f"/api/general/subjects/page{in_french}", headers=headers)
        require(page.status_code == 200, page.text)
        require([item["name"] for item in page.json()["items"]] == ["Gramática"], "each discipline lists only its own subjects")
        listed_disciplines = await client.get("/api/general/disciplines", headers=headers)
        require(
            [(d["name"], d["subject_count"]) for d in listed_disciplines.json()] == [("Direito", 1), ("Francês", 1)],
            listed_disciplines.text,
        )
        foreign = await client.get("/api/general/subjects/page?discipline_id=999999", headers=headers)
        require(foreign.status_code == 404, "an unknown discipline is refused")

        blocked = await client.get("/api/coding/subjects/page", headers=headers)
        require(blocked.status_code == 403, "programming stays behind its own switch")
        leetcode = await client.get("/api/general/leetcode", headers=headers)
        require(leetcode.status_code in (403, 404, 405), "the LeetCode trainer is programming-only")

        set_modules(coding=True, diverse=False)
        off = await client.get(f"/api/general/subjects/page{in_french}", headers=headers)
        require(off.status_code == 403, "the other disciplines follow the diverse switch")
        off_list = await client.get("/api/general/disciplines", headers=headers)
        require(off_list.status_code == 403, "so does the list of disciplines")

        set_modules(coding=True, diverse=True)
        coding_page = await client.get("/api/coding/subjects/page", headers=headers)
        require(coding_page.status_code == 200, coding_page.text)
        require(
            not {"Gramática", "Penal"} & {item["name"] for item in coding_page.json()["items"]},
            "a general subject never shows up in programming",
        )

        # A lesson without code is fine for French, and the AI hears which discipline.
        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service, "generate_json_text", return_value=json.dumps(general_lesson())
        ) as generate:
            topic = await client.post(f"/api/general/subjects/{french['id']}/topics/generate", headers=headers)
            require(topic.status_code == 201, topic.text)
            prompt = generate.call_args.kwargs["prompt"]
            require("Subject: Francês: Gramática" in prompt, "the AI knows it is French grammar")
            require("logical study order" in prompt, "general topics follow a logical study order")
            require("technical interview" not in prompt, "general lessons are not interview prep")
        require(topic.json()["flashcard_count"] == 5, topic.text)

        # ...and still refused for a programming subject.
        python = await client.post("/api/coding/subjects", headers=headers, json={"name": "Python"})
        require(python.status_code == 201 and python.json()["track"] == "programming", python.text)
        require(python.json()["discipline_id"] is None, "programming is a discipline of its own")
        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service, "generate_json_text", return_value=json.dumps(general_lesson())
        ):
            refused = await client.post(f"/api/coding/subjects/{python.json()['id']}/topics/generate", headers=headers)
        require(refused.status_code == 502, "programming lessons still need code")

        # Marking a French topic studied credits "Outras disciplinas".
        topic_id = topic.json()["id"]
        studied = await client.put(f"/api/general/topics/{topic_id}", headers=headers, json={"status": "studied"})
        require(studied.status_code == 200, studied.text)
        with Session(main.engine) as session:
            types = [row.activity_type for row in session.exec(select(DailyActivity)).all()]
        require("diverse" in types and "coding_topic" not in types, f"activity types: {types}")

        # Suggest the next subject of the discipline from what it already holds.
        suggestion_json = {
            "name": "Conversação",
            "description": "Diálogos do dia a dia.",
            "icon_emoji": "💬",
            "reason": "Vem depois da gramática básica.",
        }
        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service, "generate_json_text", return_value=json.dumps(suggestion_json)
        ) as generate:
            suggested = await client.post(f"/api/general/subjects/suggest{in_french}", headers=headers, json={})
            prompt = generate.call_args.kwargs["prompt"]
        require(suggested.status_code == 200, suggested.text)
        require(suggested.json()["name"] == "Conversação", suggested.text)
        require("the discipline Francês" in prompt, "the suggestion stays inside the discipline")
        require("Gramática: 1 de 1 tópicos estudados" in prompt, "the suggestion sees the subjects and their progress")
        require("Penal" not in prompt and "Python" not in prompt, "other disciplines stay out of it")
        with Session(main.engine) as session:
            general_count = len(
                session.exec(select(ProgrammingSubject).where(ProgrammingSubject.track == "general")).all()
            )
        require(general_count == 2, "a suggestion saves nothing until the reader creates it")

        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps({**suggestion_json, "name": "gramática"}),
        ):
            repeated = await client.post(f"/api/general/subjects/suggest{in_french}", headers=headers, json={})
        require(repeated.status_code == 502, "a suggestion never repeats a subject already there")

        # "Montar curso com IA": the next lessons in study order, content later.
        outline = {"topics": [
            "Passé composé com être",  # already exists: must be skipped
            "Imparfait",
            "Pronomes y e en",
            "Futur simple",
        ]}
        with patch.object(main, "_get_user_ai_config", return_value=object()), patch.object(
            coding_service._phrase_service, "generate_json_text", return_value=json.dumps(outline)
        ) as generate:
            course = await client.post(
                f"/api/general/subjects/{french['id']}/topics/generate-outline",
                headers=headers,
                json={"count": 3, "context": "prova DELF B1"},
            )
            prompt = generate.call_args.kwargs["prompt"]
        require(course.status_code == 201, course.text)
        require([t["title"] for t in course.json()] == ["Imparfait", "Pronomes y e en", "Futur simple"], course.text)
        require(all(t["ai_content"] is None for t in course.json()), "each lesson is written when it is opened")
        require("Subject: Francês: Gramática" in prompt, "the course is planned for French grammar")
        require("1. Passé composé com être" in prompt, "the course continues from the lessons it has")
        require("prova DELF B1" in prompt, "the course follows the student's focus")
        listed = await client.get(f"/api/general/subjects/{french['id']}/topics", headers=headers)
        require(
            [t["title"] for t in listed.json()] == ["Passé composé com être", "Imparfait", "Pronomes y e en", "Futur simple"],
            "new lessons come after the existing ones, in order",
        )

        sources = await client.get("/api/exams/sources", headers=headers)
        require(sources.status_code == 200, sources.text)
        require(
            any(source["area"] == "general" and source["subject_name"] == "Gramática" for source in sources.json()),
            "a general subject with questions can become a simulado",
        )

        # Removing a discipline removes its subjects, and only those.
        removed = await client.delete(f"/api/general/disciplines/{law['id']}", headers=headers)
        require(removed.status_code == 204, removed.text)
        with Session(main.engine) as session:
            names = sorted(subject.name for subject in session.exec(select(ProgrammingSubject)).all())
        require(names == ["Gramática", "Python"], f"left after removing Direito: {names}")


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

    spec_0035 = importlib.util.spec_from_file_location(
        "migration_0035", API_DIR / "alembic" / "versions" / "0035_study_disciplines.py"
    )
    migration_0035 = importlib.util.module_from_spec(spec_0035)
    spec_0035.loader.exec_module(migration_0035)

    for _ in range(2):  # the second run must not duplicate anything
        with engine.begin() as connection:
            migration._move_diverse_subjects(connection)
            migration_0035._wrap_general_subjects(connection)

    with Session(engine) as session:
        subjects = session.exec(select(ProgrammingSubject)).all()
        require(len(subjects) == 1, f"one merged subject, got {[s.name for s in subjects]}")
        require(subjects[0].track == "general", "moved subjects land on the general list")
        disciplines = session.exec(select(StudyDiscipline)).all()
        require(
            [d.name for d in disciplines] == ["frances"] and subjects[0].discipline_id == disciplines[0].id,
            "an existing general subject moves into a discipline of the same name",
        )
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
