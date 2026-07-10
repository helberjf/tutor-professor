from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="programming-flashcards-api-"))
DB_PATH = TMP_DIR / "test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "programming-flashcards-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(API))

import httpx
from pydantic import ValidationError
from sqlmodel import Session, select

import main
from schemas.schemas import GenerateAdditionalFlashcardsSchema
from services import coding_service


VALID_CPF = "52998224725"


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def database_counts() -> tuple[int, int]:
    with Session(main.engine) as session:
        cards = session.exec(select(main.ProgrammingFlashcard)).all()
        review_items = session.exec(select(main.CodingReviewItem)).all()
        return len(cards), len(review_items)


def make_cards(prefix: str) -> list[dict[str, str]]:
    return [
        {
            "front": f"{prefix} interview question {index}?",
            "back": f"Answer {index}",
            "code_example": f"const value{index} = {index};",
        }
        for index in range(1, 6)
    ]


class ProgrammingAIFlashcardTests(unittest.TestCase):
    def test_initial_prompt_requires_interview_cards_from_same_lesson_and_code(self):
        prompt = coding_service._TOPIC_PROMPT_TEMPLATE.lower()

        self.assertIn("technical interview", prompt)
        self.assertIn("sections from this same json response", prompt)
        self.assertIn("reuse relevant code", prompt)
        self.assertIn("reasoning", prompt)
        self.assertIn("trade-offs", prompt)
        self.assertIn("debugging", prompt)
        self.assertIn("common pitfalls", prompt)
        self.assertIn("practical application", prompt)

    def test_additional_generator_sends_one_call_with_all_source_context(self):
        response = {"flashcards": make_cards("Closure")}
        ai_content = {
            "sections": [
                {
                    "title": "Closures",
                    "body": "A closure captures lexical scope.",
                    "code_example": "const add = x => y => x + y;",
                }
            ]
        }

        with patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps(response),
        ) as generate:
            cards = coding_service.generate_additional_topic_flashcards(
                subject_name="JavaScript",
                topic_title="Functions",
                ai_content=ai_content,
                existing_fronts=["What is lexical scope?"],
                user_context="Focus on debugging callbacks",
                ai_config=object(),
            )

        self.assertEqual(len(cards), 5)
        generate.assert_called_once()
        prompt_text = generate.call_args.kwargs["prompt"]
        for expected in (
            "JavaScript",
            "Functions",
            "Closures",
            "const add = x => y => x + y;",
            "What is lexical scope?",
            "Focus on debugging callbacks",
        ):
            self.assertIn(expected, prompt_text)

    def test_request_schema_has_optional_context_limited_to_1000_characters(self):
        self.assertIsNone(GenerateAdditionalFlashcardsSchema().context)
        self.assertEqual(
            len(GenerateAdditionalFlashcardsSchema(context="x" * 1000).context or ""),
            1000,
        )
        with self.assertRaises(ValidationError):
            GenerateAdditionalFlashcardsSchema(context="x" * 1001)

    def test_real_route_appends_atomically_and_rejects_invalid_batches(self):
        asyncio.run(self._exercise_real_route())

    async def _exercise_real_route(self) -> None:
        main.on_startup()
        transport = httpx.ASGITransport(app=main.app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            register = await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Parent",
                    "last_name": "Test",
                    "email": "flashcards@example.com",
                    "cpf": VALID_CPF,
                    "password": "secret123",
                    "child_name": "Lia",
                },
            )
            assert_status(register, 201, "register")
            assert_status(
                await client.post(
                    "/api/auth/login",
                    json={"email": "flashcards@example.com", "password": "secret123"},
                ),
                200,
                "login",
            )
            assert_status(
                await client.put(
                    "/api/ai/settings",
                    json={
                        "provider": "gemini",
                        "api_key": "fake-test-key",
                        "model": "gemini-2.5-flash",
                    },
                ),
                200,
                "save fake AI config",
            )

            subject_response = await client.post(
                "/api/coding/subjects", json={"name": "JavaScript"}
            )
            assert_status(subject_response, 201, "create subject")
            subject_id = subject_response.json()["id"]
            topic_response = await client.post(
                f"/api/coding/subjects/{subject_id}/topics",
                json={"title": "Closures", "generate_ai": False},
            )
            assert_status(topic_response, 201, "create topic")
            topic_id = topic_response.json()["id"]
            ai_content = {
                "sections": [
                    {
                        "title": "Lexical scope",
                        "body": "Closures retain variables from their lexical scope.",
                        "code_example": "const add = x => y => x + y;",
                    }
                ],
                "quiz": [],
                "flashcards": [],
            }
            assert_status(
                await client.put(
                    f"/api/coding/topics/{topic_id}",
                    json={"ai_content": ai_content},
                ),
                200,
                "save lesson content",
            )
            existing_front = "How does a closure retain lexical state?"
            existing_back = "Through lexical scope."
            existing_code = "const savedValue = 42;"
            existing_response = await client.post(
                f"/api/coding/topics/{topic_id}/flashcards",
                json={
                    "front": existing_front,
                    "back": existing_back,
                    "code_example": existing_code,
                },
            )
            assert_status(existing_response, 201, "seed existing card")
            existing_before = existing_response.json()
            existing_id = existing_before["id"]
            before_cards, before_reviews = database_counts()

            captured: dict[str, object] = {"calls": 0}

            def fake_generator(**kwargs):
                captured["calls"] = int(captured["calls"]) + 1
                captured.update(kwargs)
                return make_cards("New closure")

            raw_context = "  Focus\n  on debugging callbacks  "
            with patch.object(main, "generate_additional_topic_flashcards", fake_generator):
                generated_response = await client.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate",
                    json={"context": raw_context},
                )

            assert_status(generated_response, 200, "append generated cards")
            generated = generated_response.json()
            self.assertEqual(len(generated), 5)
            self.assertEqual(captured["calls"], 1)
            self.assertEqual(captured["subject_name"], "JavaScript")
            self.assertEqual(captured["topic_title"], "Closures")
            self.assertEqual(captured["ai_content"], ai_content)
            self.assertEqual(captured["existing_fronts"], [existing_front])
            self.assertEqual(captured["user_context"], "Focus on debugging callbacks")
            self.assertEqual(
                captured["ai_config"],
                main.AIProviderConfig(
                    provider="gemini",
                    api_key="fake-test-key",
                    model="gemini-2.5-flash",
                    base_url=None,
                ),
            )

            listed_response = await client.get(
                f"/api/coding/topics/{topic_id}/flashcards"
            )
            assert_status(listed_response, 200, "list appended cards")
            listed = listed_response.json()
            self.assertEqual(len(listed), 6)
            existing_after = next(card for card in listed if card["id"] == existing_id)
            self.assertEqual(existing_after["front"], existing_before["front"])
            self.assertEqual(existing_after["back"], existing_before["back"])
            self.assertEqual(
                existing_after["code_example"], existing_before["code_example"]
            )

            generated_ids = {card["id"] for card in generated}
            with Session(main.engine) as session:
                review_items = session.exec(select(main.CodingReviewItem)).all()
                generated_review_ids = {
                    item.flashcard_id
                    for item in review_items
                    if item.flashcard_id in generated_ids
                }
            self.assertEqual(generated_review_ids, generated_ids)
            self.assertEqual(database_counts(), (before_cards + 5, before_reviews + 5))

            stable_counts = database_counts()
            duplicate_batch = make_cards("Duplicate")
            duplicate_batch[1]["front"] = duplicate_batch[0]["front"]
            with patch.object(
                main,
                "generate_additional_topic_flashcards",
                return_value=duplicate_batch,
            ) as invalid_generator:
                invalid_response = await client.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate",
                    json={"context": None},
                )
            self.assertEqual(invalid_response.status_code, 502)
            invalid_generator.assert_called_once()
            self.assertEqual(database_counts(), stable_counts)

            rollback_calls = 0
            original_rollback = main.Session.rollback

            def tracking_rollback(session, *args, **kwargs):
                nonlocal rollback_calls
                rollback_calls += 1
                return original_rollback(session, *args, **kwargs)

            with patch.object(
                main,
                "generate_additional_topic_flashcards",
                return_value=make_cards("Commit failure"),
            ) as failed_generator, patch.object(
                main.Session,
                "commit",
                side_effect=RuntimeError("controlled commit failure"),
            ), patch.object(
                main.Session,
                "rollback",
                tracking_rollback,
            ):
                failed_response = await client.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate",
                    json={"context": "test rollback"},
                )
            self.assertEqual(failed_response.status_code, 500)
            failed_generator.assert_called_once()
            self.assertGreaterEqual(rollback_calls, 1)
            self.assertEqual(database_counts(), stable_counts)


if __name__ == "__main__":
    unittest.main()
