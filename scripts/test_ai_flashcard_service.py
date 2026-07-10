import unittest
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apps.api.services.ai_flashcard_service import sanitize_context, validate_card_batch


def make_cards():
    return [
        {
            "front": f"Question {index}?",
            "back": f"Answer {index}",
            "code_example": f"print({index})",
        }
        for index in range(1, 6)
    ]


class AIFlashcardServiceTests(unittest.TestCase):
    def test_sanitize_context_collapses_whitespace(self):
        self.assertEqual(sanitize_context("  foque\n em hooks  "), "foque em hooks")

    def test_valid_batch_returns_five_cards_and_preserves_code_example(self):
        cards = validate_card_batch(make_cards(), existing_fronts=[])

        self.assertEqual(len(cards), 5)
        self.assertEqual(cards[0].front, "Question 1?")
        self.assertEqual(cards[0].code_example, "print(1)")

    def test_rejects_batch_without_exactly_five_cards(self):
        with self.assertRaises(ValueError):
            validate_card_batch(make_cards()[:4], existing_fronts=[])

    def test_rejects_duplicate_questions_in_batch(self):
        cards = make_cards()
        cards[1]["front"] = "  QUESTION 1!!!  "

        with self.assertRaises(ValueError):
            validate_card_batch(cards, existing_fronts=[])

    def test_rejects_question_already_in_existing_fronts(self):
        with self.assertRaises(ValueError):
            validate_card_batch(make_cards(), existing_fronts=["question 1"])

    def test_rejects_empty_fields(self):
        cards = make_cards()
        cards[2]["back"] = "   "

        with self.assertRaises(ValueError):
            validate_card_batch(cards, existing_fronts=[])


if __name__ == "__main__":
    unittest.main()
