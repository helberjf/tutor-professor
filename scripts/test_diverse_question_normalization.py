from __future__ import annotations

import sys
import unittest
from pathlib import Path


API = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API))

from services.diverse_question_service import (  # noqa: E402
    has_canonical_subject_identities,
    normalize_subject,
    normalize_subjects,
    normalize_text,
    stable_question_id,
)
from schemas.schemas import DiverseDayUpdateSchema  # noqa: E402


class DiverseQuestionNormalizationTests(unittest.TestCase):
    def test_detects_original_identity_completeness_before_normalization(self) -> None:
        canonical = [
            {
                "id": "subject-a",
                "name": "Historia",
                "topics": [],
                "lessons": [
                    {"id": "lesson-a", "title": "A", "topic_ids": []},
                    {"id": "lesson-b", "title": "B", "topic_ids": []},
                ],
            }
        ]
        missing_subject_id = [{**canonical[0], "id": ""}]
        duplicate_subject_ids = [canonical[0], {**canonical[0], "name": "Outra"}]
        duplicate_lesson_ids = [
            {
                **canonical[0],
                "lessons": [canonical[0]["lessons"][0], canonical[0]["lessons"][0]],
            }
        ]

        self.assertTrue(has_canonical_subject_identities(canonical))
        self.assertFalse(has_canonical_subject_identities(missing_subject_id))
        self.assertFalse(has_canonical_subject_identities(duplicate_subject_ids))
        self.assertFalse(has_canonical_subject_identities(duplicate_lesson_ids))

        legacy_payload = DiverseDayUpdateSchema.model_validate(
            {"custom_subjects": missing_subject_id}
        )
        legacy_metadata = legacy_payload.original_identity_metadata
        self.assertIsNone(legacy_metadata["subjects"][0]["id"])
        self.assertNotIn("_original_identity_metadata", legacy_payload.model_dump(mode="json"))
        self.assertNotIn("original_identity_metadata", legacy_payload.model_dump(mode="json"))
        self.assertTrue(
            has_canonical_subject_identities(legacy_payload.model_dump(mode="json")["custom_subjects"])
        )

        canonical_payload = DiverseDayUpdateSchema.model_validate(
            {"custom_subjects": canonical}
        )
        self.assertEqual(canonical_payload.original_identity_metadata["subjects"][0]["id"], "subject-a")

        schema_text = str(DiverseDayUpdateSchema.model_json_schema())
        self.assertNotIn("identity_metadata", schema_text)
        self.assertNotIn("identities_supplied", schema_text)

        spoofed = DiverseDayUpdateSchema.model_validate(
            {
                "custom_subjects": missing_subject_id,
                "_original_identity_metadata": {
                    "subjects": [{"id": "subject-spoofed", "duplicate": False, "lessons": []}]
                },
                "original_identity_metadata": {
                    "subjects": [{"id": "subject-spoofed", "duplicate": False, "lessons": []}]
                },
            }
        )
        self.assertIsNone(spoofed.original_identity_metadata["subjects"][0]["id"])

    def test_assigns_unique_stable_subject_and_lesson_ids_to_legacy_lists(self) -> None:
        legacy = [
            {
                "name": "Historia",
                "topics": [],
                "lessons": [
                    {"id": "duplicate-lesson", "title": "Introducao", "topics": []},
                    {"id": "duplicate-lesson", "title": "Introducao", "topics": []},
                    {"id": "", "title": "Introducao", "topics": []},
                ],
            },
            {
                "name": "Historia",
                "topics": [],
                "lessons": [
                    {"id": "duplicate-lesson", "title": "Introducao", "topics": []},
                ],
            },
        ]

        normalized = normalize_subjects(legacy)

        subject_ids = [subject["id"] for subject in normalized]
        self.assertEqual(len(set(subject_ids)), 2)
        self.assertTrue(all(subject_id.startswith("subject-") for subject_id in subject_ids))
        first_lesson_ids = [lesson["id"] for lesson in normalized[0]["lessons"]]
        self.assertEqual(len(set(first_lesson_ids)), 3)
        self.assertEqual(first_lesson_ids[0], "duplicate-lesson")
        self.assertTrue(all(first_lesson_ids[index].startswith("lesson-") for index in (1, 2)))
        self.assertEqual(normalize_subjects(normalized), normalized)

        reordered = normalize_subjects(list(reversed(normalized)))
        self.assertEqual(
            [subject["id"] for subject in reordered],
            list(reversed(subject_ids)),
        )
        self.assertEqual(reordered[1]["lessons"], normalized[0]["lessons"])

    def test_schema_round_trip_persists_subject_identity(self) -> None:
        payload = DiverseDayUpdateSchema.model_validate(
            {
                "custom_subjects": [
                    {
                        "id": "subject-history",
                        "name": "Historia",
                        "topics": [],
                        "lessons": [
                            {"id": "lesson-history", "title": "Historia", "topic_ids": []}
                        ],
                    }
                ]
            }
        )

        serialized = payload.model_dump(mode="json")
        self.assertEqual(serialized["custom_subjects"][0]["id"], "subject-history")
        self.assertEqual(
            DiverseDayUpdateSchema.model_validate(serialized).model_dump(mode="json"),
            serialized,
        )

    def test_schema_preserves_full_legacy_aggregate_capacity(self) -> None:
        subject_topics = [
            {"topic": f"Pergunta da materia {index}", "answer": f"Resposta {index}"}
            for index in range(50)
        ]
        lessons = [
            {
                "id": f"lesson-{lesson_index}",
                "title": f"Licao {lesson_index}",
                "topics": [
                    {
                        "topic": f"Pergunta da licao {lesson_index}-{question_index}",
                        "answer": f"Resposta {lesson_index}-{question_index}",
                    }
                    for question_index in range(50)
                ],
            }
            for lesson_index in range(30)
        ]

        payload = DiverseDayUpdateSchema.model_validate(
            {"custom_subjects": [{"name": "Materia completa", "topics": subject_topics, "lessons": lessons}]}
        )
        serialized = payload.model_dump(mode="json")
        round_tripped = DiverseDayUpdateSchema.model_validate(serialized).model_dump(mode="json")
        subject = round_tripped["custom_subjects"][0]

        self.assertEqual(len(subject["topics"]), 1550)
        self.assertEqual(len(subject["lessons"]), 30)
        self.assertTrue(all(len(lesson["topic_ids"]) == 50 for lesson in subject["lessons"]))
        self.assertEqual(len({question["id"] for question in subject["topics"]}), 1550)

    def test_drops_dangling_lesson_references_after_alias_resolution(self) -> None:
        subject = normalize_subject(
            {
                "name": "Biologia",
                "topics": [{"id": "question-valid", "topic": "O que e mitose?"}],
                "lessons": [
                    {
                        "id": "lesson-1",
                        "title": "Mitose",
                        "topic_ids": ["question-missing", "question-valid", "question-missing", "question-valid"],
                    }
                ],
            }
        )

        self.assertEqual(subject["lessons"][0]["topic_ids"], ["question-valid"])

    def test_upsert_normalizes_stored_legacy_subjects_before_activity_comparison(self) -> None:
        main = (API / "main.py").read_text(encoding="utf-8")
        upsert_body = main.split("def upsert_diverse_day(", 1)[1].split("_LEVEL_LABELS", 1)[0]
        before_new_subjects = upsert_body.split("subjects_data =", 1)[0]

        self.assertIn("normalize_subject", before_new_subjects)
        self.assertIn("old_summary = summarize_diverse_activity(normalized_old_subjects)", before_new_subjects)

    def test_schema_accepts_legacy_embedded_questions_without_serializing_copies(self) -> None:
        payload = DiverseDayUpdateSchema.model_validate(
            {
                "custom_subjects": [
                    {
                        "name": "Biologia",
                        "topics": [{"topic": "O que e mitose?"}],
                        "lessons": [
                            {
                                "id": "lesson-1",
                                "title": "Mitose",
                                "topics": [{"topic": "O que e mitose?"}],
                            }
                        ],
                    }
                ]
            }
        )

        raw_subject = payload.custom_subjects[0].model_dump(mode="json")
        normalized = normalize_subject(raw_subject)

        self.assertEqual(
            normalized["lessons"][0]["topic_ids"],
            [normalized["topics"][0]["id"]],
        )
        self.assertNotIn("topics", payload.custom_subjects[0].lessons[0].model_dump(mode="json"))

    def test_canonical_schema_round_trip_preserves_ids_code_and_references(self) -> None:
        payload = DiverseDayUpdateSchema.model_validate(
            {
                "custom_subjects": [
                    {
                        "name": "Programacao",
                        "topics": [
                            {
                                "id": "question-loop",
                                "topic": "Como percorrer uma lista?",
                                "answer": "Use um loop",
                                "code_example": "for item in items:\n    print(item)",
                            }
                        ],
                        "lessons": [
                            {
                                "id": "lesson-loop",
                                "title": "Loops",
                                "topic_ids": ["question-loop"],
                            }
                        ],
                    }
                ]
            }
        )

        subject = payload.custom_subjects[0].model_dump(mode="json")

        self.assertEqual(subject["topics"][0]["id"], "question-loop")
        self.assertEqual(subject["topics"][0]["code_example"], "for item in items:\n    print(item)")
        self.assertEqual(subject["lessons"][0]["topic_ids"], ["question-loop"])
        self.assertNotIn("topics", subject["lessons"][0])

    def test_diverse_routes_normalize_reads_and_writes_to_canonical_storage(self) -> None:
        main = (API / "main.py").read_text(encoding="utf-8")
        get_body = main.split("def get_diverse_day(", 1)[1].split("@app.put", 1)[0]
        upsert_body = main.split("def upsert_diverse_day(", 1)[1].split("_LEVEL_LABELS", 1)[0]
        lesson_payload_body = main.split("def _lesson_payload", 1)[1].split("def ", 1)[0]

        self.assertIn("normalize_subjects", get_body)
        self.assertIn("normalize_subjects", upsert_body)
        self.assertIn('"id": subject.id', main)
        self.assertNotIn('"topics"', lesson_payload_body)

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

    def test_arbitrary_legacy_ids_do_not_split_equivalent_subject_questions(self) -> None:
        legacy = {
            "name": "Historia",
            "topics": [
                {
                    "id": "a",
                    "topic": "O que foi a Revolução Francesa?",
                    "answer": "Uma revolucao social e politica",
                    "review_count": 1,
                },
                {
                    "id": "b",
                    "topic": "o que foi a revolucao francesa!",
                    "answer": "",
                    "review_count": 3,
                    "last_rating": "knew",
                },
            ],
            "lessons": [
                {
                    "id": "lesson-history",
                    "title": "Revolucoes",
                    "topic_ids": ["a", "b"],
                    "topics": [
                        {
                            "id": "legacy-copy",
                            "topic": "O que foi a revolucao francesa",
                        }
                    ],
                }
            ],
        }

        subject = normalize_subject(legacy)

        self.assertEqual(len(subject["topics"]), 1)
        self.assertEqual(subject["topics"][0]["id"], "a")
        self.assertEqual(subject["topics"][0]["review_count"], 3)
        self.assertEqual(subject["topics"][0]["last_rating"], "knew")
        self.assertEqual(subject["lessons"][0]["topic_ids"], ["a"])
        self.assertEqual(normalize_subject(subject), subject)

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
