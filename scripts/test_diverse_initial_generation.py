from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
WEB_PAGE = ROOT / "apps" / "web" / "src" / "app" / "study" / "page.tsx"
WEB_API = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
TMP_DIR = Path(tempfile.mkdtemp(prefix="diverse-initial-generation-"))
DB_PATH = TMP_DIR / "test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "diverse-initial-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(API))

import httpx
from sqlmodel import Session, select

import main
from services.diverse_question_service import validate_generated_question_batch


EMAIL = "diverse-initial@example.com"
PASSWORD = "secret123"


def make_questions(prefix: str = "Question") -> list[dict[str, object]]:
    return [
        {
            "question": f"{prefix} {index}?",
            "answer": f"Answer {index}.",
            "code_example": f"const value{index} = {index};" if index == 1 else None,
        }
        for index in range(1, 6)
    ]


class DiverseInitialValidationTests(unittest.TestCase):
    def test_validates_exactly_five_unique_typed_bounded_questions_and_code(self) -> None:
        validated = validate_generated_question_batch(make_questions(), expected_count=5)
        self.assertEqual(len(validated), 5)
        self.assertEqual(validated[0]["code_example"], "const value1 = 1;")

        invalid_batches = {
            "count": make_questions()[:4],
            "duplicate": [make_questions()[0], *make_questions()[:4]],
            "blank": [{**card, "answer": " "} if index == 0 else card for index, card in enumerate(make_questions())],
            "not a question": [{**card, "question": "Explain closures"} if index == 0 else card for index, card in enumerate(make_questions())],
            "question type": [{**card, "question": 123} if index == 0 else card for index, card in enumerate(make_questions())],
            "question length": [{**card, "question": "x" * 121} if index == 0 else card for index, card in enumerate(make_questions())],
            "answer length": [{**card, "answer": "x" * 2001} if index == 0 else card for index, card in enumerate(make_questions())],
            "code type": [{**card, "code_example": ["bad"]} if index == 0 else card for index, card in enumerate(make_questions())],
            "code length": [{**card, "code_example": "x" * 3001} if index == 0 else card for index, card in enumerate(make_questions())],
        }
        for label, batch in invalid_batches.items():
            with self.subTest(label=label), self.assertRaises(ValueError):
                validate_generated_question_batch(batch, expected_count=5)


class DiverseInitialSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.main = (API / "main.py").read_text(encoding="utf-8")
        cls.schemas = (API / "schemas" / "schemas.py").read_text(encoding="utf-8")
        cls.page = WEB_PAGE.read_text(encoding="utf-8")
        cls.web_api = WEB_API.read_text(encoding="utf-8")

    def test_lesson_mode_is_explicit_and_uses_one_response_before_preview_install(self) -> None:
        self.assertIn("generation_mode", self.schemas)
        lesson = self.page.split("async function generateDiverseLesson", 1)[1].split("\n  function ", 1)[0]
        self.assertIn("generation_mode: 'lesson'", lesson)
        self.assertIn("count: AI_FLASHCARD_COUNT", lesson)
        self.assertEqual(lesson.count("api.generateStudyFlashcards"), 1)
        self.assertLess(lesson.index("await api.generateStudyFlashcards"), lesson.index("setPendingLessonDraft"))
        self.assertIn("topics.length !== AI_FLASHCARD_COUNT", lesson)

    def test_code_example_flows_from_response_into_canonical_topic(self) -> None:
        self.assertIn("code_example?: string | null", self.web_api)
        converter = self.page.split("function flashcardsToTopics", 1)[1].split("\n  async function", 1)[0]
        self.assertIn("code_example: f.code_example ?? null", converter)

    def test_prompts_are_bounded_and_additional_context_is_capped(self) -> None:
        initial = self.main.split("def generate_diverse_flashcards", 1)[1].split("\n\n# ", 1)[0]
        additional = self.main.split("def generate_diverse_questions", 1)[1].split("\n\n_LEVEL_LABELS", 1)[0]
        self.assertIn("prompt = prompt[:40_000]", initial)
        self.assertIn("existing_fronts[-100:]", additional)
        self.assertIn("linked_questions[-50:]", additional)
        self.assertIn("[:400]", additional)
        self.assertIn("prompt = prompt[:40_000]", additional)
        avoid_builder = self.page.split("function getDiverseAvoidTopics", 1)[1].split("\n}", 1)[0]
        self.assertIn(".slice(-100)", avoid_builder)


def transport() -> httpx.ASGITransport:
    return httpx.ASGITransport(app=main.app, raise_app_exceptions=False)


@asynccontextmanager
async def api_client():
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        login = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if login.status_code != 200:
            raise AssertionError(f"login failed: {login.status_code} {login.text}")
        yield client


async def seed_account() -> None:
    main.on_startup()
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        response = await client.post(
            "/api/auth/register",
            json={
                "first_name": "Parent",
                "last_name": "Test",
                "email": EMAIL,
                "cpf": "52998224725",
                "password": PASSWORD,
                "child_name": "Lia",
            },
        )
        if response.status_code != 201:
            raise AssertionError(f"register failed: {response.status_code} {response.text}")
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        settings = await client.put(
            "/api/ai/settings",
            json={"provider": "gemini", "api_key": "fake-key", "model": "gemini-2.5-flash"},
        )
        if settings.status_code != 200:
            raise AssertionError(f"settings failed: {settings.status_code} {settings.text}")


class DiverseInitialRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        asyncio.run(seed_account())

    def test_lesson_generation_uses_one_call_returns_five_and_keeps_code(self) -> None:
        asyncio.run(self._test_lesson_generation())

    async def _test_lesson_generation(self) -> None:
        captured: dict[str, object] = {"calls": 0}

        def generate(**kwargs):
            captured["calls"] = int(captured["calls"]) + 1
            captured["prompt"] = kwargs["prompt"]
            return json.dumps({"subject": "React", "flashcards": make_questions("Interview")})

        async with api_client() as client:
            with patch.object(main.phrase_generation_service, "generate_json_text", generate):
                response = await client.post(
                    "/api/study/diverse/generate-flashcards",
                    json={"subject": "React", "count": 5, "generation_mode": "lesson"},
                )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(captured["calls"], 1)
        self.assertEqual(len(payload["flashcards"]), 5)
        self.assertEqual(payload["flashcards"][0]["code_example"], "const value1 = 1;")
        prompt = str(captured["prompt"])
        self.assertIn("technical-interview", prompt)
        self.assertIn("exam-style", prompt)
        self.assertIn("code_example", prompt)

    def test_invalid_lesson_count_fails_atomically_after_one_call(self) -> None:
        asyncio.run(self._test_invalid_lesson_count())

    async def _test_invalid_lesson_count(self) -> None:
        calls = 0
        captured_prompt = ""
        with Session(main.engine) as session:
            days_before = len(session.exec(select(main.DiverseDay)).all())

        def generate(**kwargs):
            nonlocal calls, captured_prompt
            calls += 1
            captured_prompt = kwargs["prompt"]
            return json.dumps({"subject": "Historia", "flashcards": make_questions()[:4]})

        async with api_client() as client:
            with patch.object(main.phrase_generation_service, "generate_json_text", generate):
                response = await client.post(
                    "/api/study/diverse/generate-flashcards",
                    json={"subject": "Historia", "count": 5, "generation_mode": "lesson"},
                )
        self.assertEqual(calls, 1)
        self.assertEqual(response.status_code, 502, response.text)
        self.assertIn("five", response.text.lower())
        self.assertIn("technical-interview", captured_prompt)
        self.assertIn("otherwise create exam-style", captured_prompt)
        with Session(main.engine) as session:
            self.assertEqual(len(session.exec(select(main.DiverseDay)).all()), days_before)

    def test_initial_and_additional_prompts_stay_bounded_at_maximum_data(self) -> None:
        asyncio.run(self._test_prompt_bounds())

    async def _test_prompt_bounds(self) -> None:
        initial_prompts: list[str] = []

        def initial_generate(**kwargs):
            initial_prompts.append(kwargs["prompt"])
            return json.dumps({"subject": "Sistemas", "flashcards": make_questions("Bounded initial")})

        async with api_client() as client:
            with patch.object(main.phrase_generation_service, "generate_json_text", initial_generate):
                response = await client.post(
                    "/api/study/diverse/generate-flashcards",
                    json={
                        "subject": "S" * 80,
                        "count": 5,
                        "generation_mode": "lesson",
                        "context": "context " * 125,
                        "avoid_topics": [f"Old {index} " + "x" * 110 for index in range(100)],
                    },
                )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(initial_prompts), 1)
        self.assertLessEqual(len(initial_prompts[0]), 40_000)

        study_date = date(2026, 7, 12)
        topics = [
            {
                "id": f"existing-{index}",
                "topic": f"Existing question {index}? " + "q" * 90,
                "answer": f"Existing answer {index}. " + "a" * 1900,
            }
            for index in range(1, 201)
        ]
        with Session(main.engine) as session:
            child = session.exec(select(main.ChildProfile)).first()
            self.assertIsNotNone(child)
            session.add(
                main.DiverseDay(
                    child_id=child.id,
                    study_date=study_date,
                    custom_subjects=[
                        {
                            "id": "bounded-subject",
                            "name": "Arquitetura de software",
                            "topics": topics,
                            "lessons": [
                                {
                                    "id": "bounded-lesson",
                                    "title": "Trade-offs",
                                    "topic_ids": [f"existing-{index}" for index in range(1, 46)],
                                }
                            ],
                        }
                    ],
                )
            )
            session.commit()

        additional_prompts: list[str] = []

        def additional_generate(**kwargs):
            additional_prompts.append(kwargs["prompt"])
            return json.dumps({"questions": make_questions("Bounded additional")})

        async with api_client() as client:
            with patch.object(main.phrase_generation_service, "generate_json_text", additional_generate):
                response = await client.post(
                    "/api/study/diverse/questions/generate",
                    json={
                        "study_date": study_date.isoformat(),
                        "subject_index": 0,
                        "lesson_id": "bounded-lesson",
                        "context": "context " * 125,
                    },
                )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(additional_prompts), 1)
        prompt = additional_prompts[0]
        self.assertLessEqual(len(prompt), 40_000)
        self.assertIn("Existing question 200?", prompt)
        self.assertNotIn("Existing question 100?", prompt)
        self.assertNotIn("a" * 401, prompt)


if __name__ == "__main__":
    unittest.main()
