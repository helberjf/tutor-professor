from __future__ import annotations

import json
import os

from schemas.schemas import BookOutlinePageSchema, BookOutlineSchema, GeneratedBookDraftSchema, GeneratedBookPageDraftSchema
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
        if num_pages == 1:
            story_structure = "page 1 = a complete tiny story with beginning and ending."
        elif num_pages == 2:
            story_structure = "page 1 = introduction, page 2 = resolution."
        else:
            story_structure = f"page 1 = introduction, pages 2-{num_pages - 1} = development, page {num_pages} = resolution."

        return f"""Create a children's {target_language} mini picture-book with EXACTLY {num_pages} pages.{retry_warning}
This is a real illustrated learning book. Each page has a small illustration and just a few lines of text. Keep text short and punchy.
Difficulty: {difficulty}
{theme_instruction}Age group: {age_group} years old (Brazilian learner studying {target_language}).

CRITICAL RULES:
1. The "pages" array MUST have EXACTLY {num_pages} items (page_number 1 through {num_pages}).
2. Each page MUST have EXACTLY {sentences_rule}. This is a picture-book page, not a paragraph.
3. Story structure: {story_structure}
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

    def generate_outline(
        self,
        *,
        level: int,
        num_pages: int,
        theme: str | None = None,
        target_language: str = "English",
        ai_config: AIProviderConfig | None = None,
        age_group: str = "7-9",
    ) -> BookOutlineSchema:
        if not self.is_configured(ai_config):
            raise RuntimeError("Chave de API da IA nao esta configurada.")

        active_config = ai_config or AIProviderConfig(
            provider="gemini", api_key=self.api_key, model=self.model, base_url=self.api_base_url,
        )
        difficulty = _difficulty_for_level(level)
        theme_instruction = (
            f'Theme: "{theme.strip()}". Base the whole story on this theme.\n'
            if theme and theme.strip()
            else "Theme: choose a fun, child-safe adventure or daily-life topic.\n"
        )

        pages_outline_example = ",\n".join(
            f'    {{"page_number": {i}, "scene": "<brief description of page {i} scene>", "key_vocabulary": ["word1", "word2"]}}'
            for i in range(1, num_pages + 1)
        )

        prompt = (
            f"Create a story outline for a children's {target_language} picture-book.\n"
            f"Difficulty: {difficulty}\n"
            f"{theme_instruction}"
            f"Pages: {num_pages}\n"
            f"Age group: {age_group} years old (Brazilian learner).\n\n"
            "Return ONLY valid JSON in this exact format:\n"
            "{\n"
            f'  "title": "<book title in {target_language}>",\n'
            '  "theme": "<short theme tag, 1-3 words>",\n'
            '  "synopsis": "<2-3 sentence story arc summary in English>",\n'
            '  "characters": ["character1", "character2"],\n'
            '  "page_outlines": [\n'
            f'{pages_outline_example}\n'
            "  ]\n"
            "}"
        )
        system_text = (
            f"You create child-safe {target_language} story outlines for Brazilian Portuguese-speaking learners. "
            "Return ONLY valid JSON, no markdown fences, no extra keys."
        )
        try:
            raw_text = self.text_generation_service.generate_json_text(
                system_text=system_text, prompt=prompt, temperature=0.7, ai_config=active_config,
                timeout_seconds=self.timeout_seconds,
            )
            data = json.loads(self._strip_fences(raw_text))
        except json.JSONDecodeError:
            raise RuntimeError("IA retornou JSON invalido para o roteiro.")
        except Exception as exc:
            raise RuntimeError(f"Erro ao gerar roteiro: {exc}") from exc

        raw_outlines = data.get("page_outlines", [])
        page_outlines = [
            BookOutlinePageSchema(
                page_number=int(p.get("page_number", i + 1)),
                scene=str(p.get("scene", "")).strip()[:400],
                key_vocabulary=[str(v)[:40] for v in p.get("key_vocabulary", [])[:5]],
            )
            for i, p in enumerate(raw_outlines[:num_pages])
        ]
        if not page_outlines:
            raise RuntimeError("IA nao gerou paginas no roteiro.")

        return BookOutlineSchema(
            title=str(data.get("title", "")).strip()[:200] or "My Story",
            theme=str(data.get("theme", theme or "adventure")).strip()[:80],
            synopsis=str(data.get("synopsis", "")).strip()[:600],
            characters=[str(c)[:60] for c in data.get("characters", [])[:6]],
            page_outlines=page_outlines,
            level=level,
            num_pages=num_pages,
            target_language=target_language,
        )

    def generate_page(
        self,
        *,
        level: int,
        outline: BookOutlineSchema,
        page_number: int,
        context_pages: list[GeneratedBookPageDraftSchema],
        target_language: str = "English",
        ai_config: AIProviderConfig | None = None,
        age_group: str = "7-9",
    ) -> GeneratedBookPageDraftSchema:
        if not self.is_configured(ai_config):
            raise RuntimeError("Chave de API da IA nao esta configurada.")

        active_config = ai_config or AIProviderConfig(
            provider="gemini", api_key=self.api_key, model=self.model, base_url=self.api_base_url,
        )
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

        page_scene = next(
            (p.scene for p in outline.page_outlines if p.page_number == page_number),
            f"Continue the story (page {page_number} of {outline.num_pages})",
        )
        characters_text = ", ".join(outline.characters) if outline.characters else "the main character"
        context_text = ""
        if context_pages:
            parts = []
            for cp in context_pages[-3:]:  # last 3 pages for context
                parts.append(f"Page {cp.page_number}: {cp.text_en}")
            context_text = "\n\nPREVIOUS PAGES:\n" + "\n".join(parts)

        prompt = (
            f"Write page {page_number} of {outline.num_pages} for a children's {target_language} picture-book.\n\n"
            f"BOOK: \"{outline.title}\"\n"
            f"SYNOPSIS: {outline.synopsis}\n"
            f"CHARACTERS: {characters_text}\n"
            f"THIS PAGE SCENE: {page_scene}\n"
            f"DIFFICULTY: {difficulty}\n"
            f"AGE GROUP: {age_group} years old (Brazilian learner).{context_text}\n\n"
            "RULES:\n"
            f"- Write EXACTLY {sentences_rule} in {target_language}\n"
            "- Natural Brazilian Portuguese translation (not word-for-word)\n"
            "- 3-5 vocabulary words from this page's text only\n"
            "- Story must flow naturally from previous pages\n"
            "- Child-safe content only\n\n"
            "Return ONLY this exact JSON:\n"
            "{\n"
            f'  "page_number": {page_number},\n'
            f'  "text_en": "<{sentences_rule}>",\n'
            '  "text_pt": "<natural Brazilian Portuguese translation>",\n'
            '  "vocabulary": ["word1", "word2", "word3"]\n'
            "}"
        )
        system_text = (
            f"You write individual pages of child-safe {target_language} picture-books "
            "for Brazilian Portuguese-speaking learners. "
            "Return ONLY valid JSON, no markdown, no extra keys."
        )
        last_error: Exception | None = None
        for attempt in range(1, 3):
            try:
                raw_text = self.text_generation_service.generate_json_text(
                    system_text=system_text, prompt=prompt,
                    temperature=0.65 + (attempt - 1) * 0.1,
                    ai_config=active_config, timeout_seconds=self.timeout_seconds,
                )
                data = json.loads(self._strip_fences(raw_text))
                return GeneratedBookPageDraftSchema(
                    page_number=page_number,
                    text_en=str(data.get("text_en", "")).strip() or "...",
                    text_pt=str(data.get("text_pt", "")).strip() or "...",
                    vocabulary=[str(v)[:40] for v in data.get("vocabulary", [])[:5]],
                )
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"Erro ao gerar pagina {page_number}: {last_error}") from last_error

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
