import unittest
from dataclasses import FrozenInstanceError
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

    def test_sanitize_context_is_limited_to_1000_characters(self):
        self.assertEqual(len(sanitize_context("x" * 1001)), 1000)

    def test_valid_batch_returns_five_cards_and_preserves_code_example(self):
        cards = validate_card_batch(make_cards(), existing_fronts=[])

        self.assertEqual(len(cards), 5)
        self.assertEqual(cards[0].front, "Question 1?")
        self.assertEqual(cards[0].code_example, "print(1)")

    def test_rejects_batch_without_exactly_five_cards(self):
        with self.assertRaises(ValueError):
            validate_card_batch(make_cards()[:4], existing_fronts=[])

    def test_rejects_non_mapping_card_items_with_controlled_error(self):
        for invalid_cards in ([None] * 5, [object()] * 5):
            with self.subTest(item=invalid_cards[0]):
                with self.assertRaises(ValueError):
                    validate_card_batch(invalid_cards, existing_fronts=[])

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

    def test_accepts_question_and_answer_aliases(self):
        cards = [
            {"question": f"Alias question {index}", "answer": f"Alias answer {index}"}
            for index in range(1, 6)
        ]

        validated = validate_card_batch(cards, existing_fronts=[])

        self.assertEqual(validated[0].front, "Alias question 1")
        self.assertEqual(validated[0].back, "Alias answer 1")

    def test_uses_aliases_when_primary_fields_are_empty(self):
        cards = make_cards()
        cards[0] = {
            "front": "",
            "question": "Fallback question",
            "back": "",
            "answer": "Fallback answer",
        }

        validated = validate_card_batch(cards, existing_fronts=[])

        self.assertEqual(validated[0].front, "Fallback question")
        self.assertEqual(validated[0].back, "Fallback answer")

    def test_rejects_front_containing_only_punctuation(self):
        cards = make_cards()
        cards[0]["front"] = "?!..."

        with self.assertRaises(ValueError):
            validate_card_batch(cards, existing_fronts=[])

    def test_limits_returned_card_fields(self):
        cards = make_cards()
        cards[0] = {
            "front": "f" * 501,
            "back": "b" * 2001,
            "code_example": "c" * 3001,
            "question_type": "t" * 41,
        }

        validated = validate_card_batch(cards, existing_fronts=[])

        self.assertEqual(len(validated[0].front), 500)
        self.assertEqual(len(validated[0].back), 2000)
        self.assertEqual(len(validated[0].code_example or ""), 3000)
        self.assertEqual(len(validated[0].question_type or ""), 40)

    def test_validated_card_is_immutable(self):
        card = validate_card_batch(make_cards(), existing_fronts=[])[0]

        with self.assertRaises(FrozenInstanceError):
            card.front = "Changed"


if __name__ == "__main__":
    unittest.main()
