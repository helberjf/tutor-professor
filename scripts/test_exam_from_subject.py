"""A simulado can be built from any subject that already has questions, not only a seeded bank."""
from __future__ import annotations

import asyncio
import hashlib
import os
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="exam-from-subject-"))
DB_PATH = TMP_DIR / "test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "exam-from-subject-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(API))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402
from models.database import (  # noqa: E402
    ChildProfile,
    ProgrammingQuestion,
    ProgrammingSubject,
    ProgrammingTopic,
    StudyQuestion,
    User,
)


EMAIL = "simulado-materias@example.com"
PASSWORD = "Secret@123"


def key(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def options_for(answer: str) -> list[str]:
    return [answer, f"Não é {answer}", f"Talvez {answer}", f"Nunca {answer}"]


def transport() -> httpx.ASGITransport:
    return httpx.ASGITransport(app=main.app, raise_app_exceptions=False)


@asynccontextmanager
async def api_client():
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        login = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if login.status_code != 200:
            raise AssertionError(f"login failed: {login.status_code} {login.text}")
        children = await client.get("/api/parent/children")
        client.headers["X-Child-ID"] = str(children.json()[0]["id"])
        yield client


def child_and_user(session: Session) -> tuple[ChildProfile, User]:
    user = session.exec(select(User).where(User.email == EMAIL)).one()
    child = session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).first()
    return child, user


def add_study_question(session: Session, child_id: int, area: str, subject: str, topic: str, question: str) -> None:
    answer = f"Resposta de {question}"
    session.add(
        StudyQuestion(
            child_id=child_id,
            area=area,
            subject_name=subject,
            topic_key=key(topic)[:40],
            topic_title=topic,
            question=question,
            question_key=key(question),
            options=options_for(answer),
            correct_option=answer,
            explanation=f"Porque {answer}.",
        )
    )


def add_coding_subject(session: Session, child_id: int, name: str, questions: list[tuple[str, list[str], str]]) -> int:
    subject = ProgrammingSubject(child_id=child_id, name=name)
    session.add(subject)
    session.flush()
    topic = ProgrammingTopic(subject_id=subject.id, title=f"Tópico de {name}")
    session.add(topic)
    session.flush()
    for question, options, correct in questions:
        session.add(
            ProgrammingQuestion(
                topic_id=topic.id,
                subject_id=subject.id,
                child_id=child_id,
                question=question,
                question_key=key(question),
                options=options,
                correct_option=correct,
                explanation="Explicação.",
            )
        )
    return subject.id


async def seed() -> dict[str, int]:
    main.on_startup()
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        response = await client.post(
            "/api/auth/register",
            json={
                "first_name": "Mae",
                "last_name": "Teste",
                "email": EMAIL,
                "cpf": "52998224725",
                "password": PASSWORD,
                "child_name": "Bia",
            },
        )
        if response.status_code != 201:
            raise AssertionError(f"register failed: {response.status_code} {response.text}")
        approve_all_accounts(main)

    with Session(main.engine) as session:
        child, user = child_and_user(session)
        user.enabled_modules = {"coding": True}
        session.add(user)
        add_study_question(session, child.id, "diverse", "História", "Brasil Colônia", "Quem chegou em 1500?")
        add_study_question(session, child.id, "diverse", "História", "Império", "Quem foi o primeiro imperador?")
        add_study_question(session, child.id, "english", "Inglês A1", "Colors", "What color is the sky?")
        python_id = add_coding_subject(
            session,
            child.id,
            "Python",
            [
                ("O que len() retorna?", options_for("o tamanho"), "o tamanho"),
                ("O que é uma lista?", options_for("uma sequência"), "uma sequência"),
                # Legacy placeholder options break the exam contract and must be skipped.
                ("Pergunta com alternativas quebradas", ["A", "B", "C", "D"], "A"),
            ],
        )
        # A programming subject sharing a free subject's name must not share its pool.
        history_code_id = add_coding_subject(
            session, child.id, "História", [("Quem criou o Python?", options_for("Guido"), "Guido")]
        )
        session.commit()
        return {"python": python_id, "history_code": history_code_id, "child": child.id}


class ExamFromSubjectTests(unittest.TestCase):
    ids: dict[str, int] = {}

    @classmethod
    def setUpClass(cls) -> None:
        cls.ids = asyncio.run(seed())

    def test_any_subject_becomes_a_simulado(self) -> None:
        asyncio.run(self._run())

    async def _run(self) -> None:
        async with api_client() as client:
            sources = (await client.get("/api/exams/sources")).json()
        by_key = {(source["area"], source["subject_name"]): source for source in sources}
        self.assertEqual(by_key[("diverse", "História")]["question_count"], 2)
        self.assertEqual(by_key[("english", "Inglês A1")]["question_count"], 1)
        self.assertEqual(by_key[("coding", "Python")]["question_count"], 3)
        self.assertEqual(by_key[("coding", "Python")]["subject_id"], self.ids["python"])
        self.assertIsNone(by_key[("diverse", "História")]["exam_id"])

        async with api_client() as client:
            history = await client.post(
                "/api/exams/from-subject",
                json={"area": "diverse", "subject_name": "História", "question_count": 10},
            )
        self.assertEqual(history.status_code, 200, history.text)
        body = history.json()
        self.assertEqual(body["exam"]["name"], "Simulado de História")
        self.assertEqual((body["imported"], body["skipped"], body["pool_size"]), (2, 0, 2))
        self.assertEqual(body["exam"]["question_count"], 10)
        exam_id = body["exam"]["id"]

        # Running it again adds nothing; a new question is picked up on the next refresh.
        async with api_client() as client:
            replay = (await client.post(
                "/api/exams/from-subject", json={"area": "diverse", "subject_name": "História"}
            )).json()
        self.assertEqual((replay["exam"]["id"], replay["imported"], replay["pool_size"]), (exam_id, 0, 2))

        with Session(main.engine) as session:
            add_study_question(session, self.ids["child"], "diverse", "História", "República", "Quando veio a República?")
            session.commit()
        async with api_client() as client:
            refreshed = (await client.post(
                "/api/exams/from-subject", json={"area": "diverse", "subject_name": "História"}
            )).json()
        self.assertEqual((refreshed["imported"], refreshed["pool_size"]), (1, 3))

        # The sitting draws from the copied pool, topic as domain, without the answer key.
        async with api_client() as client:
            attempt = await client.post(f"/api/exams/{exam_id}/attempts")
        self.assertEqual(attempt.status_code, 201, attempt.text)
        drawn = attempt.json()["questions"]
        self.assertEqual(len(drawn), 3)
        self.assertEqual({question["domain"] for question in drawn}, {"Brasil Colônia", "Império", "República"})
        self.assertNotIn("correct_options", attempt.text)

        async with api_client() as client:
            python = (await client.post(
                "/api/exams/from-subject", json={"area": "coding", "subject_id": self.ids["python"]}
            )).json()
            same_name = (await client.post(
                "/api/exams/from-subject", json={"area": "coding", "subject_id": self.ids["history_code"]}
            )).json()
            english = await client.post(
                "/api/exams/from-subject", json={"area": "english", "subject_name": "Inglês A1"}
            )
        self.assertEqual((python["imported"], python["skipped"]), (2, 1), "a broken legacy question is skipped")
        self.assertEqual(python["exam"]["subject_id"], self.ids["python"])
        self.assertEqual(same_name["exam"]["name"], "Simulado de História (Programação)")
        self.assertEqual(same_name["pool_size"], 1, "the programming subject must not reuse the free subject's pool")
        self.assertEqual(english.status_code, 200, english.text)

        async with api_client() as client:
            sources_after = (await client.get("/api/exams/sources")).json()
            unknown = await client.post(
                "/api/exams/from-subject", json={"area": "diverse", "subject_name": "Geografia"}
            )
            missing_coding = await client.post(
                "/api/exams/from-subject", json={"area": "coding", "subject_id": 999999}
            )
        after = {(source["area"], source["subject_name"]): source for source in sources_after}
        self.assertEqual(after[("diverse", "História")]["exam_id"], exam_id)
        self.assertEqual(unknown.status_code, 404, unknown.text)
        self.assertEqual(missing_coding.status_code, 404, missing_coding.text)

        # With the programming module off, its subjects are neither listed nor usable.
        with Session(main.engine) as session:
            _, user = child_and_user(session)
            user.enabled_modules = {"coding": False}
            session.add(user)
            session.commit()
        async with api_client() as client:
            hidden = (await client.get("/api/exams/sources")).json()
            refused = await client.post(
                "/api/exams/from-subject", json={"area": "coding", "subject_id": self.ids["python"]}
            )
        self.assertFalse(any(source["area"] == "coding" for source in hidden))
        self.assertEqual(refused.status_code, 403, refused.text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
