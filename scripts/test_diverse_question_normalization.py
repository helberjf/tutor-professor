from __future__ import annotations

import sys
import unittest
from pathlib import Path


API = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API))

from services.diverse_question_service import (  # noqa: E402
    normalize_subject,
    normalize_text,
    stable_question_id,
)


class DiverseQuestionNormalizationTests(unittest.TestCase):
    def test_normalizes_legacy_copies_into_one_canonical_question(self) -> None:
        legacy = {
            "name": "Biologia",
            "topics": [
                {
                    "topic": "O que e mitose?",
                    "answer": "",
                    "done": True,
                    "last_rating": "knew",
                    "review_count": 2,
                    "last_reviewed": "2026-07-09T10:30:00",
                }
            ],
            "lessons": [
                {
                    "id": "lesson-1",
                    "title": "Mitose",
                    "created_at": "2026-07-08T09:00:00",
                    "topics": [
                        {
                            "topic": "O que é mitose?",
                            "answer": "Divisao celular",
                            "code_example": "cell.divide()",
                            "done": False,
                            "last_rating": "unknown",
                            "review_count": 9,
                        }
                    ],
                }
            ],
        }

        subject = normalize_subject(legacy)

        self.assertEqual(len(subject["topics"]), 1)
        question = subject["topics"][0]
        self.assertTrue(question["id"].startswith("question-"))
        self.assertEqual(question["answer"], "Divisao celular")
        self.assertEqual(question["code_example"], "cell.divide()")
        self.assertTrue(question["done"])
        self.assertEqual(question["last_rating"], "knew")
        self.assertEqual(question["review_count"], 2)
        self.assertEqual(question["last_reviewed"], "2026-07-09T10:30:00")
        self.assertEqual(subject["lessons"][0]["topic_ids"], [question["id"]])
        self.assertNotIn("topics", subject["lessons"][0])

    def test_normalization_is_deterministic_accent_insensitive_and_idempotent(self) -> None:
        legacy = {
            "name": "  História  ",
            "topics": [{"topic": "Revolução Francesa!", "answer": "1789"}],
            "lessons": [
                {
                    "id": "lesson-fr",
                    "title": "França",
                    "topic_ids": [],
                    "topics": [{"topic": "revolucao francesa", "answer": "1789"}],
                }
            ],
        }

        normalized = normalize_subject(legacy)
        expected_id = stable_question_id("História", "Revolução Francesa!")

        self.assertEqual(normalize_text(" Révolution--FRANÇAISE "), "revolution francaise")
        self.assertEqual(normalized["topics"][0]["id"], expected_id)
        self.assertEqual(normalized["lessons"][0]["topic_ids"], [expected_id])
        self.assertEqual(normalize_subject(normalized), normalized)

    def test_preserves_non_latin_alphanumeric_questions(self) -> None:
        legacy = {
            "name": "数学",
            "topics": [{"topic": "什么是数学？", "answer": "研究数量和结构的学科"}],
            "lessons": [
                {
                    "id": "lesson-math",
                    "title": "数学基础",
                    "topics": [{"topic": "什么是数学?", "answer": "研究数量和结构的学科"}],
                }
            ],
        }

        subject = normalize_subject(legacy)

        self.assertEqual(normalize_text("什么是数学？"), "什么是数学")
        self.assertEqual(len(subject["topics"]), 1)
        self.assertEqual(subject["topics"][0]["topic"], "什么是数学？")
        self.assertEqual(subject["lessons"][0]["topic_ids"], [subject["topics"][0]["id"]])
        self.assertEqual(normalize_subject(subject), subject)

    def test_long_questions_hash_complete_front_and_remain_unambiguous(self) -> None:
        shared_prefix = "x" * 120
        first = f"{shared_prefix} primeira continuacao"
        second = f"{shared_prefix} segunda continuacao"
        legacy = {
            "name": "Matematica",
            "topics": [
                {"topic": first, "answer": "Resposta A"},
                {"topic": second, "answer": "Resposta B"},
            ],
            "lessons": [
                {
                    "id": "lesson-long",
                    "title": "Perguntas longas",
                    "topics": [
                        {"topic": first, "answer": "Resposta A"},
                        {"topic": second, "answer": "Resposta B"},
                    ],
                }
            ],
        }

        subject = normalize_subject(legacy)
        question_ids = [question["id"] for question in subject["topics"]]

        self.assertEqual([question["topic"] for question in subject["topics"]], [shared_prefix, shared_prefix])
        self.assertEqual(len(set(question_ids)), 2)
        self.assertEqual(question_ids, [stable_question_id("Matematica", first), stable_question_id("Matematica", second)])
        self.assertEqual(subject["lessons"][0]["topic_ids"], question_ids)
        self.assertEqual(normalize_subject(subject), subject)

    def test_preserves_existing_ids_and_deduplicates_lesson_references(self) -> None:
        canonical = {
            "name": "Quimica",
            "topics": [
                {
                    "id": "question-existing",
                    "topic": "O que e uma ligacao covalente?",
                    "answer": "Compartilhamento de eletrons",
                    "code_example": None,
                    "done": False,
                    "last_rating": None,
                    "review_count": 0,
                    "last_reviewed": None,
                }
            ],
            "lessons": [
                {
                    "id": "lesson-chem",
                    "title": "Ligacoes",
                    "created_at": None,
                    "topic_ids": ["question-existing", "question-existing"],
                }
            ],
        }

        normalized = normalize_subject(canonical)

        self.assertEqual(normalized["topics"][0]["id"], "question-existing")
        self.assertEqual(normalized["lessons"][0]["topic_ids"], ["question-existing"])
        self.assertEqual(normalize_subject(normalized), normalized)

    def test_prefers_an_existing_id_found_on_a_duplicate_and_rewrites_old_references(self) -> None:
        legacy = {
            "name": "Geografia",
            "topics": [
                {"topic": "O que e latitude?", "answer": ""},
                {
                    "id": "question-imported",
                    "topic": "o que é latitude",
                    "answer": "Distancia angular ao Equador",
                },
            ],
            "lessons": [
                {
                    "id": "lesson-geo",
                    "title": "Coordenadas",
                    "topic_ids": ["question-imported"],
                    "topics": [
                        {
                            "id": "question-legacy-copy",
                            "topic": "O que e latitude?",
                        }
                    ],
                }
            ],
        }

        subject = normalize_subject(legacy)

        self.assertEqual(len(subject["topics"]), 1)
        self.assertEqual(subject["topics"][0]["id"], "question-imported")
        self.assertEqual(subject["lessons"][0]["topic_ids"], ["question-imported"])

    def test_merges_lesson_only_duplicates_without_losing_review_progress(self) -> None:
        legacy = {
            "name": "Fisica",
            "topics": [],
            "lessons": [
                {
                    "id": "lesson-a",
                    "title": "Forcas",
                    "topics": [
                        {
                            "topic": "Defina inercia",
                            "answer": "",
                            "done": False,
                            "review_count": 0,
                        }
                    ],
                },
                {
                    "id": "lesson-b",
                    "title": "Newton",
                    "topics": [
                        {
                            "topic": "defina inércia!",
                            "answer": "Resistencia a mudanca do movimento",
                            "done": True,
                            "last_rating": "partial",
                            "review_count": 3,
                            "last_reviewed": "2026-07-10T12:00:00",
                        }
                    ],
                },
            ],
        }

        subject = normalize_subject(legacy)

        self.assertEqual(len(subject["topics"]), 1)
        question = subject["topics"][0]
        self.assertEqual(question["answer"], "Resistencia a mudanca do movimento")
        self.assertTrue(question["done"])
        self.assertEqual(question["last_rating"], "partial")
        self.assertEqual(question["review_count"], 3)
        self.assertEqual(question["last_reviewed"], "2026-07-10T12:00:00")
        self.assertEqual(subject["lessons"][0]["topic_ids"], [question["id"]])
        self.assertEqual(subject["lessons"][1]["topic_ids"], [question["id"]])

    def test_whitespace_only_code_does_not_block_valid_lesson_code(self) -> None:
        legacy = {
            "name": "Programacao",
            "topics": [
                {
                    "topic": "Como percorrer uma lista?",
                    "answer": "Use um loop",
                    "code_example": "   \n\t",
                }
            ],
            "lessons": [
                {
                    "id": "lesson-loop",
                    "title": "Loops",
                    "topics": [
                        {
                            "topic": "Como percorrer uma lista?",
                            "code_example": "for item in items:\n    print(item)",
                        }
                    ],
                }
            ],
        }

        question = normalize_subject(legacy)["topics"][0]

        self.assertEqual(question["code_example"], "for item in items:\n    print(item)")

    def test_equal_review_counts_keep_rating_with_the_newer_review_timestamp(self) -> None:
        legacy = {
            "name": "Sociologia",
            "topics": [],
            "lessons": [
                {
                    "id": "lesson-old",
                    "title": "Revisao antiga",
                    "topics": [
                        {
                            "topic": "O que e cultura?",
                            "last_rating": "knew",
                            "review_count": 4,
                            "last_reviewed": "2026-07-09T12:00:00",
                        }
                    ],
                },
                {
                    "id": "lesson-new",
                    "title": "Revisao nova",
                    "topics": [
                        {
                            "topic": "O que é cultura?",
                            "last_rating": "unknown",
                            "review_count": 4,
                            "last_reviewed": "2026-07-10T12:00:00",
                        }
                    ],
                },
            ],
        }

        question = normalize_subject(legacy)["topics"][0]

        self.assertEqual(question["review_count"], 4)
        self.assertEqual(question["last_reviewed"], "2026-07-10T12:00:00")
        self.assertEqual(question["last_rating"], "unknown")

    def test_skips_blank_questions_and_does_not_mutate_input(self) -> None:
        legacy = {
            "name": "",
            "topics": [{"topic": "  ", "answer": "ignored"}],
            "lessons": [{"id": "", "title": "", "topics": [{"answer": "ignored"}]}],
        }
        original = {
            "name": "",
            "topics": [{"topic": "  ", "answer": "ignored"}],
            "lessons": [{"id": "", "title": "", "topics": [{"answer": "ignored"}]}],
        }

        subject = normalize_subject(legacy)

        self.assertEqual(legacy, original)
        self.assertEqual(subject["name"], "Materia")
        self.assertEqual(subject["topics"], [])
        self.assertEqual(subject["lessons"][0]["topic_ids"], [])


if __name__ == "__main__":
    unittest.main()
