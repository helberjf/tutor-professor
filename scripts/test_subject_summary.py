"""The subject-wide revision sheet: shortest text that still covers the exam."""

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
SUMMARY_MODAL = ROOT / "apps/web/src/components/coding/SubjectSummaryModal.tsx"
WEB_API = ROOT / "apps/web/src/lib/api.ts"

main = programming_tests.main
coding_service = programming_tests.coding_service
_accounts_seeded = False


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


async def ensure_seed_accounts() -> None:
    global _accounts_seeded
    if _accounts_seeded:
        return
    await programming_tests.seed_accounts()
    _accounts_seeded = True


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
        digest = coding_service.build_subject_summary_digest(topics)
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

    def test_oversized_digest_is_trimmed_instead_of_refused(self) -> None:
        block = "## Topico: T\n- " + ("x" * 4_000)
        digest = "\n\n".join(block for _ in range(20))
        self.assertGreater(len(digest), coding_service.MAX_SUBJECT_SUMMARY_DIGEST_CHARS)
        with patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps({"content": "# Resumo"}),
        ) as generator:
            coding_service.summarize_subject_essentials(
                subject_name="AWS",
                subject_context="",
                topics_digest=digest,
                ai_config=object(),
            )
        prompt = generator.call_args.kwargs["prompt"]
        self.assertLessEqual(len(prompt), coding_service.MAX_SUBJECT_SUMMARY_PROMPT_CHARS)
        # The rules survive the trim: only the digest is shortened.
        self.assertIn("Retorne somente JSON valido", prompt)


class SummaryPromptTests(unittest.TestCase):
    def test_prompt_asks_for_the_smallest_exam_only_sheet(self) -> None:
        with patch.object(
            coding_service._phrase_service,
            "generate_json_text",
            return_value=json.dumps({"content": "# Resumo de AWS\n\n- Ponto curto."}),
        ) as generator:
            content = coding_service.summarize_subject_essentials(
                subject_name="AWS DVA-C02",
                subject_context="foco na prova de certificacao",
                topics_digest="## Topico: Cache\n- Edge: TTL controla o cache.",
                ai_config=object(),
            )
        self.assertIn("Resumo", content)
        prompt = generator.call_args.kwargs["prompt"]
        for expected in (
            "MENOR texto possivel",
            "cai em prova",
            "Pegadinhas",
            "Notion",
            "AWS DVA-C02",
            "foco na prova de certificacao",
            "TTL controla o cache",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, prompt)
        # A revision sheet recalls the material instead of improvising around it.
        self.assertLessEqual(generator.call_args.kwargs["temperature"], 0.4)

    def test_bigger_subjects_get_a_tighter_per_topic_allowance(self) -> None:
        shapes = {}
        for topic_count in (1, 8, 12, 28):
            digest = "\n\n".join(
                f"## Topico: T{index}\n- ponto" for index in range(topic_count)
            )
            with patch.object(
                coding_service._phrase_service,
                "generate_json_text",
                return_value=json.dumps({"content": "# Resumo"}),
            ) as generator:
                coding_service.summarize_subject_essentials(
                    subject_name="AWS",
                    subject_context="",
                    topics_digest=digest,
                    ai_config=object(),
                )
            shapes[topic_count] = generator.call_args.kwargs["prompt"]

        self.assertIn("no maximo 6 bullets", shapes[8])
        self.assertIn("no maximo 4 bullets", shapes[12])
        self.assertIn("no maximo 3 bullets", shapes[28])
        # Whatever the size of the subject, the sheet still fits one sitting.
        for topic_count, prompt in shapes.items():
            budget = int(prompt.split("precisa caber em ", 1)[1].split(" palavras", 1)[0])
            with self.subTest(topic_count=topic_count):
                self.assertLessEqual(budget, coding_service.SUMMARY_TOTAL_WORD_BUDGET)
                # A sheet that fits the budget cannot hit the 12k response cap.
                self.assertLess(budget * 8, 12_000)

    def test_empty_digest_is_refused_before_calling_the_provider(self) -> None:
        with patch.object(coding_service._phrase_service, "generate_json_text") as generator:
            with self.assertRaises(RuntimeError):
                coding_service.summarize_subject_essentials(
                    subject_name="AWS",
                    subject_context="",
                    topics_digest="   ",
                    ai_config=object(),
                )
        generator.assert_not_called()


class SummaryRouteTests(unittest.TestCase):
    def test_route_is_scoped_read_only_and_ephemeral(self) -> None:
        main_source = read(MAIN_FILE)
        self.assertIn('@app.post("/api/coding/subjects/{subject_id}/summary"', main_source)
        self.assertIn("class SubjectSummaryResponseSchema", read(SCHEMAS_FILE))
        route = main_source.split("def summarize_coding_subject", 1)[1].split("@app.", 1)[0]
        self.assertIn("subject is None or subject.child_id != child.id", route)
        self.assertIn("session.rollback()", route)
        self.assertNotIn("session.commit()", route)
        self.assertNotIn("session.add(", route)

    def test_route_summarises_every_topic_of_the_subject(self) -> None:
        asyncio.run(self._test_route())

    async def _test_route(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            subject_response = await client.post(
                "/api/coding/subjects", json={"name": "AWS Resumo", "context": "prova DVA-C02"}
            )
            programming_tests.assert_status(subject_response, 201, "create subject")
            subject_id = subject_response.json()["id"]
            for title, body in (("Cache", "TTL controla o cache."), ("IAM", "Roles sobre usuarios.")):
                topic_response = await client.post(
                    f"/api/coding/subjects/{subject_id}/topics",
                    json={"title": title, "generate_ai": False},
                )
                programming_tests.assert_status(topic_response, 201, f"create topic {title}")
                update = await client.put(
                    f"/api/coding/topics/{topic_response.json()['id']}",
                    json={
                        "ai_content": {
                            "sections": [{"title": title, "body": body, "code_example": "print(1)"}],
                            "quiz": [],
                            "flashcards": [],
                        }
                    },
                )
                programming_tests.assert_status(update, 200, f"save lesson {title}")

            captured: dict[str, object] = {}

            def fake_summary(**kwargs):
                captured.update(kwargs)
                return "# Resumo de AWS Resumo\n\n## Cache\n- TTL."

            with patch.object(main, "summarize_subject_essentials", fake_summary):
                response = await client.post(f"/api/coding/subjects/{subject_id}/summary")
            programming_tests.assert_status(response, 200, "summarise subject")
            payload = response.json()
            self.assertEqual(payload["topic_count"], 2)
            self.assertIn("## Cache", payload["content"])
            self.assertEqual(captured["subject_context"], "prova DVA-C02")
            digest = str(captured["topics_digest"])
            self.assertIn("## Topico: Cache", digest)
            self.assertIn("## Topico: IAM", digest)
            self.assertNotIn("print(1)", digest)

    def test_subject_without_lessons_is_refused_with_a_clear_message(self) -> None:
        asyncio.run(self._test_empty_subject())

    async def _test_empty_subject(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            subject_response = await client.post("/api/coding/subjects", json={"name": "Materia vazia"})
            programming_tests.assert_status(subject_response, 201, "create empty subject")
            subject_id = subject_response.json()["id"]
            with patch.object(main, "summarize_subject_essentials") as generator:
                response = await client.post(f"/api/coding/subjects/{subject_id}/summary")
            programming_tests.assert_status(response, 422, "summarise empty subject")
            self.assertIn("aulas geradas", response.json()["detail"])
            generator.assert_not_called()

    def test_another_parent_cannot_summarise_the_subject(self) -> None:
        asyncio.run(self._test_other_parent())

    async def _test_other_parent(self) -> None:
        await ensure_seed_accounts()
        async with programming_tests.api_client() as client:
            subject_response = await client.post("/api/coding/subjects", json={"name": "Materia privada"})
            programming_tests.assert_status(subject_response, 201, "create private subject")
            subject_id = subject_response.json()["id"]
        async with programming_tests.api_client(programming_tests.SECONDARY_EMAIL) as other:
            response = await other.post(f"/api/coding/subjects/{subject_id}/summary")
            programming_tests.assert_status(response, 404, "other parent summary")


class SummaryFrontendTests(unittest.TestCase):
    def test_subject_screen_offers_the_summary_next_to_the_exam(self) -> None:
        source = read(CODING_CURRICULUM)
        for expected in (
            "Resumo da matéria",
            "Simulado da matéria",
            "api.generateSubjectSummary",
            "SubjectSummaryModal",
            "Gerar resumo",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)
        self.assertIn("generateSubjectSummary:", read(WEB_API))

    def test_summary_modal_reads_full_screen_and_copies_the_markdown(self) -> None:
        source = read(SUMMARY_MODAL)
        for expected in (
            'aria-modal="true"',
            "Copiar para Notion",
            "navigator.clipboard.writeText(content)",
            "Gerar de novo",
            "max-w-[72ch]",
            "palavras · {readingMinutes} min de leitura",
            "sm:h-[calc(100dvh-1.5rem)]",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)


if __name__ == "__main__":
    unittest.main()
