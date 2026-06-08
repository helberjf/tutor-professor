from __future__ import annotations

import json
import os

from schemas.schemas import GeneratedBookDraftSchema
from services.phrase_generator_service import AIProviderConfig, PhraseGenerationService


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
        self.text_generation_service = PhraseGenerationService()

    def is_configured(self, ai_config: AIProviderConfig | None = None) -> bool:
        if ai_config is not None:
            return bool(ai_config.api_key)
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
        ai_config: AIProviderConfig | None = None,
    ) -> GeneratedBookDraftSchema:
        if not self.is_configured(ai_config):
            raise RuntimeError("Chave de API da IA nao esta configurada.")

        active_config = ai_config or AIProviderConfig(
            provider="gemini",
            api_key=self.api_key,
            model=self.model,
            base_url=self.api_base_url,
        )

        last_error: Exception | None = None
        for attempt in range(1, max_retries + 1):
            prompt = self._build_prompt(
                level=level,
                num_pages=num_pages,
                theme=theme,
                age_group=age_group,
                attempt=attempt,
                target_language=target_language,
            )
            system_text = (
                f"You create child-safe {target_language} illustrated mini picture-books "
                "for Brazilian Portuguese-speaking learners. "
                f"Each page has a small amount of {target_language} text, its Portuguese translation, "
                "and 3-5 vocabulary words. Always return valid JSON only, with no markdown fences, "
                "no comments, and no extra keys."
            )

            try:
                raw_text = self.text_generation_service.generate_json_text(
                    system_text=system_text,
                    prompt=prompt,
                    temperature=0.7 + (attempt - 1) * 0.1,
                    ai_config=active_config,
                    timeout_seconds=self.timeout_seconds,
                )
                data = json.loads(self._strip_fences(raw_text))
                draft = GeneratedBookDraftSchema.model_validate(data)
                self._validate(draft, num_pages=num_pages)
                if len(draft.pages) > num_pages:
                    draft.pages = draft.pages[:num_pages]
                return draft
            except json.JSONDecodeError as exc:
                last_error = RuntimeError("AI provider returned invalid JSON for the book draft.")
            except Exception as exc:
                last_error = exc

        raise RuntimeError(
            f"IA nao gerou {num_pages} paginas apos {max_retries} tentativas. "
            f"Ultimo erro: {last_error}"
        )

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

        clamped = max(1, min(10, level))
        if clamped <= 2:
            sentences_rule = f"1-2 short {target_language} sentences"
        elif clamped <= 4:
            sentences_rule = f"2-3 short {target_language} sentences"
        elif clamped <= 6:
            sentences_rule = f"2-3 {target_language} sentences"
        elif clamped <= 8:
            sentences_rule = f"3-4 {target_language} sentences"
        else:
            sentences_rule = f"3-5 {target_language} sentences"

        theme_instruction = (
            f'Theme: "{theme.strip()}". Base the whole story on this theme.\n'
            if theme and theme.strip()
            else "Theme: choose a fun, child-safe adventure or daily-life topic.\n"
        )

        pages_example = ",\n".join(
            f'    {{\n      "page_number": {i},\n      "text_en": "<{sentences_rule} for page {i}>",\n      "text_pt": "<traducao portuguesa da pagina {i}>",\n      "vocabulary": ["word1", "word2", "word3"]\n    }}'
            for i in range(1, num_pages + 1)
        )

        retry_warning = (
            f"\nIMPORTANT: A previous attempt returned fewer than {num_pages} pages. "
            f"You MUST output ALL {num_pages} page objects. Count them before responding.\n"
            if attempt > 1
            else ""
        )

        return f"""Create a children's {target_language} mini picture-book with EXACTLY {num_pages} pages.{retry_warning}
This is a real illustrated learning book. Each page has a small illustration and just a few lines of text. Keep text short and punchy.
Difficulty: {difficulty}
{theme_instruction}Age group: {age_group} years old (Brazilian learner studying {target_language}).

CRITICAL RULES:
1. The "pages" array MUST have EXACTLY {num_pages} items (page_number 1 through {num_pages}).
2. Each page MUST have EXACTLY {sentences_rule}. This is a picture-book page, not a paragraph.
3. Story structure: page 1 = introduction, pages 2-{num_pages - 1} = development, page {num_pages} = resolution.
4. Portuguese must be natural Brazilian Portuguese, not word-for-word literal.
5. vocabulary: 3-5 key {target_language} words per page drawn from that page's text, no repeats across pages.
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
            raise RuntimeError("AI provider returned a book with no pages.")
        if len(draft.pages) < num_pages:
            raise RuntimeError(
                f"AI provider returned {len(draft.pages)} pages but {num_pages} were requested. "
                "Try again."
            )
