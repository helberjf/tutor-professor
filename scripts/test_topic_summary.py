"""Revision sheets: one per topic, and the subject sheet as their join."""

from __future__ import annotations

import asyncio
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import test_programming_ai_flashcards as programming_tests


ROOT = Path(__file__).resolve().parents[1]
MAIN_FILE = ROOT / "apps/api/main.py"
SCHEMAS_FILE = ROOT / "apps/api/schemas/schemas.py"
CODING_CURRICULUM = ROOT / "apps/web/src/components/coding/CodingCurriculum.tsx"
TOPIC_VIEW = ROOT / "apps/web/src/components/coding/TopicView.tsx"
SUMMARY_MODAL = ROOT / "apps/web/src/components/coding/SummarySheetModal.tsx"
WEB_API = ROOT / "apps/web/src/lib/api.ts"

main = programming_tests.main
coding_service = programming_tests.coding_service
_accounts_seeded = False

LESSON_SECTION = {"title": "Cache", "body": "TTL controla o cache.", "code_example": "print(1)"}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def lesson_for(title: str) -> dict:
    return {"sections": [dict(LESSON_SECTION, title=title)], "quiz": [], "flashcards": []}


async def ensure_seed_accounts() -> None:
    global _accounts_seeded
    if _accounts_seeded:
        return
    await programming_tests.seed_accounts()
    _accounts_seeded = True


async def make_subject_with_topics(client, name: str, titles: tuple[str, ...]) -> tuple[int, list[int]]:
    subject_response = await client.post(
        "/api/coding/subjects", json={"name": name, "context": "prova DVA-C02"}
    )
    programming_tests.assert_status(subject_response, 201, "create subject")
    subject_id = subject_response.json()["id"]
    topic_ids: list[int] = []
    for title in titles:
        topic_response = await client.post(
            f"/api/coding/subjects/{subject_id}/topics",
            json={"title": title, "generate_ai": False},
        )
        programming_tests.assert_status(topic_response, 201, f"create topic {title}")
        topic_id = topic_response.json()["id"]
        update = await client.put(
            f"/api/coding/topics/{topic_id}", json={"ai_content": lesson_for(title)}
        )
        programming_tests.assert_status(update, 200, f"save lesson {title}")
        topic_ids.append(topic_id)
    return subject_id, topic_ids


class FakeTopic:
    def __init__(self, title: str, ai_content: dict | None) -> None:
        self.title = title
        self.ai_content = ai_content


class SummaryDigestTests(unittest.TestCase):
    def test_digest_keeps_exam_signal_and_drops_code(self) -> None:
        topics = [
            FakeTopic(
                "CloudFront",
                {
                    "sections": [
                        {
                            "title": "Edge caching",
                            "body": "TTL controls  how long\nthe edge keeps an object.",
                            "code_example": "const cf = new CloudFront();",
                        }
                    ],
                    "quiz": [{"question": "Quando invalidar o cache?"}],
                },
            ),
            FakeTopic("Sem aula ainda", None),
        ]
        digest = coding_service.build_summary_digest(topics)
        self.assertIn("## Topico: CloudFront", digest)
        self.assertIn("Edge caching: TTL controls how long the edge keeps an object.", digest)
        self.assertIn("Ja cobrado em questoes: Quando invalidar o cache?", digest)
        self.assertNotIn("new CloudFront", digest)
        self.assertNotIn("Sem aula ainda", digest)

    def test_topics_without_lessons_are_left_out(self) -> None:
        topics = [
            FakeTopic("Com aula", {"sections": [{"title": "A", "body": "B"}]}),
            FakeTopic("So quiz", {"sections": [], "quiz": [{"question": "Q?"}]}),
            FakeTopic("Vazio", {}),
            FakeTopic("Sem conteudo", None),
        ]
        titles = [topic.title for topic in coding_service.subject_topics_with_lessons(topics)]
        self.assertEqual(titles, ["Com aula", "So quiz"])


class TopicSummaryPromptTests(unittest.TestCase):
    def test_prompt_asks_for_a_short_headless_exam_only_sheet(self) -> None:
        with patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps({"content": "- Ponto curto."}),
        ) as generator:
            content = coding_service.summarize_topic_essentials(
                subject_name="AWS DVA-C02",
                topic_title="Cache e performance",
                subject_context="foco na prova de certificacao",
                topic_digest="## Topico: Cache\n- Edge: TTL controla o cache.",
                ai_config=object(),
            )
        self.assertEqual(content, "- Ponto curto.")
        prompt = generator.call_args.kwargs["prompt"]
        for expected in (
            "MENOR texto possivel",
            "cai em prova",
            "NAO escreva titulo",
            "Pegadinhas",
            "Notion",
            "AWS DVA-C02",
            "Cache e performance",
            "foco na prova de certificacao",
            "TTL controla o cache",
            f"No maximo {coding_service.SUMMARY_MAX_BULLETS} bullets",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, prompt)
        # A revision sheet recalls the material instead of improvising around it.
        self.assertLessEqual(generator.call_args.kwargs["temperature"], 0.4)

    def test_a_title_the_model_adds_anyway_is_dropped(self) -> None:
        with patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps({"content": "# Resumo de Cache\n\n- TTL controla o cache."}),
        ):
            content = coding_service.summarize_topic_essentials(
                subject_name="AWS",
                topic_title="Cache",
                subject_context="",
                topic_digest="## Topico: Cache\n- Edge.",
                ai_config=object(),
            )
        self.assertEqual(content, "- TTL controla o cache.")

    def test_empty_digest_is_refused_before_calling_the_provider(self) -> None:
        with patch.object(coding_service._phrase_service, "generate_json_text") as generator:
            with self.assertRaises(RuntimeError):
                coding_service.summarize_topic_essentials(
                    subject_name="AWS",
                    topic_title="Cache",
                    subject_context="",
                    topic_digest="   ",
                    ai_config=object(),
                )
        generator.assert_not_called()


class JoinTests(unittest.TestCase):
    def test_join_nests_every_topic_under_one_title(self) -> None:
        joined = coding_service.join_topic_summaries(
            "AWS",
            [("Cache", "- TTL controla o cache."), ("IAM", "# Resumo de IAM\n- Roles sobre usuarios.")],
        )
        self.assertEqual(
            joined,
            "# Resumo de AWS\n\n## Cache\n- TTL controla o cache.\n\n## IAM\n- Roles sobre usuarios.",
        )

    def test_topics_without_a_sheet_are_skipped(self) -> None:
        joined = coding_service.join_topic_summaries("AWS", [("Cache", "- TTL."), ("IAM", "   ")])
        self.assertNotIn("IAM", joined)


class TopicSummaryRouteTests(unittest.TestCase):
    def test_route_stores_the_sheet_and_reuses_it(self) -> None:
        asyncio.run(self._test_store_and_reuse())

    async def _test_store_and_reuse(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            _, topic_ids = await make_subject_with_topics(client, "AWS Topico", ("Cache",))
            topic_id = topic_ids[0]
            calls: list[dict] = []

            def fake_summary(**kwargs):
                calls.append(kwargs)
                return "- TTL controla o cache."

            with patch.object(main, "summarize_topic_essentials", fake_summary):
                first = await client.post(f"/api/coding/topics/{topic_id}/summary")
                programming_tests.assert_status(first, 200, "generate topic sheet")
                # A stored sheet is reused instead of paying for the same topic twice.
                second = await client.post(f"/api/coding/topics/{topic_id}/summary")
                programming_tests.assert_status(second, 200, "reuse topic sheet")
                # ...unless the reader asks for a new one.
                third = await client.post(f"/api/coding/topics/{topic_id}/summary?regenerate=true")
                programming_tests.assert_status(third, 200, "regenerate topic sheet")

            self.assertEqual(len(calls), 2)
            self.assertEqual(first.json()["content"], "- TTL controla o cache.")
            self.assertEqual(second.json()["content"], "- TTL controla o cache.")
            self.assertEqual(calls[0]["topic_title"], "Cache")
            self.assertNotIn("print(1)", str(calls[0]["topic_digest"]))

    def test_reader_can_edit_the_stored_sheet(self) -> None:
        asyncio.run(self._test_edit())

    async def _test_edit(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            subject_id, topic_ids = await make_subject_with_topics(client, "AWS Edicao", ("Cache",))
            with patch.object(main, "summarize_topic_essentials", lambda **_: "- gerado."):
                await client.post(f"/api/coding/topics/{topic_ids[0]}/summary")
            saved = await client.put(
                f"/api/coding/topics/{topic_ids[0]}/summary",
                json={"content": "- minha versao do resumo."},
            )
            programming_tests.assert_status(saved, 200, "edit topic sheet")
            self.assertEqual(saved.json()["content"], "- minha versao do resumo.")

            # The subject sheet joins whatever is stored, edits included.
            joined = await client.get(f"/api/coding/subjects/{subject_id}/summary")
            programming_tests.assert_status(joined, 200, "join after edit")
            self.assertIn("- minha versao do resumo.", joined.json()["content"])

            empty = await client.put(
                f"/api/coding/topics/{topic_ids[0]}/summary", json={"content": "   "}
            )
            programming_tests.assert_status(empty, 422, "refuse an empty sheet")

    def test_another_parent_cannot_touch_the_sheet(self) -> None:
        asyncio.run(self._test_other_parent())

    async def _test_other_parent(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            subject_id, topic_ids = await make_subject_with_topics(client, "AWS Privada", ("Cache",))
        async with programming_tests.api_client(programming_tests.SECONDARY_EMAIL) as other:
            programming_tests.assert_status(
                await other.post(f"/api/coding/topics/{topic_ids[0]}/summary"),
                404,
                "other parent generate",
            )
            programming_tests.assert_status(
                await other.put(f"/api/coding/topics/{topic_ids[0]}/summary", json={"content": "x"}),
                404,
                "other parent edit",
            )
            programming_tests.assert_status(
                await other.get(f"/api/coding/subjects/{subject_id}/summary"),
                404,
                "other parent join",
            )


class SubjectJoinRouteTests(unittest.TestCase):
    def test_join_route_never_calls_the_provider(self) -> None:
        main_source = read(MAIN_FILE)
        route = main_source.split("def get_coding_subject_summary", 1)[1].split("@app.", 1)[0]
        self.assertNotIn("summarize_topic_essentials", route)
        self.assertIn("join_topic_summaries", route)
        schemas_source = read(SCHEMAS_FILE)
        for expected in (
            "class TopicSummarySchema",
            "class UpdateTopicSummarySchema",
            "class PendingSummaryTopicSchema",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, schemas_source)

    def test_a_new_topic_comes_back_as_pending_and_joins_after_one_call(self) -> None:
        asyncio.run(self._test_incremental())

    async def _test_incremental(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            subject_id, topic_ids = await make_subject_with_topics(
                client, "AWS Juncao", ("Cache", "IAM")
            )
            summaries = {topic_ids[0]: "- TTL.", topic_ids[1]: "- Roles."}

            first = await client.get(f"/api/coding/subjects/{subject_id}/summary")
            programming_tests.assert_status(first, 200, "join before any sheet")
            payload = first.json()
            self.assertEqual(payload["content"], "")
            self.assertEqual(payload["summarized_count"], 0)
            self.assertEqual(payload["estimated_credits"], 2)
            self.assertEqual([p["topic_id"] for p in payload["pending"]], topic_ids)

            for topic_id in topic_ids:
                with patch.object(
                    main,
                    "summarize_topic_essentials",
                    lambda topic_id=topic_id, **_: summaries[topic_id],
                ):
                    await client.post(f"/api/coding/topics/{topic_id}/summary")

            joined = await client.get(f"/api/coding/subjects/{subject_id}/summary")
            programming_tests.assert_status(joined, 200, "join both sheets")
            payload = joined.json()
            self.assertEqual(payload["pending"], [])
            self.assertEqual(payload["summarized_count"], 2)
            self.assertEqual(payload["estimated_credits"], 0)
            self.assertEqual(
                payload["content"],
                "# Resumo de AWS Juncao\n\n## Cache\n- TTL.\n\n## IAM\n- Roles.",
            )

            # Adding a topic later costs one call for that topic, not a rewrite.
            added = await client.post(
                f"/api/coding/subjects/{subject_id}/topics",
                json={"title": "S3", "generate_ai": False},
            )
            programming_tests.assert_status(added, 201, "add a topic")
            new_topic_id = added.json()["id"]
            await client.put(
                f"/api/coding/topics/{new_topic_id}", json={"ai_content": lesson_for("S3")}
            )

            with_new = await client.get(f"/api/coding/subjects/{subject_id}/summary")
            payload = with_new.json()
            self.assertEqual([p["topic_id"] for p in payload["pending"]], [new_topic_id])
            self.assertIn("## Cache", payload["content"])

            with patch.object(main, "summarize_topic_essentials", lambda **_: "- Object storage."):
                await client.post(f"/api/coding/topics/{new_topic_id}/summary")
            final = await client.get(f"/api/coding/subjects/{subject_id}/summary")
            payload = final.json()
            self.assertEqual(payload["pending"], [])
            self.assertTrue(payload["content"].endswith("## S3\n- Object storage."))


class SummaryFrontendTests(unittest.TestCase):
    def test_subject_screen_fills_the_pending_topics_one_by_one(self) -> None:
        source = read(CODING_CURRICULUM)
        for expected in (
            "Resumo da matéria",
            "api.getSubjectSummary",
            "api.generateTopicSummary",
            "sheet.pending",
            "Resumindo ${index + 1} de ${missing.length}",
            "SummarySheetModal",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)
        api_source = read(WEB_API)
        for expected in ("getSubjectSummary:", "generateTopicSummary:", "saveTopicSummary:"):
            with self.subTest(expected=expected):
                self.assertIn(expected, api_source)

    def test_topic_screen_offers_its_own_sheet(self) -> None:
        source = read(TOPIC_VIEW)
        for expected in (
            "Resumo do tópico",
            "api.generateTopicSummary",
            "api.saveTopicSummary",
            "SummarySheetModal",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)

    def test_modal_reads_full_screen_copies_and_edits(self) -> None:
        source = read(SUMMARY_MODAL)
        for expected in (
            'aria-modal="true"',
            "Copiar para Notion",
            "navigator.clipboard.writeText(content)",
            "Gerar de novo",
            "Editar",
            "Salvar",
            "onSave",
            "max-w-[72ch]",
            "sm:h-[calc(100dvh-1.5rem)]",
            "min de leitura",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)


if __name__ == "__main__":
    unittest.main()
