"""Cross-device bookmark for the last study screen a child actually opened."""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-study-resume-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'resume.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["SESSION_SECRET"] = "test-session-secret-for-study-resume"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "resume-admin@example.com"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import (  # noqa: E402
    ChildProfile,
    Lesson,
    LessonItem,
    ProgrammingSubject,
    ProgrammingTopic,
    User,
)

PASSWORD = "Senha@Forte123"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def register_and_login(
    client: httpx.AsyncClient, *, email: str, cpf: str
) -> dict[str, str]:
    registered = await client.post(
        "/api/auth/register",
        json={
            "first_name": "Retomada",
            "last_name": "Estudo",
            "email": email,
            "cpf": cpf,
            "password": PASSWORD,
        },
    )
    require(registered.status_code == 201, f"register failed: {registered.text}")
    approve_all_accounts(main)
    enable_all_modules(main)
    login = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    require(login.status_code == 200, f"login failed: {login.text}")
    return {"Authorization": f"Bearer {login.json()['token']}"}


def child_id_for(email: str) -> int:
    with Session(main.engine) as session:
        user = session.exec(select(User).where(User.email == email)).one()
        child = session.exec(
            select(ChildProfile).where(ChildProfile.user_id == user.id)
        ).one()
        return child.id or 0


def seed_shared_lesson() -> None:
    with Session(main.engine) as session:
        lesson = Lesson(
            title="Lição para fila aberta",
            theme="Retomada",
            objective="Manter uma sessão guiada antiga aberta.",
            content={"daily_goal": "1 frase"},
            child_id=None,
            level=None,
            target_language="English",
        )
        session.add(lesson)
        session.commit()
        session.refresh(lesson)
        session.add(
            LessonItem(
                lesson_id=lesson.id or 0,
                word_en="Keep going",
                word_pt="Continue",
                example_sentence_en="Keep going with your studies.",
                example_sentence_pt="Continue com seus estudos.",
            )
        )
        session.commit()


def seed_programming(child_id: int) -> tuple[int, int]:
    with Session(main.engine) as session:
        subject = ProgrammingSubject(child_id=child_id, name="Python")
        session.add(subject)
        session.commit()
        session.refresh(subject)
        topic = ProgrammingTopic(subject_id=subject.id or 0, title="Listas")
        session.add(topic)
        session.commit()
        session.refresh(topic)
        return subject.id or 0, topic.id or 0


def delete_topic(topic_id: int) -> None:
    with Session(main.engine) as session:
        topic = session.get(ProgrammingTopic, topic_id)
        require(topic is not None, "seeded topic disappeared too early")
        session.delete(topic)
        session.commit()


def delete_subject(subject_id: int) -> None:
    with Session(main.engine) as session:
        subject = session.get(ProgrammingSubject, subject_id)
        require(subject is not None, "seeded subject disappeared too early")
        session.delete(subject)
        session.commit()


async def run() -> None:
    main.on_startup()
    seed_shared_lesson()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        first_headers = await register_and_login(
            client, email="primeiro@example.com", cpf="52998224725"
        )
        second_headers = await register_and_login(
            client, email="segundo@example.com", cpf="11144477735"
        )
        first_child_id = child_id_for("primeiro@example.com")
        subject_id, topic_id = seed_programming(first_child_id)

        empty = await client.get("/api/study/resume", headers=first_headers)
        require(empty.status_code == 200, empty.text)
        require(empty.json()["has_resume"] is False, "fresh child must have no bookmark")

        guided = await client.post("/api/study/session/start", headers=first_headers)
        require(guided.status_code == 200 and guided.json()["total"] > 0, guided.text)

        saved = await client.put(
            "/api/study/resume",
            headers=first_headers,
            json={
                "kind": "coding_topic",
                "subject_id": subject_id,
                "topic_id": topic_id,
                "mode": "reading",
            },
        )
        require(saved.status_code == 200, saved.text)
        require(saved.json()["label"] == "Python — Listas", saved.text)
        require(
            saved.json()["href"]
            == f"/study?tab=coding&mode=reading&subject_id={subject_id}&topic_id={topic_id}",
            saved.text,
        )

        resumed = await client.get("/api/study/resume", headers=first_headers)
        require(resumed.status_code == 200, resumed.text)
        require(
            resumed.json()["kind"] == "coding_topic",
            "a newer programming target must beat an older guided session",
        )

        forbidden = await client.put(
            "/api/study/resume",
            headers=second_headers,
            json={
                "kind": "coding_topic",
                "subject_id": subject_id,
                "topic_id": topic_id,
                "mode": "reading",
            },
        )
        require(forbidden.status_code == 404, forbidden.text)

        delete_topic(topic_id)
        subject_fallback = await client.get("/api/study/resume", headers=first_headers)
        require(subject_fallback.status_code == 200, subject_fallback.text)
        require(subject_fallback.json()["kind"] == "coding_subject", subject_fallback.text)
        require(
            subject_fallback.json()["href"]
            == f"/study?tab=coding&mode=reading&subject_id={subject_id}",
            subject_fallback.text,
        )

        delete_subject(subject_id)
        area_fallback = await client.get("/api/study/resume", headers=first_headers)
        require(area_fallback.status_code == 200, area_fallback.text)
        require(area_fallback.json()["href"] == "/study?tab=coding", area_fallback.text)

    print("study resume: all checks passed")


if __name__ == "__main__":
    asyncio.run(run())
