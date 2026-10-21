"""Book token budgets and bounded requests, with all provider calls stubbed."""
import json
import inspect
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from pydantic import ValidationError
from schemas.schemas import BookOutlineSchema, GenerateBookPageRequestSchema, GeneratedBookPageDraftSchema
from services.book_service import BookGenerationService
from services.phrase_generator_service import AIProviderConfig, PhraseGenerationService


def outline():
    return BookOutlineSchema(title="Test", theme="colors", synopsis="A short story.", level=1, num_pages=2,
                             page_outlines=[{"page_number": i, "scene": f"Scene {i}"} for i in (1, 2)])


class BookBudgetTests(unittest.TestCase):
    def setUp(self):
        self.service = BookGenerationService()
        self.config = AIProviderConfig(provider="gemini", api_key="synthetic", model="test")

    def test_page_call_has_small_output_budget(self):
        data = {"page_number": 1, "text_en": "The cat is blue.", "text_pt": "O gato é azul.", "vocabulary": ["cat", "blue"]}
        with patch.object(self.service.text_generation_service, "generate_json_text", return_value=json.dumps(data)) as generate:
            self.service.generate_page(level=1, outline=outline(), page_number=1, context_pages=[], ai_config=self.config)
        self.assertGreater(generate.call_args.kwargs.get("max_output_tokens", 0), 0)
        self.assertLessEqual(generate.call_args.kwargs["max_output_tokens"], 1200)

    def test_outline_call_has_output_budget(self):
        with patch.object(self.service.text_generation_service, "generate_json_text", return_value=outline().model_dump_json()) as generate:
            self.service.generate_outline(level=1, num_pages=2, ai_config=self.config)
        self.assertGreater(generate.call_args.kwargs.get("max_output_tokens", 0), 0)
        self.assertLessEqual(generate.call_args.kwargs["max_output_tokens"], 2000)

    def test_page_failure_does_not_automatically_spend_again(self):
        with patch.object(self.service.text_generation_service, "generate_json_text", return_value="invalid JSON") as generate:
            with self.assertRaises(RuntimeError):
                self.service.generate_page(level=1, outline=outline(), page_number=1, context_pages=[], ai_config=self.config)
        self.assertEqual(generate.call_count, 1)

    def test_full_book_failure_does_not_automatically_spend_again(self):
        with patch.object(self.service.text_generation_service, "generate_json_text", return_value="invalid JSON") as generate:
            with self.assertRaises(RuntimeError):
                self.service.generate_book(level=1, num_pages=2, ai_config=self.config)
        self.assertEqual(generate.call_count, 1)

    def test_oversized_context_is_rejected(self):
        with self.assertRaises(ValidationError):
            GenerateBookPageRequestSchema(outline=outline(), page_number=1,
                context_pages=[{"page_number": 1, "text_en": "x" * 10000, "text_pt": "x", "vocabulary": []}])

    def test_inconsistent_outline_is_rejected(self):
        data = outline().model_dump()
        data["page_outlines"] = [data["page_outlines"][0]] * 2
        with self.assertRaises(ValidationError):
            BookOutlineSchema.model_validate(data)

    def test_page_output_is_validated_not_replaced_with_dots(self):
        with patch.object(self.service.text_generation_service, "generate_json_text", return_value='{}'):
            with self.assertRaises(RuntimeError):
                self.service.generate_page(level=1, outline=outline(), page_number=1, context_pages=[], ai_config=self.config)

    def test_invalid_provider_outline_is_a_controlled_error(self):
        data = outline().model_dump()
        data["page_outlines"] = data["page_outlines"][:1]
        with patch.object(self.service.text_generation_service, "generate_json_text", return_value=json.dumps(data)):
            with self.assertRaises(RuntimeError):
                self.service.generate_outline(level=1, num_pages=2, ai_config=self.config)

    def test_budget_reaches_each_provider(self):
        self.assertIn("max_output_tokens", inspect.signature(PhraseGenerationService.generate_json_text).parameters)
        for provider in ("gemini", "openai", "anthropic", "groq"):
            with self.subTest(provider=provider):
                config = AIProviderConfig(provider=provider, api_key="synthetic", model="test")
                with patch("services.phrase_generator_service.requests.post") as post:
                    post.return_value.json.return_value = {
                        "candidates": [{"content": {"parts": [{"text": "{}"}]}}],
                        "choices": [{"message": {"content": "{}"}}],
                        "content": [{"type": "text", "text": "{}"}],
                    }
                    PhraseGenerationService().generate_json_text(system_text="JSON", prompt="test", temperature=0.3,
                                                                ai_config=config, max_output_tokens=900)
                payload = post.call_args.kwargs["json"]
                actual = payload["generationConfig"]["maxOutputTokens"] if provider == "gemini" else payload[
                    "max_completion_tokens" if provider == "openai" else "max_tokens"]
                self.assertEqual(actual, 900)


if __name__ == "__main__":
    unittest.main()
