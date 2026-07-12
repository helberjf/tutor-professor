"""Initial language lesson generation must persist canonical questions atomically."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlmodel import Session, SQLModel, create_engine, select


ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(API_DIR))

import main  # noqa: E402
from models.database import ChildProfile, Lesson, LessonItem, LessonQuestion  # noqa: E402
from schemas.schemas import GenerateLessonRequestSchema  # noqa: E402
from services.phrase_generator_service import AIProviderConfig  # noqa: E402


def combined_lesson_payload(*, valid: bool = True) -> str:
    questions = [
        {
            "front": "Comment dit-on bonjour en portugais ?",
            "back": "Olá.",
            "question_type": "translation",
            "supporting_example": "Bonjour, Léa !",
        },
        {
            "front": "Quel mot complète la phrase : Je ___ Léa ?",
            "back": "m'appelle",
            "question_type": "sentence_completion",
            "supporting_example": None,
        },
        {
            "front": "Quel pronom français signifie eu ?",
            "back": "Je.",
            "question_type": "grammar",
            "supporting_example": "Je suis ici.",
        },
        {
            "front": "Que signifie merci en portugais ?",
            "back": "Obrigado ou obrigada.",
            "question_type": "vocabulary",
            "supporting_example": None,
        },
        {
            "front": "Comment répond-on poliment à Comment ça va ?",
            "back": "Ça va bien, merci.",
            "question_type": "contextual_usage",
            "supporting_example": "Ça va bien, merci !",
        },
    ]
    if not valid:
        questions[-1]["front"] = questions[0]["front"]
    return json.dumps(
        {
            "phrases": [
                {
                    "phrase_en": "Bonjour",
                    "phrase_pt": "Olá",
                    "example_sentence_en": "Bonjour, Léa !",
                    "example_sentence_pt": "Olá, Léa!",
                    "word_by_word": [{"en": "Bonjour", "pt": "Olá"}],
                },
                {
                    "phrase_en": "Je m'appelle Léa",
                    "phrase_pt": "Eu me chamo Léa",
                    "example_sentence_en": "Je m'appelle Léa.",
                    "example_sentence_pt": "Eu me chamo Léa.",
                    "word_by_word": [
                        {"en": "Je", "pt": "Eu"},
                        {"en": "m'appelle", "pt": "me chamo"},
                        {"en": "Léa", "pt": "Léa"},
                    ],
                },
                {
                    "phrase_en": "Merci beaucoup",
                    "phrase_pt": "Muito obrigado",
                    "example_sentence_en": "Merci beaucoup, maman !",
                    "example_sentence_pt": "Muito obrigado, mamãe!",
                    "word_by_word": [
                        {"en": "Merci", "pt": "Obrigado"},
                        {"en": "beaucoup", "pt": "muito"},
                    ],
                },
            ],
            "questions": questions,
        },
        ensure_ascii=False,
    )


class InitialLanguageLessonGenerationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.child = ChildProfile(
            id=1,
            user_id=7,
            name="Léa",
            age_group="10-12",
            base_language="Portuguese",
            target_language="French",
        )
        self.session.add(self.child)
        self.session.commit()
        self.config = AIProviderConfig(
            provider="gemini",
            api_key="test-key",
            model="test-model",
        )

    def tearDown(self) -> None:
        self.session.close()
        SQLModel.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _common_patches(self, provider):
        return (
            patch.object(main, "require_parent_session", return_value=SimpleNamespace(user_id=7)),
            patch.object(main, "_get_user_ai_config", return_value=self.config),
            patch.object(main, "_get_user_ai_config_for_user_id", return_value=self.config),
            patch.object(main, "get_requested_child", return_value=self.child),
            patch.object(main, "compute_and_update_child_level", return_value=1),
            patch.object(main.phrase_generation_service, "generate_json_text", side_effect=provider),
        )

    def test_parent_route_uses_one_provider_call_and_returns_five_persisted_questions(self) -> None:
        calls = 0

        def provider(**_kwargs) -> str:
            nonlocal calls
            calls += 1
            return combined_lesson_payload()

        patches = self._common_patches(provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            response = main.generate_parent_lesson(
                object(), GenerateLessonRequestSchema(topic="Salutations", quantity=1), self.session
            )

        self.assertEqual(calls, 1)
        self.assertEqual(len(response.lesson.questions), 5)
        self.assertEqual({item.target_language for item in response.lesson.questions}, {"French"})
        lesson_id = response.lesson.id
        persisted = self.session.exec(
            select(LessonQuestion).where(
                LessonQuestion.child_id == (self.child.id or 0),
                LessonQuestion.lesson_id == lesson_id,
            )
        ).all()
        self.assertEqual(len(persisted), 5)
        self.assertTrue(all(question.front.endswith("?") for question in persisted))

    def test_auto_generation_uses_one_provider_call_and_exposes_five_questions(self) -> None:
        calls = 0

        def provider(**_kwargs) -> str:
            nonlocal calls
            calls += 1
            return combined_lesson_payload()

        patches = self._common_patches(provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            lesson = main.auto_generate_lesson_for_child(self.session, self.child)

        response = main.build_lesson_response(self.session, lesson, self.child.id or 0)
        self.assertEqual(calls, 1)
        self.assertEqual(len(response.questions), 5)
        self.assertEqual({question.lesson_id for question in response.questions}, {lesson.id})

    def test_invalid_question_batch_rolls_back_lesson_items_and_questions(self) -> None:
        calls = 0

        def provider(**_kwargs) -> str:
            nonlocal calls
            calls += 1
            return combined_lesson_payload(valid=False)

        patches = self._common_patches(provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            with self.assertRaises(main.HTTPException) as raised:
                main.generate_parent_lesson(
                    object(), GenerateLessonRequestSchema(topic="Salutations", quantity=1), self.session
                )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(calls, 1)
        self.assertEqual(self.session.exec(select(Lesson)).all(), [])
        self.assertEqual(self.session.exec(select(LessonItem)).all(), [])
        self.assertEqual(self.session.exec(select(LessonQuestion)).all(), [])


if __name__ == "__main__":
    unittest.main()
