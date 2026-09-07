"""A review question must be readable by the child answering it.

The generator is told to write questions in the target language, so a French
lesson can produce a card a Portuguese-speaking child cannot even read. Every
question now carries front_pt, its Portuguese reading, all the way to the
review card.

The translation is a nice-to-have, never a gate: a provider reply that omits it
still yields five usable questions, and questions stored before the column
existed keep working with no translation shown.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-qtrans-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'q.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "qtrans-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "qtrans@example.com"

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from sqlmodel import Session  # noqa: E402

import main  # noqa: E402
from models.database import ChildProfile, LessonQuestion  # noqa: E402
from services.language_question_service import validate_language_question_batch  # noqa: E402
from services.review_service import build_mixed_review_cards  # noqa: E402

REVIEW_PAGE = REPO_ROOT / "apps" / "web" / "src" / "app" / "review" / "page.tsx"
QUESTION_SERVICE = API_DIR / "services" / "language_question_service.py"
LESSON_GENERATOR = API_DIR / "services" / "phrase_generator_service.py"


def batch(**overrides) -> list[dict]:
    """Five questions of three distinct types, the minimum a batch must have."""
    questions = [
        {"front": "Comment dit-on bonjour ?", "front_pt": "Como se diz bom dia?",
         "back": "Bonjour.", "question_type": "translation"},
        {"front": "Que signifie merci ?", "front_pt": "O que significa merci?",
         "back": "Obrigado.", "question_type": "vocabulary"},
        {"front": "Complete: Je ___ Ana ?", "front_pt": "Complete: Je ___ Ana?",
         "back": "m'appelle", "question_type": "sentence_completion"},
        {"front": "Quel pronom pour eu ?", "front_pt": "Qual pronome para eu?",
         "back": "Je.", "question_type": "grammar"},
        {"front": "Que repondre a ca va ?", "front_pt": "O que responder a ca va?",
         "back": "Ca va bien.", "question_type": "contextual_usage"},
    ]
    if overrides:
        questions[0] = {**questions[0], **overrides}
    return questions


class TranslationValidationTests(unittest.TestCase):
    def test_translation_is_kept_through_validation(self) -> None:
        validated = validate_language_question_batch(batch(), [])
        self.assertEqual(validated[0].front_pt, "Como se diz bom dia?")
        self.assertTrue(all(question.front_pt for question in validated))

    def test_a_reply_without_translations_still_yields_five_questions(self) -> None:
        without = [{k: v for k, v in q.items() if k != "front_pt"} for q in batch()]
        validated = validate_language_question_batch(without, [])
        self.assertEqual(len(validated), 5, "a missing translation must not fail the batch")
        self.assertIsNone(validated[0].front_pt)

    def test_an_empty_translation_becomes_none_rather_than_blank_text(self) -> None:
        validated = validate_language_question_batch(batch(front_pt="   "), [])
        self.assertIsNone(validated[0].front_pt)

    def test_an_over_long_translation_is_trimmed_not_rejected(self) -> None:
        validated = validate_language_question_batch(batch(front_pt="x" * 900), [])
        self.assertEqual(len(validated[0].front_pt), 500)
        self.assertEqual(len(validated), 5)

    def test_a_translation_of_the_wrong_type_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            validate_language_question_batch(batch(front_pt=123), [])


class PromptContractTests(unittest.TestCase):
    def test_both_generators_ask_for_the_translation(self) -> None:
        # Questions are created on two paths: the standalone generator and the
        # one that writes a whole lesson. Both have to request front_pt or half
        # the questions arrive untranslated.
        self.assertIn("front_pt", QUESTION_SERVICE.read_text(encoding="utf-8"))
        self.assertIn("front_pt", LESSON_GENERATOR.read_text(encoding="utf-8"))


class ReviewCardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        main.on_startup()

    def _child_with_question(self, front_pt: str | None) -> int:
        with Session(main.engine) as session:
            child = ChildProfile(name=f"c-{front_pt!r}", age_group="7-9", target_language="French")
            session.add(child)
            session.commit()
            session.refresh(child)
            session.add(LessonQuestion(
                child_id=child.id or 0, lesson_id=1, target_language="French",
                question_type="translation", front="Comment dit-on bonjour ?",
                front_pt=front_pt, front_key=f"key-{child.id}", back="Bonjour.",
            ))
            session.commit()
            return child.id or 0

    def test_the_card_carries_the_translation_to_the_screen(self) -> None:
        child_id = self._child_with_question("Como se diz bom dia?")
        with Session(main.engine) as session:
            cards = build_mixed_review_cards(session=session, child_id=child_id)
        question_cards = [c for c in cards if c["card_type"] == "lesson_question"]
        self.assertEqual(len(question_cards), 1)
        self.assertEqual(question_cards[0]["prompt_pt"], "Como se diz bom dia?")

    def test_a_question_stored_before_translations_still_builds_a_card(self) -> None:
        child_id = self._child_with_question(None)
        with Session(main.engine) as session:
            cards = build_mixed_review_cards(session=session, child_id=child_id)
        question_cards = [c for c in cards if c["card_type"] == "lesson_question"]
        self.assertEqual(len(question_cards), 1)
        self.assertIsNone(question_cards[0]["prompt_pt"])


class ReviewScreenTests(unittest.TestCase):
    def test_the_screen_hides_a_translation_that_only_repeats_the_question(self) -> None:
        page = REVIEW_PAGE.read_text(encoding="utf-8")
        self.assertIn("card.prompt_pt", page)
        self.assertIn("card.prompt_pt.trim() !== card.prompt.trim()", page)


if __name__ == "__main__":
    unittest.main()
