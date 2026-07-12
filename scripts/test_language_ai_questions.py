"""Focused persistence tests for canonical language lesson questions."""
from __future__ import annotations

import importlib.util
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from sqlalchemy import event, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine


ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
MIGRATION_PATH = API_DIR / "alembic" / "versions" / "0006_lesson_questions.py"
UNIQUE_MIGRATION_PATH = API_DIR / "alembic" / "versions" / "0007_lesson_question_front_keys.py"
sys.path.insert(0, str(API_DIR))

from models.database import ChildProfile, Lesson, LessonQuestion  # noqa: E402
from schemas.schemas import (  # noqa: E402
    GenerateLessonQuestionsSchema,
    LessonQuestionSchema,
    LessonSchema,
)
from services.language_question_service import (  # noqa: E402
    ALLOWED_LANGUAGE_QUESTION_TYPES,
    MAX_EXISTING_FRONTS_IN_PROMPT,
    MAX_LANGUAGE_QUESTION_PROMPT_CHARS,
    build_language_questions_prompt,
    front_key_for,
    validate_language_question_batch,
)


class LanguageQuestionGenerationTests(unittest.TestCase):
    def test_generation_schema_accepts_optional_context_and_limits_its_length(self) -> None:
        payload = GenerateLessonQuestionsSchema(context="  foco   em  pronomes  ")
        self.assertEqual(payload.context, "  foco   em  pronomes  ")
        with self.assertRaises(ValueError):
            GenerateLessonQuestionsSchema(context="x" * 1001)

    def test_prompt_uses_actual_languages_lesson_material_and_sanitized_context(self) -> None:
        prompt = build_language_questions_prompt(
            lesson_title="Les salutations",
            theme="Rencontres",
            objective="Se presenter poliment",
            target_language="French",
            base_language="Portuguese",
            lesson_items=[
                {
                    "word_en": "Bonjour",
                    "word_pt": "Ola",
                    "example_sentence_en": "Bonjour, Marie !",
                    "example_sentence_pt": "Ola, Marie!",
                }
            ],
            phrase_breakdowns=[
                {
                    "phrase_en": "Je m'appelle Lea",
                    "phrase_pt": "Eu me chamo Lea",
                    "word_by_word": [{"en": "Je", "pt": "Eu"}],
                }
            ],
            existing_fronts=["Comment dit-on ola ?"],
            context="  entrevista   oral\ncom pronomes  ",
        )

        for expected in (
            "Les salutations",
            "Rencontres",
            "Se presenter poliment",
            "French",
            "Portuguese",
            "Bonjour",
            "Je m'appelle Lea",
            "Comment dit-on ola ?",
            "entrevista oral com pronomes",
        ):
            self.assertIn(expected, prompt)
        for question_type in ALLOWED_LANGUAGE_QUESTION_TYPES:
            self.assertIn(question_type, prompt)
        self.assertIn("exatamente 5", prompt.lower())
        self.assertIn("pelo menos 3 tipos", prompt.lower())

    def test_prompt_bounds_history_and_large_lesson_content(self) -> None:
        history = [f"Historico {index}" for index in range(150)]
        prompt = build_language_questions_prompt(
            lesson_title="T" * 5000,
            theme="H" * 5000,
            objective="O" * 10000,
            target_language="French",
            base_language="Portuguese",
            lesson_items=[{"word_en": "W" * 5000, "extra": "X" * 5000} for _ in range(500)],
            phrase_breakdowns=[
                {"phrase_en": "P" * 5000, "word_by_word": [{"en": "E" * 5000}] * 100}
                for _ in range(500)
            ],
            existing_fronts=history,
            context="C" * 1000,
        )

        self.assertLessEqual(len(prompt), MAX_LANGUAGE_QUESTION_PROMPT_CHARS)
        first_retained = len(history) - MAX_EXISTING_FRONTS_IN_PROMPT
        self.assertNotIn(f'"Historico {first_retained - 1}"', prompt)
        self.assertIn(f'"Historico {first_retained}"', prompt)
        self.assertIn('"Historico 149"', prompt)
        self.assertNotIn("T" * 201, prompt)

    def test_validator_accepts_five_unique_questions_across_three_types(self) -> None:
        raw_questions = [
            {
                "front": "Traduza bom dia para o frances.",
                "back": "Bonjour.",
                "question_type": "translation",
                "supporting_example": "Bonjour, Marie !",
            },
            {
                "front": "Complete: Je ___ Lea.",
                "back": "m'appelle",
                "question_type": "sentence_completion",
            },
            {
                "front": "Qual pronome significa eu?",
                "back": "Je.",
                "question_type": "grammar",
            },
            {
                "front": "O que significa merci?",
                "back": "Obrigado.",
                "question_type": "vocabulary",
            },
            {
                "front": "Como responder a Comment ca va?",
                "back": "Ca va bien.",
                "question_type": "contextual_usage",
            },
        ]

        validated = validate_language_question_batch(raw_questions, ["Pergunta anterior"])

        self.assertEqual(len(validated), 5)
        self.assertEqual(validated[0].question_type, "translation")
        self.assertEqual(validated[0].supporting_example, "Bonjour, Marie !")

    def test_validator_rejects_unknown_type_and_insufficient_variety(self) -> None:
        base_questions = [
            {"front": f"Pergunta {index}?", "back": "Resposta", "question_type": question_type}
            for index, question_type in enumerate(
                ["grammar", "grammar", "translation", "translation", "grammar"], start=1
            )
        ]
        with self.assertRaisesRegex(ValueError, "at least three"):
            validate_language_question_batch(base_questions, [])

        base_questions[-1]["question_type"] = "interview"
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            validate_language_question_batch(base_questions, [])

    def test_validator_rejects_duplicates_and_enforces_saved_field_lengths(self) -> None:
        raw_questions = [
            {
                "front": "A" * 501 if index == 1 else f"Pergunta {index}?",
                "back": "Resposta",
                "question_type": ["grammar", "translation", "vocabulary"][index % 3],
            }
            for index in range(1, 6)
        ]
        with self.assertRaisesRegex(ValueError, "500"):
            validate_language_question_batch(raw_questions, [])

        raw_questions[0]["front"] = "Pergunta repetida?"
        raw_questions[1]["front"] = "Pergunta repetida!"
        with self.assertRaisesRegex(ValueError, "unique"):
            validate_language_question_batch(raw_questions, [])

    def test_validator_rejects_non_string_ai_fields_before_coercion(self) -> None:
        def valid_questions() -> list[dict]:
            return [
                {
                    "front": f"Pergunta estrita {index}?",
                    "back": f"Resposta {index}.",
                    "question_type": ["grammar", "translation", "vocabulary"][index % 3],
                    "supporting_example": None,
                }
                for index in range(1, 6)
            ]

        invalid_values = {
            "front": {"nested": "question"},
            "back": ["not", "text"],
            "question_type": 123,
            "supporting_example": {"nested": "example"},
        }
        for field, invalid_value in invalid_values.items():
            with self.subTest(field=field):
                questions = valid_questions()
                questions[0][field] = invalid_value
                with self.assertRaisesRegex(ValueError, f"{field} must be"):
                    validate_language_question_batch(questions, [])

    def test_main_declares_generation_route_and_canonical_question_query(self) -> None:
        source = (API_DIR / "main.py").read_text(encoding="utf-8")
        self.assertIn('"/api/lessons/{lesson_id}/questions/generate"', source)
        self.assertIn("GenerateLessonQuestionsSchema", source)
        self.assertIn("LessonQuestion", source)


class LessonQuestionPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        SQLModel.metadata.create_all(self.engine)

    def tearDown(self) -> None:
        SQLModel.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_model_persists_canonical_question_and_scheduling_defaults(self) -> None:
        with Session(self.engine) as session:
            child = ChildProfile(name="Ari", age_group="10-12", target_language="French")
            session.add(child)
            session.commit()
            session.refresh(child)
            lesson = Lesson(
                title="Les salutations",
                theme="Salutations",
                objective="Se presenter",
                child_id=child.id,
                target_language="French",
            )
            session.add(lesson)
            session.commit()
            session.refresh(lesson)

            before_insert = datetime.utcnow()
            question = LessonQuestion(
                child_id=child.id,
                lesson_id=lesson.id,
                target_language="French",
                question_type="translation",
                front="Comment dit-on bom dia en francais ?",
                front_key=front_key_for("Comment dit-on bom dia en francais ?"),
                back="Bonjour",
                supporting_example="Bonjour, Marie !",
            )
            session.add(question)
            session.commit()
            session.refresh(question)

            self.assertIsNotNone(question.id)
            self.assertEqual(question.difficulty_score, 0.45)
            self.assertEqual(question.attempt_count, 0)
            self.assertEqual(question.correct_count, 0)
            self.assertEqual(question.error_count, 0)
            self.assertEqual(question.streak, 0)
            self.assertIsNone(question.last_reviewed)
            self.assertGreaterEqual(question.next_review, before_insert)
            self.assertGreaterEqual(question.created_at, before_insert)

    def test_two_sessions_cannot_commit_same_normalized_front_for_one_lesson(self) -> None:
        with Session(self.engine) as setup_session:
            child = ChildProfile(name="Ari", age_group="10-12", target_language="French")
            setup_session.add(child)
            setup_session.flush()
            lesson = Lesson(
                title="Les salutations",
                theme="Salutations",
                objective="Se presenter",
                child_id=child.id,
                target_language="French",
            )
            setup_session.add(lesson)
            setup_session.commit()
            setup_session.refresh(child)
            setup_session.refresh(lesson)
            child_id = child.id or 0
            lesson_id = lesson.id or 0

        first_session = Session(self.engine)
        second_session = Session(self.engine)
        try:
            first_session.add(
                LessonQuestion(
                    child_id=child_id,
                    lesson_id=lesson_id,
                    target_language="French",
                    question_type="translation",
                    front="Comment dit-on bonjour ?",
                    front_key=front_key_for("Comment dit-on bonjour ?"),
                    back="Bonjour",
                )
            )
            first_session.commit()

            second_session.add(
                LessonQuestion(
                    child_id=child_id,
                    lesson_id=lesson_id,
                    target_language="French",
                    question_type="translation",
                    front="COMMENT DIT ON BONJOUR!",
                    front_key=front_key_for("COMMENT DIT ON BONJOUR!"),
                    back="Bonjour",
                )
            )
            with self.assertRaises(IntegrityError):
                second_session.commit()
            second_session.rollback()
        finally:
            first_session.close()
            second_session.close()

    def test_model_declares_child_and_lesson_indexes_and_foreign_keys(self) -> None:
        table = LessonQuestion.__table__
        self.assertEqual(
            {foreign_key.target_fullname for foreign_key in table.foreign_keys},
            {"childprofile.id", "lesson.id"},
        )

        database_indexes = {index["name"] for index in inspect(self.engine).get_indexes("lessonquestion")}
        self.assertIn("ix_lessonquestion_child_id", database_indexes)
        self.assertIn("ix_lessonquestion_lesson_id", database_indexes)

        with self.engine.begin() as connection:
            with self.assertRaises(IntegrityError):
                connection.execute(
                    text(
                        "INSERT INTO lessonquestion "
                        "(child_id, lesson_id, target_language, question_type, front, front_key, back, "
                        "difficulty_score, attempt_count, correct_count, error_count, streak, "
                        "next_review, created_at) VALUES "
                        "(999, 999, 'French', 'grammar', 'Question', "
                        f"'{front_key_for('Question')}', 'Answer', "
                        "0.45, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                    )
                )

    def test_response_schema_exposes_saved_questions_and_defaults_to_empty(self) -> None:
        created_at = datetime.utcnow()
        question = LessonQuestionSchema(
            id=7,
            lesson_id=3,
            target_language="French",
            question_type="grammar",
            front="Completez la phrase.",
            back="Je suis ici.",
            supporting_example=None,
            created_at=created_at,
        )
        lesson = LessonSchema(
            id=3,
            title="Pronoms",
            theme="Grammaire",
            objective="Employer je",
            content={},
            questions=[question],
        )

        self.assertEqual(lesson.questions[0].id, 7)
        self.assertEqual(lesson.questions[0].target_language, "French")

        empty_lesson = LessonSchema(
            id=4,
            title="Vide",
            theme="Test",
            objective="Tester",
            content={},
        )
        self.assertEqual(empty_lesson.questions, [])

    def test_migration_has_expected_revision_and_operations(self) -> None:
        self.assertTrue(MIGRATION_PATH.exists())
        spec = importlib.util.spec_from_file_location("lesson_questions_migration", MIGRATION_PATH)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader if spec else None)
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(module)

        self.assertEqual(module.revision, "0006")
        self.assertEqual(module.down_revision, "0005")
        source = MIGRATION_PATH.read_text(encoding="utf-8")
        self.assertIn('op.create_table(\n        "lessonquestion"', source)
        self.assertIn('op.create_index("ix_lessonquestion_child_id"', source)
        self.assertIn('op.create_index("ix_lessonquestion_lesson_id"', source)
        self.assertLess(
            source.index('op.drop_index("ix_lessonquestion_lesson_id"'),
            source.index('op.drop_table("lessonquestion")'),
        )
        self.assertLess(
            source.index('op.drop_index("ix_lessonquestion_child_id"'),
            source.index('op.drop_table("lessonquestion")'),
        )

    def test_front_key_migration_backfills_and_adds_database_uniqueness(self) -> None:
        self.assertTrue(UNIQUE_MIGRATION_PATH.exists())
        source = UNIQUE_MIGRATION_PATH.read_text(encoding="utf-8")
        self.assertIn('revision: str = "0007"', source)
        self.assertIn('down_revision: Union[str, None] = "0006"', source)
        self.assertIn('sa.Column("front_key", sa.String(length=64)', source)
        self.assertIn("normalize_front", source)
        self.assertIn("uq_lessonquestion_child_lesson_front_key", source)
        self.assertIn("batch_alter_table", source)

    def test_front_key_migration_preserves_legacy_duplicates_and_reserves_canonical_key(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lesson-question-migration-") as temp_dir:
            database_path = Path(temp_dir) / "migration.sqlite"
            environment = {
                **os.environ,
                "DATABASE_URL": f"sqlite:///{database_path.as_posix()}",
            }

            def migrate(revision: str) -> None:
                subprocess.run(
                    [sys.executable, "-m", "alembic", "upgrade", revision],
                    cwd=API_DIR,
                    env=environment,
                    check=True,
                    capture_output=True,
                    text=True,
                )

            migrate("0006")
            connection = sqlite3.connect(database_path)
            try:
                connection.execute(
                    "INSERT INTO childprofile (id, name, age_group, created_at) "
                    "VALUES (1, 'Ari', '10-12', CURRENT_TIMESTAMP)"
                )
                connection.execute(
                    "INSERT INTO lesson (id, title, theme, objective, content, is_completed) "
                    "VALUES (1, 'Salut', 'Salut', 'Dire bonjour', '{}', 0)"
                )
                for question_id, front in (
                    (1, "Comment dit-on bonjour ?"),
                    (2, "COMMENT DIT ON BONJOUR!"),
                ):
                    connection.execute(
                        "INSERT INTO lessonquestion "
                        "(id, child_id, lesson_id, target_language, question_type, front, back, "
                        "difficulty_score, attempt_count, correct_count, error_count, streak, "
                        "next_review, created_at) VALUES "
                        "(?, 1, 1, 'French', 'translation', ?, 'Bonjour', "
                        "0.45, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                        (question_id, front),
                    )
                connection.commit()
            finally:
                connection.close()

            migrate("head")
            connection = sqlite3.connect(database_path)
            try:
                rows = connection.execute(
                    "SELECT id, front_key FROM lessonquestion ORDER BY id"
                ).fetchall()
                self.assertEqual(len(rows), 2)
                self.assertEqual(rows[0][1], front_key_for("Comment dit-on bonjour ?"))
                self.assertNotEqual(rows[0][1], rows[1][1])
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO lessonquestion "
                        "(child_id, lesson_id, target_language, question_type, front, front_key, back, "
                        "difficulty_score, attempt_count, correct_count, error_count, streak, "
                        "next_review, created_at) VALUES "
                        "(1, 1, 'French', 'translation', 'Bonjour duplicate', ?, 'Bonjour', "
                        "0.45, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                        (front_key_for("Comment dit-on bonjour ?"),),
                    )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
