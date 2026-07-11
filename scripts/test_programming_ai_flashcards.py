from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
WEB_API = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
WEB_PACKAGE = ROOT / "apps" / "web" / "package.json"
TOPIC_VIEW = (
    ROOT / "apps" / "web" / "src" / "components" / "coding" / "TopicView.tsx"
)
TMP_DIR = Path(tempfile.mkdtemp(prefix="programming-flashcards-api-"))
DB_PATH = TMP_DIR / "test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "programming-flashcards-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(API))

import httpx
from pydantic import ValidationError
from sqlmodel import Session, select

import main
from schemas.schemas import GenerateAdditionalFlashcardsSchema
from services import coding_service


PRIMARY_EMAIL = "flashcards@example.com"
SECONDARY_EMAIL = "other-parent@example.com"
PASSWORD = "secret123"
VALID_AI_CONTENT = {
    "sections": [
        {
            "title": "Lexical scope",
            "body": "Closures retain variables from their lexical scope.",
            "code_example": "const add = x => y => x + y;",
        }
    ],
    "quiz": [],
    "flashcards": [],
}


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def make_cards(prefix: str) -> list[dict[str, str]]:
    return [
        {
            "front": f"{prefix} interview question {index}?",
            "back": f"Answer {index}",
            "code_example": f"const value{index} = {index};",
        }
        for index in range(1, 6)
    ]


class ProgrammingAIFlashcardFrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.api_source = WEB_API.read_text(encoding="utf-8")
        cls.topic_view = TOPIC_VIEW.read_text(encoding="utf-8")
        cls.web_package = json.loads(WEB_PACKAGE.read_text(encoding="utf-8"))

    def test_api_client_exposes_additional_flashcard_generation(self):
        self.assertIn("generateAdditionalCodingFlashcards", self.api_source)
        self.assertIn(
            "`/api/coding/topics/${topicId}/flashcards/generate`",
            self.api_source,
        )
        self.assertIn("body: JSON.stringify({ context: context?.trim() || null })", self.api_source)

    def test_reading_view_exposes_inline_additional_generation_form(self):
        for expected in (
            "Criar mais questões com IA",
            "additionalFlashcardContext",
            "showAdditionalFlashcardForm",
            "generatingAdditionalFlashcards",
            "additionalFlashcardError",
            "additionalFlashcardSuccess",
            "maxLength={1000}",
            "Serão criadas 5 questões",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, self.topic_view)

    def test_success_appends_cards_and_updates_topic_count_by_five(self):
        self.assertIn("appendGeneratedFlashcards", self.topic_view)
        self.assertIn("syncTopicFlashcardCount", self.topic_view)
        self.assertIn(
            "api.generateAdditionalCodingFlashcards(topic.id, additionalFlashcardContext)",
            self.topic_view,
        )
        self.assertIn(
            "setFlashcards((current) => appendGeneratedFlashcards(current, created))",
            self.topic_view,
        )
        self.assertNotIn("setFlashcards(created)", self.topic_view)
        self.assertNotIn("flashcard_count: topic.flashcard_count + 5", self.topic_view)
        self.assertIn("syncTopicFlashcardCount(topic, flashcards.length)", self.topic_view)
        self.assertIn("onTopicUpdated(syncedTopic)", self.topic_view)

    def test_all_card_flows_share_count_sync_and_block_concurrent_mutations(self):
        self.assertIn("loadedFlashcardTopicId !== topic.id", self.topic_view)
        self.assertIn("disabled={generating || generatingAdditionalFlashcards", self.topic_view)
        self.assertIn("setShowAdditionalFlashcardForm(false)", self.topic_view)
        self.assertIn('role="status" aria-live="polite"', self.topic_view)
        self.assertIn('role="alert"', self.topic_view)
        self.assertIn('aria-busy={generatingAdditionalFlashcards}', self.topic_view)

    def test_form_handles_cancel_loading_success_and_api_errors(self):
        for expected in (
            "setShowAdditionalFlashcardForm(false)",
            "setAdditionalFlashcardContext('')",
            "setAdditionalFlashcardError('')",
            "setAdditionalFlashcardSuccess(",
            "err instanceof Error ? err.message",
            "disabled={generating || generatingAdditionalFlashcards}",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, self.topic_view)

    def test_generation_flows_are_mutually_exclusive_and_block_internal_back(self):
        self.assertIn(
            "async function handleGenerate(context?: string) {\n"
            "    if (generating || generatingAdditionalFlashcards) return;",
            self.topic_view,
        )
        self.assertIn("if (loadingFc) return;", self.topic_view)
        self.assertIn(
            "if (generating || generatingAdditionalFlashcards || addingFc || importingFc) return;",
            self.topic_view,
        )
        self.assertRegex(
            self.topic_view,
            r"if \(generating \|\| generatingAdditionalFlashcards\) return;\s+onBack\(\);",
        )
        self.assertIn(
            "aria-disabled={generating || generatingAdditionalFlashcards}",
            self.topic_view,
        )
        self.assertGreaterEqual(
            self.topic_view.count(
                "disabled={generating || generatingAdditionalFlashcards}"
            ),
            3,
        )
        self.assertIn(
            "onClick={() => void handleGenerate(regenerateContext)}\n"
            "                    disabled={loadingFc || generating || generatingAdditionalFlashcards}",
            self.topic_view,
        )
        self.assertGreaterEqual(
            self.topic_view.count(
                "disabled={loadingFc || generating || generatingAdditionalFlashcards}"
            ),
            3,
        )

    def test_full_regeneration_suspends_count_sync_until_new_cards_arrive(self):
        start = self.topic_view.index("async function handleGenerate(context?: string)")
        end = self.topic_view.index("async function handleSaveNotes()")
        handler = self.topic_view[start:end]
        self.assertLess(handler.index("setLoadingFc(true)"), handler.index("setTopic(updated)"))
        self.assertLess(
            handler.index("setLoadedFlashcardTopicId(null)"),
            handler.index("setTopic(updated)"),
        )
        self.assertIn("await loadTopicFlashcards(topic.id)", handler)
        self.assertNotIn("api.getTopicFlashcards", handler)
        self.assertNotIn("setFlashcards([])", handler)
        self.assertNotIn("contentWasRegenerated", handler)

    def test_flashcard_load_failures_are_visible_retryable_and_not_empty(self):
        for expected in (
            "flashcardsLoadError",
            "const loadTopicFlashcards = useCallback(async (topicId: number)",
            "setFlashcardsLoadError('')",
            "setLoadedFlashcardTopicId(null)",
            "setFlashcardsLoadError(err instanceof Error ? err.message",
            "onClick={() => void loadTopicFlashcards(topic.id)}",
            "Tentar recarregar",
            "flashcardsLoadError || loadedFlashcardTopicId !== topic.id",
            "loadedFlashcardTopicId === topic.id && !flashcardsLoadError && flashcards.length === 0",
            "const flashcardCountLabel",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, self.topic_view)
        self.assertRegex(
            self.topic_view,
            r'role="alert"[^>]*>\s*<p>\{flashcardsLoadError',
        )
        form_start = self.topic_view.index("{showAdditionalFlashcardForm && (")
        form_end = self.topic_view.index("{copyMessage && (", form_start)
        additional_form = self.topic_view[form_start:form_end]
        self.assertGreaterEqual(
            additional_form.count(
                "disabled={loadingFc || loadedFlashcardTopicId !== topic.id || generating || generatingAdditionalFlashcards}"
            ),
            2,
        )

    def test_topic_flashcard_helper_test_is_discoverable(self):
        self.assertEqual(
            self.web_package["scripts"].get("test:topic-flashcards"),
            "node scripts/test-topic-flashcard-state.mjs",
        )


def topic_counts(topic_id: int) -> tuple[int, int]:
    with Session(main.engine) as session:
        cards = session.exec(
            select(main.ProgrammingFlashcard).where(
                main.ProgrammingFlashcard.topic_id == topic_id
            )
        ).all()
        card_ids = {card.id for card in cards}
        review_items = session.exec(select(main.CodingReviewItem)).all()
        return len(cards), sum(item.flashcard_id in card_ids for item in review_items)


def topic_cards(topic_id: int) -> list[main.ProgrammingFlashcard]:
    with Session(main.engine) as session:
        return list(
            session.exec(
                select(main.ProgrammingFlashcard).where(
                    main.ProgrammingFlashcard.topic_id == topic_id
                )
            ).all()
        )


def transport() -> httpx.ASGITransport:
    return httpx.ASGITransport(app=main.app, raise_app_exceptions=False)


@asynccontextmanager
async def api_client(email: str | None = PRIMARY_EMAIL):
    async with httpx.AsyncClient(
        transport=transport(), base_url="http://testserver"
    ) as client:
        if email is not None:
            login = await client.post(
                "/api/auth/login", json={"email": email, "password": PASSWORD}
            )
            assert_status(login, 200, f"login {email}")
        yield client


async def create_topic(
    client: httpx.AsyncClient,
    *,
    title: str,
    ai_content: dict | None = VALID_AI_CONTENT,
) -> tuple[int, int]:
    subject_response = await client.post(
        "/api/coding/subjects", json={"name": f"JavaScript {title}"}
    )
    assert_status(subject_response, 201, "create subject")
    subject_id = subject_response.json()["id"]
    topic_response = await client.post(
        f"/api/coding/subjects/{subject_id}/topics",
        json={"title": title, "generate_ai": False},
    )
    assert_status(topic_response, 201, "create topic")
    topic_id = topic_response.json()["id"]
    if ai_content is not None:
        update = await client.put(
            f"/api/coding/topics/{topic_id}", json={"ai_content": ai_content}
        )
        assert_status(update, 200, "save lesson content")
    return subject_id, topic_id


async def seed_accounts() -> None:
    main.on_startup()
    async with httpx.AsyncClient(
        transport=transport(), base_url="http://testserver"
    ) as client:
        for email, cpf, child_name in (
            (PRIMARY_EMAIL, "52998224725", "Lia"),
            (SECONDARY_EMAIL, "39053344705", "Bia"),
        ):
            response = await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Parent",
                    "last_name": "Test",
                    "email": email,
                    "cpf": cpf,
                    "password": PASSWORD,
                    "child_name": child_name,
                },
            )
            assert_status(response, 201, f"register {email}")
        login = await client.post(
            "/api/auth/login", json={"email": PRIMARY_EMAIL, "password": PASSWORD}
        )
        assert_status(login, 200, "login primary for AI config")
        settings = await client.put(
            "/api/ai/settings",
            json={
                "provider": "gemini",
                "api_key": "fake-test-key",
                "model": "gemini-2.5-flash",
            },
        )
        assert_status(settings, 200, "save fake AI config")


class ProgrammingAIPromptTests(unittest.TestCase):
    def test_initial_prompt_requires_interview_cards_from_same_lesson_and_code(self):
        prompt = coding_service._TOPIC_PROMPT_TEMPLATE.lower()
        for expected in (
            "technical interview",
            "sections from this same json response",
            "reuse relevant code",
            "reasoning",
            "trade-offs",
            "debugging",
            "common pitfalls",
            "practical application",
        ):
            self.assertIn(expected, prompt)

    def test_additional_generator_sends_one_call_with_all_source_context(self):
        response = {"flashcards": make_cards("Closure")}
        with patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps(response),
        ) as generate:
            cards = coding_service.generate_additional_topic_flashcards(
                subject_name="JavaScript",
                topic_title="Functions",
                ai_content=VALID_AI_CONTENT,
                existing_fronts=["What is lexical scope?"],
                user_context="Focus on debugging callbacks",
                ai_config=object(),
            )
        self.assertEqual(len(cards), 5)
        generate.assert_called_once()
        prompt_text = generate.call_args.kwargs["prompt"]
        for expected in (
            "JavaScript",
            "Functions",
            "Lexical scope",
            "const add = x => y => x + y;",
            "What is lexical scope?",
            "Focus on debugging callbacks",
        ):
            self.assertIn(expected, prompt_text)

    def test_request_schema_has_optional_context_limited_to_1000_characters(self):
        self.assertIsNone(GenerateAdditionalFlashcardsSchema().context)
        self.assertEqual(
            len(GenerateAdditionalFlashcardsSchema(context="x" * 1000).context or ""),
            1000,
        )
        with self.assertRaises(ValidationError):
            GenerateAdditionalFlashcardsSchema(context="x" * 1001)


class ProgrammingAIFlashcardRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        asyncio.run(seed_accounts())

    def test_success_appends_five_and_preserves_existing_card(self):
        asyncio.run(self._test_success())

    async def _test_success(self) -> None:
        async with api_client() as client:
            _, topic_id = await create_topic(client, title="Success")
            existing_response = await client.post(
                f"/api/coding/topics/{topic_id}/flashcards",
                json={
                    "front": "How does a closure retain lexical state?",
                    "back": "Through lexical scope.",
                    "code_example": "const savedValue = 42;",
                },
            )
            assert_status(existing_response, 201, "seed existing card")
            existing_before = existing_response.json()
            before = topic_counts(topic_id)
            captured: dict[str, object] = {"calls": 0}

            def fake_generator(**kwargs):
                captured["calls"] = int(captured["calls"]) + 1
                captured.update(kwargs)
                return make_cards("New closure")

            with patch.object(main, "generate_additional_topic_flashcards", fake_generator):
                response = await client.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate",
                    json={"context": "  Focus\n  on debugging callbacks  "},
                )
            assert_status(response, 200, "append generated cards")
            generated = response.json()
            self.assertEqual(len(generated), 5)
            self.assertEqual(topic_counts(topic_id), (before[0] + 5, before[1] + 5))
            self.assertEqual(captured["calls"], 1)
            self.assertEqual(captured["subject_name"], "JavaScript Success")
            self.assertEqual(captured["topic_title"], "Success")
            self.assertEqual(captured["ai_content"], VALID_AI_CONTENT)
            self.assertEqual(
                captured["existing_fronts"], [existing_before["front"]]
            )
            self.assertEqual(captured["user_context"], "Focus on debugging callbacks")
            self.assertEqual(
                captured["ai_config"],
                main.AIProviderConfig(
                    provider="gemini",
                    api_key="fake-test-key",
                    model="gemini-2.5-flash",
                    base_url=None,
                ),
            )
            listed = (
                await client.get(f"/api/coding/topics/{topic_id}/flashcards")
            ).json()
            self.assertEqual(len(listed), 6)
            existing_after = next(
                card for card in listed if card["id"] == existing_before["id"]
            )
            for field in ("front", "back", "code_example"):
                self.assertEqual(existing_after[field], existing_before[field])
            generated_ids = {card["id"] for card in generated}
            with Session(main.engine) as session:
                items = session.exec(select(main.CodingReviewItem)).all()
            self.assertEqual(
                {item.flashcard_id for item in items if item.flashcard_id in generated_ids},
                generated_ids,
            )

    def test_requires_authentication(self):
        asyncio.run(self._test_requires_authentication())

    async def _test_requires_authentication(self) -> None:
        async with api_client() as owner:
            _, topic_id = await create_topic(owner, title="Anonymous")
        async with api_client(None) as anonymous:
            with patch.object(
                main, "generate_additional_topic_flashcards"
            ) as generator:
                response = await anonymous.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate", json={}
                )
        self.assertEqual(response.status_code, 401)
        generator.assert_not_called()
        self.assertEqual(topic_counts(topic_id), (0, 0))

    def test_rejects_missing_and_cross_owner_topics(self):
        asyncio.run(self._test_missing_and_cross_owner())

    async def _test_missing_and_cross_owner(self) -> None:
        async with api_client() as owner:
            _, topic_id = await create_topic(owner, title="Owned")
            with patch.object(main, "generate_additional_topic_flashcards") as generator:
                missing = await owner.post(
                    "/api/coding/topics/999999/flashcards/generate", json={}
                )
            self.assertEqual(missing.status_code, 404)
            generator.assert_not_called()
        async with api_client(SECONDARY_EMAIL) as other:
            with patch.object(
                main, "generate_additional_topic_flashcards"
            ) as generator:
                cross_owner = await other.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate", json={}
                )
        self.assertEqual(cross_owner.status_code, 404)
        generator.assert_not_called()
        self.assertEqual(topic_counts(topic_id), (0, 0))

    def test_rejects_missing_or_malformed_lesson_content_before_ai(self):
        asyncio.run(self._test_invalid_lesson_content())

    async def _test_invalid_lesson_content(self) -> None:
        async with api_client() as client:
            for title, content in (
                ("No content", None),
                ("Empty sections", {"sections": [], "quiz": [], "flashcards": []}),
                ("Wrong sections", {"sections": "not-a-list"}),
                ("Invalid section", {"sections": [{"title": "Missing body"}]}),
            ):
                with self.subTest(title=title):
                    _, topic_id = await create_topic(
                        client, title=title, ai_content=content
                    )
                    with patch.object(
                        main, "generate_additional_topic_flashcards"
                    ) as generator:
                        response = await client.post(
                            f"/api/coding/topics/{topic_id}/flashcards/generate",
                            json={},
                        )
                    self.assertEqual(response.status_code, 422)
                    generator.assert_not_called()
                    self.assertEqual(topic_counts(topic_id), (0, 0))

    def test_rejects_missing_ai_configuration_before_generation(self):
        asyncio.run(self._test_missing_ai_configuration())

    async def _test_missing_ai_configuration(self) -> None:
        async with api_client(SECONDARY_EMAIL) as client:
            _, topic_id = await create_topic(client, title="No config")
            with patch.object(main, "generate_additional_topic_flashcards") as generator:
                response = await client.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate", json={}
                )
        self.assertEqual(response.status_code, 422)
        generator.assert_not_called()
        self.assertEqual(topic_counts(topic_id), (0, 0))

    def test_invalid_ai_json_and_non_object_cards_return_502_without_writes(self):
        asyncio.run(self._test_malformed_ai_outputs())

    async def _test_malformed_ai_outputs(self) -> None:
        async with api_client() as client:
            _, json_topic_id = await create_topic(client, title="Bad JSON")
            with patch.object(
                coding_service._phrase_service,
                "generate_json_text",
                return_value="{not-json",
            ) as ai_call:
                response = await client.post(
                    f"/api/coding/topics/{json_topic_id}/flashcards/generate",
                    json={},
                )
            self.assertEqual(response.status_code, 502)
            ai_call.assert_called_once()
            self.assertEqual(topic_counts(json_topic_id), (0, 0))

            for title, bad_batch in (
                ("None cards", [None] * 5),
                ("Object cards", [object()] * 5),
            ):
                with self.subTest(title=title):
                    _, topic_id = await create_topic(client, title=title)
                    with patch.object(
                        main,
                        "generate_additional_topic_flashcards",
                        return_value=bad_batch,
                    ) as generator:
                        response = await client.post(
                            f"/api/coding/topics/{topic_id}/flashcards/generate",
                            json={},
                        )
                    self.assertEqual(response.status_code, 502)
                    generator.assert_called_once()
                    self.assertEqual(topic_counts(topic_id), (0, 0))

    def test_duplicate_batch_and_commit_failure_leave_zero_partial_rows(self):
        asyncio.run(self._test_atomic_failures())

    async def _test_atomic_failures(self) -> None:
        async with api_client() as client:
            _, duplicate_topic_id = await create_topic(client, title="Duplicate")
            duplicate_batch = make_cards("Duplicate")
            duplicate_batch[1]["front"] = duplicate_batch[0]["front"]
            with patch.object(
                main,
                "generate_additional_topic_flashcards",
                return_value=duplicate_batch,
            ):
                response = await client.post(
                    f"/api/coding/topics/{duplicate_topic_id}/flashcards/generate",
                    json={},
                )
            self.assertEqual(response.status_code, 502)
            self.assertEqual(topic_counts(duplicate_topic_id), (0, 0))

            _, commit_topic_id = await create_topic(client, title="Commit failure")
            rollback_calls = 0
            original_rollback = main.Session.rollback

            def tracking_rollback(session, *args, **kwargs):
                nonlocal rollback_calls
                rollback_calls += 1
                return original_rollback(session, *args, **kwargs)

            with patch.object(
                main,
                "generate_additional_topic_flashcards",
                return_value=make_cards("Commit failure"),
            ), patch.object(
                main.Session,
                "commit",
                side_effect=RuntimeError("controlled commit failure"),
            ), patch.object(main.Session, "rollback", tracking_rollback):
                response = await client.post(
                    f"/api/coding/topics/{commit_topic_id}/flashcards/generate",
                    json={},
                )
            self.assertEqual(response.status_code, 500)
            self.assertGreaterEqual(rollback_calls, 1)
            self.assertEqual(topic_counts(commit_topic_id), (0, 0))

    def test_revalidates_fronts_after_generation_before_persisting(self):
        asyncio.run(self._test_stale_snapshot())

    async def _test_stale_snapshot(self) -> None:
        async with api_client() as client:
            subject_id, topic_id = await create_topic(client, title="Race")
            generated = make_cards("Racing")

            def generator_with_competing_insert(**kwargs):
                with Session(main.engine) as competing_session:
                    topic = competing_session.get(main.ProgrammingTopic, topic_id)
                    subject = competing_session.get(main.ProgrammingSubject, subject_id)
                    card = main.ProgrammingFlashcard(
                        topic_id=topic_id,
                        subject_id=subject_id,
                        child_id=subject.child_id,
                        front=generated[0]["front"],
                        back="Inserted by a competing request.",
                    )
                    competing_session.add(card)
                    competing_session.flush()
                    main.seed_coding_review_item(
                        competing_session, subject.child_id, card.id or 0
                    )
                    competing_session.commit()
                return generated

            with patch.object(
                main,
                "generate_additional_topic_flashcards",
                side_effect=generator_with_competing_insert,
            ) as generator:
                response = await client.post(
                    f"/api/coding/topics/{topic_id}/flashcards/generate", json={}
                )
            self.assertEqual(response.status_code, 502)
            generator.assert_called_once()
            self.assertEqual(topic_counts(topic_id), (1, 1))
            self.assertEqual(topic_cards(topic_id)[0].back, "Inserted by a competing request.")

    def test_initial_generation_uses_one_response_for_content_and_cards(self):
        asyncio.run(self._test_initial_generation())

    async def _test_initial_generation(self) -> None:
        async with api_client() as client:
            subject = await client.post(
                "/api/coding/subjects", json={"name": "TypeScript Initial"}
            )
            assert_status(subject, 201, "create initial-generation subject")
            subject_id = subject.json()["id"]
            content = main.TopicAIContentSchema.model_validate(
                {
                    "sections": VALID_AI_CONTENT["sections"],
                    "quiz": [],
                    "flashcards": make_cards("Initial"),
                }
            )
            with patch.object(
                main, "generate_topic_ai_content", return_value=content
            ) as generator:
                response = await client.post(
                    f"/api/coding/subjects/{subject_id}/topics",
                    json={"title": "Initial", "generate_ai": True},
                )
            assert_status(response, 201, "create topic with initial AI content")
            generator.assert_called_once()
            payload = response.json()
            self.assertEqual(payload["ai_content"], content.model_dump())
            self.assertEqual(payload["flashcard_count"], 5)
            self.assertEqual(topic_counts(payload["id"]), (5, 5))


if __name__ == "__main__":
    unittest.main()
