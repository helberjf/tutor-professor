from __future__ import annotations

import asyncio
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError
from sqlmodel import Session, select

import test_programming_ai_flashcards as programming_tests
from schemas.schemas import CreateProgrammingTopicSchema


ROOT = Path(__file__).resolve().parents[1]
CREATE_TOPIC_MODAL = ROOT / "apps/web/src/components/coding/CreateTopicModal.tsx"
CODING_CURRICULUM = ROOT / "apps/web/src/components/coding/CodingCurriculum.tsx"
TOPIC_VIEW = ROOT / "apps/web/src/components/coding/TopicView.tsx"
WEB_API = ROOT / "apps/web/src/lib/api.ts"
BROWSER_SPEECH = ROOT / "apps/web/src/lib/browser-speech.ts"
SCHEMAS_FILE = ROOT / "apps/api/schemas/schemas.py"
MAIN_FILE = ROOT / "apps/api/main.py"
CODING_SERVICE = ROOT / "apps/api/services/coding_service.py"

main = programming_tests.main
_accounts_seeded = False


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def make_initial_content(prefix: str = "Context") -> dict:
    return programming_tests.make_initial_content(prefix)


async def ensure_seed_accounts() -> None:
    global _accounts_seeded
    if _accounts_seeded:
        return
    await programming_tests.seed_accounts()
    _accounts_seeded = True


class TopicCreationContextTests(unittest.TestCase):
    def test_create_topic_schema_accepts_context_limited_to_1000_chars(self) -> None:
        payload = CreateProgrammingTopicSchema(
            title="Hooks",
            generate_ai=True,
            context="focar em entrevista tecnica",
        )
        self.assertEqual(payload.context, "focar em entrevista tecnica")
        self.assertEqual(
            len(CreateProgrammingTopicSchema(title="Hooks", context="x" * 1000).context or ""),
            1000,
        )
        with self.assertRaises(ValidationError):
            CreateProgrammingTopicSchema(title="Hooks", context="x" * 1001)

    def test_create_topic_modal_sends_context_only_with_ai_generation(self) -> None:
        source = read(CREATE_TOPIC_MODAL)
        api_source = read(WEB_API)
        for expected in (
            "topicContext",
            "Contexto para a IA",
            "placeholder=\"Ex.:",
            "maxLength={1000}",
            "generateAI &&",
            "context: topicContext.trim()",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)
        self.assertIn("context?: string", api_source)

    def test_create_topic_route_passes_combined_subject_and_topic_context(self) -> None:
        asyncio.run(self._test_route_context())

    async def _test_route_context(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            subject_response = await client.post(
                "/api/coding/subjects",
                json={"name": "TypeScript Context", "context": "contexto da materia"},
            )
            programming_tests.assert_status(subject_response, 201, "create context subject")
            subject_id = subject_response.json()["id"]
            content = main.TopicAIContentSchema.model_validate(make_initial_content())
            captured: dict[str, str] = {}

            def fake_generate_topic_ai_content(**kwargs):
                captured["user_context"] = kwargs.get("user_context", "")
                return content

            with patch.object(main, "generate_topic_ai_content", fake_generate_topic_ai_content):
                response = await client.post(
                    f"/api/coding/subjects/{subject_id}/topics",
                    json={
                        "title": "Hooks com contexto",
                        "generate_ai": True,
                        "context": "  foco em perguntas de entrevista\ncom exemplos  ",
                    },
                )
            programming_tests.assert_status(response, 201, "create topic with context")
            self.assertEqual(
                captured["user_context"],
                "contexto da materia\nfoco em perguntas de entrevista com exemplos",
            )
            payload = response.json()
            self.assertEqual(payload["flashcard_count"], 5)


class ReadingDeepeningBackendTests(unittest.TestCase):
    def test_deepening_contract_exists_and_is_stateless(self) -> None:
        schemas_source = read(SCHEMAS_FILE)
        service_source = read(CODING_SERVICE)
        main_source = read(MAIN_FILE)
        for expected in (
            "class DeepenCodingReadingRequestSchema",
            "class DeepenCodingReadingResponseSchema",
        ):
            self.assertIn(expected, schemas_source)
        for expected in (
            "def deepen_coding_reading_step",
            "Notion",
            "conceitos",
            "exemplos",
            "generate_json_text",
        ):
            self.assertIn(expected, service_source)
        self.assertIn('@app.post("/api/coding/topics/{topic_id}/reading/deepen"', main_source)
        route = main_source.split("def deepen_coding_topic_reading", 1)[1].split("@app.", 1)[0]
        self.assertIn("session.rollback()", route)
        self.assertNotIn("session.commit()", route)
        self.assertNotIn("session.add(", route)

    def test_deepening_route_returns_ephemeral_content_without_writes(self) -> None:
        asyncio.run(self._test_deepening_route())

    async def _test_deepening_route(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            _, topic_id = await programming_tests.create_topic(client, title="Deepening")
            before = programming_tests.topic_counts(topic_id)
            captured: dict[str, object] = {}

            def fake_deepen(**kwargs):
                captured.update(kwargs)
                return "## Conceitos importantes\n\n- Exemplo pronto para Notion."

            with patch.object(main, "deepen_coding_reading_step", fake_deepen):
                response = await client.post(
                    f"/api/coding/topics/{topic_id}/reading/deepen",
                    json={
                        "step_type": "section",
                        "title": "Lexical scope",
                        "body": "Closures retain variables.",
                        "code_example": "const add = x => y => x + y;",
                        "user_question": "explique como em entrevista",
                    },
                )
            programming_tests.assert_status(response, 200, "deepen reading step")
            self.assertEqual(response.json()["content"], "## Conceitos importantes\n\n- Exemplo pronto para Notion.")
            self.assertEqual(programming_tests.topic_counts(topic_id), before)
            self.assertEqual(captured["topic_title"], "Deepening")
            self.assertEqual(captured["user_question"], "explique como em entrevista")

    def test_deepening_prompt_contains_notion_concepts_examples_and_user_question(self) -> None:
        with patch.object(
            programming_tests.coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps({"content": "## Resumo\n\n- Conceito e exemplo."}),
        ) as generator:
            answer = programming_tests.coding_service.deepen_coding_reading_step(
                subject_name="AWS",
                topic_title="Step Functions",
                step_payload={
                    "step_type": "section",
                    "title": "Retry",
                    "body": "Retry handles transient errors.",
                    "code_example": '{"Retry": [{"ErrorEquals": ["States.ALL"]}]}',
                },
                user_question="quero exemplos de prova",
                ai_config=object(),
            )
        self.assertIn("Resumo", answer)
        prompt = generator.call_args.kwargs["prompt"]
        for expected in (
            "Notion",
            "conceitos",
            "exemplos",
            "Step Functions",
            "Retry handles transient errors",
            "quero exemplos de prova",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, prompt)


class ReadingDeepeningFrontendTests(unittest.TestCase):
    def test_flashcard_mode_preserves_current_subject(self) -> None:
        source = read(CODING_CURRICULUM)
        self.assertNotIn("setView({ type: 'subjects' });\n  }, [focusMode]);", source)
        for expected in (
            "returnToTopics",
            "view.type === 'topics'",
            "view.type === 'topic'",
            "return { type: 'deck', subject:",
            "setView(returnToTopics ? { type: 'topics', subject } : { type: 'subjects' })",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)

    def test_recreate_action_lives_near_start_study_with_new_label(self) -> None:
        source = read(TOPIC_VIEW)
        header_start = source.index("Iniciar estudo")
        header_area = source[max(0, header_start - 1200): header_start + 2200]
        self.assertIn("Recriar aula com IA", header_area)
        self.assertIn("showRegenerateContext", source)
        self.assertNotIn("Regenerar com IA", source)

    def test_reading_modal_has_speech_and_ephemeral_deepening_controls(self) -> None:
        source = read(TOPIC_VIEW)
        api_source = read(WEB_API)
        speech_source = read(BROWSER_SPEECH)
        for expected in (
            "speakWithBrowserVoice",
            "Ouvir texto",
            "Aprofundar com IA",
            "deepeningQuestion",
            "deepeningAnswer",
            "api.deepenCodingReadingStep",
            "Copiar para Notion",
            "navigator.clipboard.writeText(deepeningAnswer)",
            "setDeepeningAnswer('')",
            "setShowDeepening(false)",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)
        self.assertIn("deepenCodingReadingStep", api_source)
        self.assertIn("lang = 'en-US'", speech_source)
        self.assertIn("speakWithBrowserVoice(buildSpeakableReadingText(step, topicTitle), 0.95, 'pt-BR')", source)


if __name__ == "__main__":
    unittest.main()
