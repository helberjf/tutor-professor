import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
sys.path.insert(0, str(API))

from services import coding_service


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
        response = {
            "flashcards": [
                {"front": f"Question {index}?", "back": f"Answer {index}"}
                for index in range(1, 6)
            ]
        }
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
            return_value=__import__("json").dumps(response),
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
        prompt = generate.call_args.kwargs["prompt"]
        for expected in (
            "JavaScript",
            "Functions",
            "Closures",
            "const add = x => y => x + y;",
            "What is lexical scope?",
            "Focus on debugging callbacks",
        ):
            self.assertIn(expected, prompt)

    def test_schema_and_atomic_append_route_contract(self):
        schemas = (API / "schemas" / "schemas.py").read_text(encoding="utf-8")
        main = (API / "main.py").read_text(encoding="utf-8")

        self.assertIn("class GenerateAdditionalFlashcardsSchema", schemas)
        schema_block = schemas.split("class GenerateAdditionalFlashcardsSchema", 1)[1].split("\n\n", 1)[0]
        self.assertIn("context: Optional[str]", schema_block)
        self.assertIn("max_length=1000", schema_block)

        self.assertIn('@app.post("/api/coding/topics/{topic_id}/flashcards/generate"', main)
        route = main.split("def generate_additional_coding_flashcards", 1)[1].split("\n@app.", 1)[0]
        self.assertIn("sanitize_context", route)
        self.assertIn("validate_card_batch", route)
        self.assertIn("generate_additional_topic_flashcards", route)
        self.assertIn("seed_coding_review_item", route)
        self.assertEqual(route.count("session.commit()"), 1)
        self.assertNotIn("session.delete(", route)
        self.assertIn("existing_fronts", route)
        self.assertIn("list[ProgrammingFlashcardSchema]", main)


if __name__ == "__main__":
    unittest.main()
