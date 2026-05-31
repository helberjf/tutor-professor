"""Integration smoke tests for the FastAPI backend routes.

The script uses a temporary SQLite database so it can run without touching
local development data.
"""
from __future__ import annotations

import os
import sys
import asyncio
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-api-"))
DB_PATH = TMP_DIR / "kids_tutor_test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["CORS_ALLOWED_ORIGINS"] = "http://localhost:3000,https://english-tutor-kid.vercel.app"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402


VALID_CPF = "52998224725"


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text}")


def seed_lesson() -> None:
    with Session(main.engine) as session:
        lesson = main.Lesson(
            id=1,
            title="Dia 1",
            theme="Saudacoes",
            objective="Aprender frases simples de saudacao.",
            content={
                "daily_goal": "3 frases para cumprimentar",
                "phrase_breakdowns": [
                    {
                        "phrase_en": "Hello",
                        "phrase_pt": "Ola",
                        "word_by_word": [{"en": "Hello", "pt": "Ola"}],
                    }
                ],
                "quiz_questions": [
                    {
                        "id": 1,
                        "question": "Como se diz Ola em ingles?",
                        "options": ["Hello", "Bye", "Thanks", "Please"],
                        "correct_option": "Hello",
                        "explanation": "Hello significa Ola.",
                    }
                ],
            },
        )
        session.add(lesson)
        session.add(
            main.LessonItem(
                word_en="Hello",
                word_pt="Ola",
                example_sentence_en="Hello, friend!",
                example_sentence_pt="Ola, amigo!",
                lesson_id=1,
            )
        )
        session.add(
            main.LessonItem(
                word_en="Thank you",
                word_pt="Obrigado",
                example_sentence_en="Thank you, teacher!",
                example_sentence_pt="Obrigado, professor!",
                lesson_id=1,
            )
        )
        session.commit()


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        seed_lesson()

        assert_status(await client.get("/health"), 200, "health")
        assert_status(await client.get("/api/progress"), 200, "anonymous progress")

        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": "pai@example.com",
                    "cpf": "11111111111",
                    "password": "secret123",
                    "child_name": "Lia",
                },
            ),
            422,
            "register invalid cpf",
        )

        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": "pai@example.com",
                    "cpf": VALID_CPF,
                    "password": "secret123",
                    "child_name": "Lia",
                },
            ),
            201,
            "register",
        )
        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": "pai@example.com",
                    "cpf": "39053344705",
                    "password": "secret123",
                    "child_name": "Lia",
                },
            ),
            409,
            "duplicate email",
        )
        assert_status(await client.post("/api/auth/login", json={"email": "pai@example.com", "password": "secret123"}), 200, "login")
        assert_status(await client.get("/api/auth/me"), 200, "me")

        children_response = await client.get("/api/parent/children")
        assert_status(children_response, 200, "parent children")
        children = children_response.json()
        if len(children) != 1 or children[0]["name"] != "Lia":
            raise AssertionError(f"expected registered child Lia, got {children}")
        child_id = children[0]["id"]
        child_headers = {"X-Child-ID": str(child_id)}

        assert_status(await client.get("/api/parent/settings", headers=child_headers), 200, "parent settings")
        assert_status(await client.get("/api/parent/progress", headers=child_headers), 200, "parent progress")
        assert_status(
            await client.post("/api/parent/settings", headers=child_headers, json={"child_name": "Lia Teste", "age_group": "7-9"}),
            200,
            "parent settings update",
        )
        assert_status(
            await client.post("/api/parent/children", json={"name": "Noah", "age_group": "4-6"}),
            200,
            "create child",
        )

        assert_status(await client.get("/api/lessons", headers=child_headers), 200, "lessons")
        assert_status(await client.get("/api/lesson/today", headers=child_headers), 200, "today lesson")
        assert_status(await client.get("/api/lesson/1", headers=child_headers), 200, "lesson by id")
        assert_status(await client.get("/api/quiz/today?lesson_id=1", headers=child_headers), 200, "today quiz")
        assert_status(
            await client.post(
                "/api/review/attempt",
                headers=child_headers,
                json={"word_en": "Hello", "word_pt": "Ola", "correct": True},
            ),
            200,
            "review attempt before complete",
        )
        assert_status(await client.post("/api/lesson/complete?lesson_id=1", headers=child_headers), 200, "complete lesson")
        assert_status(
            await client.post(
                "/api/quiz/submit",
                headers=child_headers,
                json={"lesson_id": 1, "score": 1, "total_questions": 1},
            ),
            200,
            "submit quiz",
        )
        assert_status(await client.get("/api/review", headers=child_headers), 200, "review session")
        progress_response = await client.get("/api/progress", headers=child_headers)
        assert_status(progress_response, 200, "progress")
        if progress_response.json()["themes_completed"] != 1:
            raise AssertionError(f"expected completed theme in progress, got {progress_response.text}")

        assert_status(await client.post("/api/chat", headers=child_headers, json={"message": "hello", "history": []}), 200, "chat")
        assert_status(await client.post("/api/audio/speak", headers=child_headers, json={"text": "Hello"}), 200, "audio speak")
        assert_status(await client.post("/api/parent/generate-lesson", headers=child_headers, json={}), 503, "generate lesson unconfigured")

        assert_status(await client.post("/api/auth/logout"), 200, "auth logout")
        assert_status(await client.get("/api/auth/me"), 401, "me after logout")
        assert_status(await client.post("/api/parent/login", json={"password": "parent-pass"}), 200, "legacy parent login")
        assert_status(await client.post("/api/parent/logout"), 200, "parent logout")

    print("API route smoke tests passed.")


if __name__ == "__main__":
    asyncio.run(run())
