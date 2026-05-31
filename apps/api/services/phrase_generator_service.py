from __future__ import annotations

import json
import os
from typing import Any

import requests

from schemas.schemas import GeneratedLessonDraftSchema


class PhraseGenerationService:
    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
        self.api_base_url = os.getenv("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
        self.timeout_seconds = int(os.getenv("GEMINI_REQUEST_TIMEOUT_SECONDS", "45"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_lesson_draft(
        self,
        *,
        next_day: int,
        age_group: str,
        existing_phrases: list[str],
        topic: str | None = None,
        level: int = 1,
        target_language: str = "English",
    ) -> GeneratedLessonDraftSchema:
        if not self.is_configured():
            raise RuntimeError("GEMINI_API_KEY nao esta configurada no backend.")

        payload = {
            "system_instruction": {
                "parts": [
                    {
                        "text": (
                            f"You create child-safe {target_language} lessons for Brazilian Portuguese speakers. "
                            "Always return valid JSON only, with no markdown fences, no commentary, and no extra keys."
                        )
                    }
                ]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": self._build_prompt(
                                next_day=next_day,
                                age_group=age_group,
                                existing_phrases=existing_phrases,
                                topic=topic,
                                level=level,
                                target_language=target_language,
                            )
                        }
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.8,
                "responseMimeType": "application/json",
            },
        }

        url = f"{self.api_base_url}/models/{self.model}:generateContent"
        try:
            response = requests.post(
                url,
                headers={
                    "x-goog-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        response_text = self._extract_response_text(response.json())
        try:
            draft_payload = json.loads(self._strip_code_fences(response_text))
        except json.JSONDecodeError as exc:
            raise RuntimeError("Gemini returned invalid JSON for the lesson draft.") from exc

        draft = GeneratedLessonDraftSchema.model_validate(draft_payload)
        self._validate_draft(draft)
        return draft

    def _build_prompt(
        self,
        *,
        next_day: int,
        age_group: str,
        existing_phrases: list[str],
        topic: str | None,
        level: int = 1,
        target_language: str = "English",
    ) -> str:
        topic_text = topic.strip() if topic else ""
        recent_phrase_list = existing_phrases[-24:] if len(existing_phrases) > 24 else existing_phrases
        existing_text = "\n".join(f"- {phrase}" for phrase in recent_phrase_list) or "- none yet"

        topic_instruction = (
            f'Theme preference: "{topic_text}". Keep the three phrases connected to that theme.\n'
            if topic_text
            else "Theme preference: choose one practical daily-life theme for a child.\n"
        )

        # Map level (1-10) to difficulty guidance
        clamped = max(1, min(10, level))
        if clamped <= 2:
            difficulty_note = (
                "Difficulty: BEGINNER (level 1-2). Use very simple words only: greetings, colors, numbers, "
                "single-word or 2-word phrases (e.g. 'Hello', 'Good morning', 'Red ball'). "
                "English should be so easy a 4-year-old could repeat it."
            )
        elif clamped <= 4:
            difficulty_note = (
                "Difficulty: ELEMENTARY (level 3-4). Use short phrases of 3-5 words covering everyday "
                "objects, feelings and actions (e.g. 'I like cats', 'Where is my bag?')."
            )
        elif clamped <= 6:
            difficulty_note = (
                "Difficulty: INTERMEDIATE (level 5-6). Use complete simple sentences with a subject, "
                "verb and object. Include present-simple and present-continuous tenses "
                "(e.g. 'She is reading a book', 'Can I have some water?')."
            )
        elif clamped <= 8:
            difficulty_note = (
                "Difficulty: UPPER-INTERMEDIATE (level 7-8). Use compound sentences, past tense and "
                "common idioms appropriate for children "
                "(e.g. 'I went to the park yesterday', 'It is raining cats and dogs')."
            )
        else:
            difficulty_note = (
                "Difficulty: ADVANCED (level 9-10). Use richer vocabulary, varied tenses and natural "
                "idiomatic expressions suitable for a confident child learner "
                "(e.g. 'If you practice every day, you will improve quickly')."
            )

        return (
            f"Create the content for {target_language} for today - Day {next_day}.\n"
            f"Child age group: {age_group}.\n"
            f"{difficulty_note}\n"
            f"{topic_instruction}"
            f"Native language for translations: Brazilian Portuguese.\n"
            "Rules:\n"
            f"- Generate exactly 3 short, useful {target_language} phrases for one day of study.\n"
            "- Make them safe, friendly, and practical for a child.\n"
            "- Do not reuse or closely paraphrase any existing phrase listed below.\n"
            "- Keep the output suitable for a Brazilian Portuguese speaker.\n"
            f"- Each phrase must include a natural Portuguese translation of the {target_language} phrase.\n"
            "- Each phrase must include a word_by_word array in the same order as the target-language phrase.\n"
            "- Each phrase must include short teaching notes in example_sentence_en and example_sentence_pt.\n"
            "- Keep example sentences descriptive, simple, and under 18 words when possible.\n"
            "- Return JSON only using this exact shape:\n"
            "{\n"
            '  "phrases": [\n'
            "    {\n"
            '      "phrase_en": "string",\n'
            '      "phrase_pt": "string",\n'
            '      "example_sentence_en": "string",\n'
            '      "example_sentence_pt": "string",\n'
            '      "word_by_word": [\n'
            '        { "en": "string", "pt": "string" }\n'
            "      ]\n"
            "    }\n"
            "  ]\n"
            "}\n"
            "Existing phrases to avoid:\n"
            f"{existing_text}\n"
        )

    def _extract_response_text(self, payload: dict[str, Any]) -> str:
        candidates = payload.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            for part in parts:
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    return text

        prompt_feedback = payload.get("promptFeedback") or {}
        block_reason = prompt_feedback.get("blockReason")
        if block_reason:
            raise RuntimeError(f"Gemini blocked the request: {block_reason}")

        raise RuntimeError("Gemini returned no text content for the lesson draft.")

    def _strip_code_fences(self, text: str) -> str:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        return cleaned.strip()

    def _validate_draft(self, draft: GeneratedLessonDraftSchema) -> None:
        if len(draft.phrases) != 3:
            raise RuntimeError("Gemini must return exactly 3 phrases.")

        seen_phrases: set[str] = set()
        for phrase in draft.phrases:
            normalized = phrase.phrase_en.strip().lower()
            if normalized in seen_phrases:
                raise RuntimeError("Gemini returned duplicate English phrases.")
            seen_phrases.add(normalized)

            if not phrase.word_by_word:
                raise RuntimeError("Each generated phrase must include word-by-word translations.")
