from __future__ import annotations

import json
import os

import requests

from schemas.schemas import GeneratedBookDraftSchema


_LEVEL_DIFFICULTY: dict[tuple[int, int], str] = {
    (1, 2): (
        "BEGINNER (level 1-2). Use only the simplest words: colors, animals, family, numbers, greetings. "
        "Sentences of 4-6 words max. Vocabulary: everyday items a 4-year-old knows. "
        "Example sentence: 'The cat is red. I have a ball.'"
    ),
    (3, 4): (
        "ELEMENTARY (level 3-4). Simple sentences with subject + verb + object. "
        "Topics: home, school, food, weather, simple actions. "
        "Sentences of 6-10 words. Introduce common verbs: eat, play, go, see, want."
    ),
    (5, 6): (
        "INTERMEDIATE (level 5-6). Use compound sentences with 'and', 'but', 'because'. "
        "Topics: adventures, nature, friendship, small stories. "
        "Sentences of 10-14 words. Introduce basic adjectives and simple past tense."
    ),
    (7, 8): (
        "UPPER-INTERMEDIATE (level 7-8). Use complex sentences and narrative flow between pages. "
        "Topics: mystery, travel, science, culture. "
        "Sentences of 12-18 words. Use past, present and future tenses, comparatives."
    ),
    (9, 10): (
        "ADVANCED (level 9-10). Rich vocabulary, idiomatic expressions, varied sentence structures. "
        "Topics: history, technology, social issues (child-safe). "
        "Sentences of 15-22 words. Use subordinate clauses, passive voice, modal verbs."
    ),
}


def _difficulty_for_level(level: int) -> str:
    clamped = max(1, min(10, level))
    for (lo, hi), desc in _LEVEL_DIFFICULTY.items():
        if lo <= clamped <= hi:
            return desc
    return _LEVEL_DIFFICULTY[(1, 2)]


class BookGenerationService:
    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
        self.api_base_url = os.getenv(
            "GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")
        self.timeout_seconds = int(os.getenv("GEMINI_REQUEST_TIMEOUT_SECONDS", "60"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_book(
        self,
        *,
        level: int,
        num_pages: int,
        theme: str | None = None,
        age_group: str = "7-9",
        max_retries: int = 3,
        target_language: str = "English",
    ) -> GeneratedBookDraftSchema:
        if not self.is_configured():
            raise RuntimeError("GEMINI_API_KEY nao esta configurada no backend.")

        last_error: Exception | None = None
        for attempt in range(1, max_retries + 1):
            prompt = self._build_prompt(
                level=level, num_pages=num_pages, theme=theme, age_group=age_group,
                attempt=attempt, target_language=target_language,
            )

            payload = {
                "system_instruction": {
                    "parts": [
                        {
                            "text": (
                                f"You create child-safe {target_language} mini-books for Brazilian Portuguese-speaking learners. "
                                f"Each page has {target_language} text, its Portuguese translation, and 3-5 vocabulary words from the page. "
                                "Always return valid JSON only — no markdown fences, no comments, no extra keys."
                            )
                        }
                    ]
                },
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7 + (attempt - 1) * 0.1,
                    "responseMimeType": "application/json",
                },
            }

            url = f"{self.api_base_url}/models/{self.model}:generateContent"
            try:
                response = requests.post(
                    url,
                    headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                    json=payload,
                    timeout=self.timeout_seconds,
                )
                response.raise_for_status()
            except requests.RequestException as exc:
                raise RuntimeError(f"Gemini request failed: {exc}") from exc

            raw_text = self._extract_text(response.json())
            raw_text = self._strip_fences(raw_text)

            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError as exc:
                last_error = RuntimeError("Gemini returned invalid JSON for the book draft.")
                continue

            try:
                draft = GeneratedBookDraftSchema.model_validate(data)
                self._validate(draft, num_pages=num_pages)
                # Trunca caso Gemini retorne mais paginas do que o solicitado
                if len(draft.pages) > num_pages:
                    draft.pages = draft.pages[:num_pages]
                return draft
            except (Exception) as exc:
                last_error = exc
                continue

        raise RuntimeError(
            f"Gemini nao gerou {num_pages} paginas apos {max_retries} tentativas. "
            f"Ultimo erro: {last_error}"
        )

    # ── helpers ───────────────────────────────────────────────────────────────

    def _build_prompt(
        self,
        *,
        level: int,
        num_pages: int,
        theme: str | None,
        age_group: str,
        attempt: int = 1,
        target_language: str = "English",
    ) -> str:
        difficulty = _difficulty_for_level(level)

        theme_instruction = (
            f'Theme: "{theme.strip()}". Base the whole story on this theme.\n'
            if theme and theme.strip()
            else "Theme: choose a fun, child-safe adventure or daily-life topic.\n"
        )

        pages_example = ",\n".join(
            f'    {{\n      "page_number": {i},\n      "text_en": "<3-5 {target_language} sentences for page {i}>",\n      "text_pt": "<traducao portuguesa da pagina {i}>",\n      "vocabulary": ["word1", "word2", "word3"]\n    }}'
            for i in range(1, num_pages + 1)
        )

        retry_warning = (
            f"\n⚠️ IMPORTANT: A previous attempt returned fewer than {num_pages} pages. "
            f"You MUST output ALL {num_pages} page objects. Count them before responding.\n"
            if attempt > 1 else ""
        )

        return f"""Create a children's {target_language} mini-book with EXACTLY {num_pages} pages.{retry_warning}
Difficulty: {difficulty}
{theme_instruction}Age group: {age_group} years old (Brazilian learner studying {target_language}).

CRITICAL RULES:
1. The "pages" array MUST have EXACTLY {num_pages} items (page_number 1 through {num_pages}).
2. Each page MUST have 3-5 full {target_language} sentences — NEVER just 1 or 2.
3. Story structure: page 1 = introduction, pages 2-{num_pages-1} = development, page {num_pages} = resolution.
4. Portuguese must be natural Brazilian Portuguese, not word-for-word literal.
5. vocabulary: 3-5 {target_language} words per page, no repeats across pages.
6. Child-safe and positive content only.

Return ONLY this exact JSON structure with {num_pages} page objects:
{{
  "title": "<book title in {target_language}>",
  "theme": "<short theme tag>",
  "pages": [
{pages_example}
  ]
}}"""

    @staticmethod
    def _extract_text(response_json: dict) -> str:
        try:
            return response_json["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise RuntimeError(f"Unexpected Gemini response structure: {exc}") from exc

    @staticmethod
    def _strip_fences(text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            start = 1 if lines[0].startswith("```") else 0
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            text = "\n".join(lines[start:end]).strip()
        return text

    @staticmethod
    def _validate(draft: GeneratedBookDraftSchema, num_pages: int) -> None:
        if not draft.pages:
            raise RuntimeError("Gemini returned a book with no pages.")
        if len(draft.pages) < num_pages:
            raise RuntimeError(
                f"Gemini returned {len(draft.pages)} pages but {num_pages} were requested. "
                "Try again."
            )
