"""Focused persistence tests for canonical language lesson questions."""
from __future__ import annotations

import importlib.util
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import event, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine


ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
MIGRATION_PATH = API_DIR / "alembic" / "versions" / "0006_lesson_questions.py"
UNIQUE_MIGRATION_PATH = API_DIR / "alembic" / "versions" / "0007_lesson_question_front_keys.py"
sys.path.insert(0, str(API_DIR))

from models.database import ChildProfile, Lesson, LessonQuestion, ReviewItem  # noqa: E402
from schemas.schemas import (  # noqa: E402
    GenerateLessonQuestionsSchema,
    LessonQuestionSchema,
    LessonSchema,
    ReviewAttemptSchema,
    ReviewResultSchema,
    ReviewSessionSchema,
)
from services.language_question_service import (  # noqa: E402
    ALLOWED_LANGUAGE_QUESTION_TYPES,
    MAX_EXISTING_FRONTS_IN_PROMPT,
    MAX_LANGUAGE_QUESTION_PROMPT_CHARS,
    build_language_questions_prompt,
    front_key_for,
    register_lesson_question_attempt,
    validate_language_question_batch,
)
from services.review_service import (  # noqa: E402
    build_mixed_review_cards,
    count_due_mixed_review_items,
    register_review_attempt,
)


class LanguageQuestionLessonUIContractTests(unittest.TestCase):
    def test_client_exposes_canonical_questions_and_generation_request(self) -> None:
        source = (ROOT / "apps" / "web" / "src" / "lib" / "api.ts").read_text(
            encoding="utf-8"
        )

        self.assertIn("export interface LessonQuestion", source)
        lesson_interface = source.split("export interface Lesson {", 1)[1].split("}\n", 1)[0]
        self.assertIn("questions: LessonQuestion[];", lesson_interface)
        generation = source.split("generateLessonQuestions:", 1)[1].split(
            "completeLesson:", 1
        )[0]
        self.assertIn("/api/lessons/${lessonId}/questions/generate", generation)
        self.assertIn("fetchAPI<LessonQuestion[]>", generation)
        self.assertIn("method: 'POST'", generation)
        self.assertIn("context: context?.trim() || null", generation)

    def test_lesson_renders_canonical_questions_and_safe_inline_generation(self) -> None:
        source = (ROOT / "apps" / "web" / "src" / "app" / "lesson" / "page.tsx").read_text(
            encoding="utf-8"
        )

        for expected in (
            "lesson.questions.map",
            "Criar mais quest",
            "lessonQuestionContext",
            "maxLength={1000}",
            "5 novas quest",
            "<details",
            "supporting_example",
            "generateLessonQuestions",
            "mergeLessonQuestionsById",
            "validateConfirmedLessonQuestionBatch",
            "isUncertainLessonQuestionGenerationError",
            "activeLessonIdRef.current !== requestLessonId",
            "generationRequestRef.current !== requestToken",
            "generationRequestRef.current",
        ):
            self.assertIn(expected, source)

        generation = source.split("async function handleGenerateLessonQuestions", 1)[1].split(
            "\n  if (authState.status", 1
        )[0]
        self.assertIn("setLesson((currentLesson)", generation)
        self.assertNotIn("loadLesson()", generation)
        self.assertIn("Recarregue a licao antes de tentar novamente", generation)


class LanguageQuestionReviewUIContractTests(unittest.TestCase):
    def test_client_models_mixed_review_as_a_discriminated_union(self) -> None:
        source = (ROOT / "apps" / "web" / "src" / "lib" / "api.ts").read_text(
            encoding="utf-8"
        )

        vocabulary = source.split("export interface VocabularyReviewCard", 1)[1].split(
            "}\n", 1
        )[0]
        lesson_question = source.split(
            "export interface LessonQuestionReviewCard", 1
        )[1].split("}\n", 1)[0]
        attempt = source.split("export type ReviewAttemptPayload", 1)[1].split(
            "export interface ChatMessage", 1
        )[0]

        self.assertIn("card_type: 'vocabulary'", vocabulary)
        self.assertIn("review_item_id: number", vocabulary)
        self.assertIn("word_en: string", vocabulary)
        self.assertIn("card_type: 'lesson_question'", lesson_question)
        self.assertIn("lesson_question_id: number", lesson_question)
        self.assertIn("supporting_example: string | null", lesson_question)
        self.assertIn(
            "export type ReviewCard = VocabularyReviewCard | LessonQuestionReviewCard",
            source,
        )
        self.assertIn("card_type: 'vocabulary'", attempt)
        self.assertIn("card_type: 'lesson_question'", attempt)
        self.assertIn("lesson_question_id: number", attempt)
        self.assertIn("submitReviewAttempt: (payload: ReviewAttemptPayload)", source)

    def test_review_preserves_vocabulary_flow_and_grades_lesson_questions(self) -> None:
        source = (
            ROOT / "apps" / "web" / "src" / "app" / "review" / "page.tsx"
        ).read_text(encoding="utf-8")

        self.assertIn("card.card_type === 'lesson_question'", source)
        self.assertIn("card.word_en", source)
        self.assertIn("card.word_pt", source)
        self.assertIn("card.prompt", source)
        self.assertIn("card.answer", source)
        self.assertIn("card.supporting_example", source)
        self.assertIn("Nao sabia", source)
        self.assertIn("Sabia", source)
        for expected in (
            "const CONFIDENCE_LEVELS",
            "const [flipped, setFlipped]",
            "const [audioSpeed, setAudioSpeed]",
            "Virar carta",
            "Traducao",
            "Como voce se saiu?",
            "handleVocabularyConfidence",
            "beginMixedReviewSubmission",
            "revealMixedReviewLessonAnswer",
            "advanceReview(true)",
            "captureReviewAttempt",
            "isReviewAttemptCompletionCurrent",
            "reviewSessionEpochRef.current += 1",
        ):
            self.assertIn(expected, source)
        self.assertNotIn("selectedVocabularyOption", source)

        grading = source.split("async function handleLessonQuestionAnswer", 1)[1].split(
            "\n  function handleNext", 1
        )[0]
        self.assertIn("buildReviewAttemptPayload(card, correct)", grading)
        self.assertIn("beginMixedReviewSubmission", grading)
        self.assertIn("captureReviewAttempt", grading)
        self.assertIn("isReviewAttemptCompletionCurrent", grading)
        self.assertIn("advanceReview", grading)
        self.assertIn("runLessonQuestionGeneration", source)

    def test_review_generation_uses_dynamic_lessons_and_safe_request_recovery(self) -> None:
        source = (
            ROOT / "apps" / "web" / "src" / "app" / "review" / "page.tsx"
        ).read_text(encoding="utf-8")

        for expected in (
            "api.getAllLessons()",
            "api.getParentSettings()",
            "selectedLessonId",
            "targetLanguage",
            "Criar mais quest",
            "maxLength={1000}",
            "5 novas quest",
            "generateLessonQuestions",
            "validateConfirmedLessonQuestionBatch",
            "isUncertainLessonQuestionGenerationError",
            "generationRequestRef.current",
            "generationInFlightRef.current",
            "generationNeedsReviewReload",
            "mountedRef.current",
            "requestLessonId",
            "reloadReviewAfterGeneration",
            "generationError.status === 409",
        ):
            self.assertIn(expected, source)

        generation = source.split("async function handleGenerateLessonQuestions", 1)[1].split(
            "\n  async function handleGenerationRecoveryReload", 1
        )[0]
        self.assertIn("validate: validateConfirmedLessonQuestionBatch", generation)
        self.assertIn("reload: () => reloadReviewAfterGeneration", generation)
        self.assertIn("selectedLessonIdRef.current === requestLessonId", generation)
        self.assertIn("generationRequestRef.current === requestToken", generation)
        self.assertNotIn("French", generation)
        self.assertNotIn("English", generation)
        self.assertIn("finally", generation)
        self.assertIn("generationRequestRef.current === requestToken", generation)

        quick_review = (
            ROOT / "apps" / "web" / "src" / "app" / "quick-review" / "page.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn("vocabularyOnly: true", quick_review)
        self.assertIn("ReviewSession<VocabularyReviewCard>", quick_review)


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


class MixedLanguageReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)

    def tearDown(self) -> None:
        SQLModel.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _seed_children_and_lessons(self, session: Session) -> tuple[int, int, int, int]:
        child = ChildProfile(name="Ari", age_group="10-12", target_language="French")
        foreign_child = ChildProfile(name="Bia", age_group="10-12", target_language="French")
        session.add(child)
        session.add(foreign_child)
        session.flush()
        lesson = Lesson(
            title="Les salutations",
            theme="Salutations",
            objective="Se presenter",
            child_id=child.id,
            target_language="French",
        )
        foreign_lesson = Lesson(
            title="Les nombres",
            theme="Nombres",
            objective="Compter",
            child_id=foreign_child.id,
            target_language="French",
        )
        session.add(lesson)
        session.add(foreign_lesson)
        session.flush()
        return child.id or 0, lesson.id or 0, foreign_child.id or 0, foreign_lesson.id or 0

    def test_review_schemas_discriminate_cards_and_validate_attempt_identifiers(self) -> None:
        session = ReviewSessionSchema(
            total_due=2,
            items=[
                {
                    "card_type": "vocabulary",
                    "review_item_id": 4,
                    "prompt": "O que significa bonjour?",
                    "answer": "ola",
                    "options": ["ola", "tchau"],
                    "word_en": "bonjour",
                    "word_pt": "ola",
                    "difficulty_score": 0.5,
                    "error_count": 0,
                },
                {
                    "card_type": "lesson_question",
                    "lesson_question_id": 8,
                    "lesson_id": 2,
                    "prompt": "Completez: Je ___ ici.",
                    "answer": "suis",
                    "question_type": "sentence_completion",
                    "supporting_example": None,
                    "difficulty_score": 0.45,
                    "error_count": 0,
                },
            ],
        )
        self.assertEqual([item.card_type for item in session.items], ["vocabulary", "lesson_question"])

        legacy_vocabulary = ReviewAttemptSchema(word_en="bonjour", word_pt="ola", correct=True)
        self.assertEqual(legacy_vocabulary.card_type, "vocabulary")
        identified_vocabulary = ReviewAttemptSchema(
            card_type="vocabulary", review_item_id=4, correct=False
        )
        self.assertEqual(identified_vocabulary.review_item_id, 4)
        lesson_attempt = ReviewAttemptSchema(
            card_type="lesson_question", lesson_question_id=8, correct=True
        )
        self.assertEqual(lesson_attempt.lesson_question_id, 8)

        invalid_payloads = (
            {"card_type": "lesson_question", "correct": True},
            {"card_type": "lesson_question", "lesson_question_id": 8, "review_item_id": 4, "correct": True},
            {"card_type": "vocabulary", "lesson_question_id": 8, "correct": True},
            {"card_type": "vocabulary", "correct": True},
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                ReviewAttemptSchema(**payload)

        result = ReviewResultSchema(
            card_type="lesson_question",
            card_id=8,
            difficulty_score=0.3,
            next_review=datetime.utcnow(),
            error_count=0,
            correct_count=1,
        )
        self.assertEqual(result.card_id, 8)

    def test_mixed_cards_sort_due_items_once_apply_one_limit_and_exclude_foreign_or_future(self) -> None:
        now = datetime.utcnow()
        with Session(self.engine) as session:
            child_id, lesson_id, foreign_child_id, foreign_lesson_id = self._seed_children_and_lessons(session)
            vocabulary = ReviewItem(
                child_id=child_id,
                word_en="bonjour",
                word_pt="ola",
                difficulty_score=0.8,
                error_count=2,
                next_review=now - timedelta(hours=1),
            )
            future_vocabulary = ReviewItem(
                child_id=child_id,
                word_en="demain",
                word_pt="amanha",
                difficulty_score=1.0,
                error_count=8,
                next_review=now + timedelta(days=1),
            )
            question = LessonQuestion(
                child_id=child_id,
                lesson_id=lesson_id,
                target_language="French",
                question_type="grammar",
                front="Completez: Je ___ ici.",
                front_key=front_key_for("Completez: Je ___ ici."),
                back="suis",
                difficulty_score=0.9,
                error_count=4,
                next_review=now - timedelta(hours=2),
            )
            foreign_question = LessonQuestion(
                child_id=foreign_child_id,
                lesson_id=foreign_lesson_id,
                target_language="French",
                question_type="vocabulary",
                front="Combien?",
                front_key=front_key_for("Combien?"),
                back="Quanto?",
                difficulty_score=1.0,
                error_count=10,
                next_review=now - timedelta(days=3),
            )
            session.add(vocabulary)
            session.add(future_vocabulary)
            session.add(question)
            session.add(foreign_question)
            session.commit()

            cards = build_mixed_review_cards(session=session, child_id=child_id, limit=2, now=now)
            self.assertEqual([card["card_type"] for card in cards], ["lesson_question", "vocabulary"])
            self.assertEqual(len(cards), 2)
            self.assertEqual(cards[0]["prompt"], question.front)
            self.assertEqual(cards[0]["answer"], question.back)
            self.assertEqual(cards[1]["answer"], vocabulary.word_pt)
            self.assertNotIn(future_vocabulary.id, [card.get("review_item_id") for card in cards])
            self.assertNotIn(foreign_question.id, [card.get("lesson_question_id") for card in cards])
            self.assertEqual(count_due_mixed_review_items(session, child_id, now=now), 2)
            self.assertEqual(build_mixed_review_cards(session, child_id, limit=0, now=now), [])

    def test_mixed_cards_have_stable_tie_order_and_empty_child_is_empty(self) -> None:
        now = datetime.utcnow()
        with Session(self.engine) as session:
            child_id, lesson_id, _, _ = self._seed_children_and_lessons(session)
            for index in range(2):
                front = f"Question {index}"
                session.add(
                    LessonQuestion(
                        child_id=child_id,
                        lesson_id=lesson_id,
                        target_language="French",
                        question_type="grammar",
                        front=front,
                        front_key=front_key_for(front),
                        back=f"Reponse {index}",
                        difficulty_score=0.5,
                        next_review=now - timedelta(minutes=10),
                    )
                )
            session.commit()
            first = build_mixed_review_cards(session, child_id, limit=5, now=now)
            second = build_mixed_review_cards(session, child_id, limit=5, now=now)
            self.assertEqual(
                [card["lesson_question_id"] for card in first],
                [card["lesson_question_id"] for card in second],
            )
            self.assertEqual(build_mixed_review_cards(session, 9999, limit=5, now=now), [])

    def test_mixed_builder_loads_each_due_table_once_and_never_loads_future_rows(self) -> None:
        now = datetime.utcnow()
        statements: list[str] = []

        @event.listens_for(self.engine, "before_cursor_execute")
        def capture_sql(_connection, _cursor, statement, _parameters, _context, _many) -> None:
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement.lower())

        try:
            with Session(self.engine) as session:
                child_id, lesson_id, _, _ = self._seed_children_and_lessons(session)
                session.add(
                    ReviewItem(
                        child_id=child_id,
                        word_en="bonjour",
                        word_pt="ola",
                        next_review=now - timedelta(minutes=1),
                    )
                )
                session.add(
                    ReviewItem(
                        child_id=child_id,
                        word_en="demain",
                        word_pt="amanha",
                        next_review=now + timedelta(days=1),
                    )
                )
                session.add(
                    LessonQuestion(
                        child_id=child_id,
                        lesson_id=lesson_id,
                        target_language="French",
                        question_type="translation",
                        front="Traduisez ola.",
                        front_key=front_key_for("Traduisez ola."),
                        back="bonjour",
                        next_review=now - timedelta(minutes=1),
                    )
                )
                session.commit()
                statements.clear()

                cards = build_mixed_review_cards(session, child_id, limit=5, now=now)

            review_selects = [sql for sql in statements if "from reviewitem" in sql]
            question_selects = [sql for sql in statements if "from lessonquestion" in sql]
            self.assertEqual(len(review_selects), 1, review_selects)
            self.assertEqual(len(question_selects), 1, question_selects)
            self.assertIn("next_review <=", review_selects[0])
            self.assertIn("next_review <=", question_selects[0])
            self.assertNotIn("demain", [card.get("word_en") for card in cards])
        finally:
            event.remove(self.engine, "before_cursor_execute", capture_sql)

    def test_due_count_uses_two_sql_counts_without_loading_review_entities(self) -> None:
        now = datetime.utcnow()
        statements: list[str] = []

        @event.listens_for(self.engine, "before_cursor_execute")
        def capture_sql(_connection, _cursor, statement, _parameters, _context, _many) -> None:
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement.lower())

        try:
            with Session(self.engine) as session:
                child_id, lesson_id, _, _ = self._seed_children_and_lessons(session)
                session.add(
                    ReviewItem(
                        child_id=child_id,
                        word_en="bonjour",
                        word_pt="ola",
                        next_review=now - timedelta(minutes=1),
                    )
                )
                session.add(
                    LessonQuestion(
                        child_id=child_id,
                        lesson_id=lesson_id,
                        target_language="French",
                        question_type="translation",
                        front="Traduisez ola.",
                        front_key=front_key_for("Traduisez ola."),
                        back="bonjour",
                        next_review=now - timedelta(minutes=1),
                    )
                )
                session.commit()
                statements.clear()

                self.assertEqual(count_due_mixed_review_items(session, child_id, now=now), 2)

            self.assertEqual(len(statements), 2, statements)
            self.assertTrue(all("count(" in sql for sql in statements), statements)
            self.assertTrue(all("next_review <=" in sql for sql in statements), statements)
        finally:
            event.remove(self.engine, "before_cursor_execute", capture_sql)

    def test_lesson_question_attempt_updates_only_owned_question_with_vocabulary_schedule_unchanged(self) -> None:
        now = datetime.utcnow()
        with Session(self.engine) as session:
            child_id, lesson_id, foreign_child_id, foreign_lesson_id = self._seed_children_and_lessons(session)
            vocabulary = ReviewItem(
                child_id=child_id,
                word_en="bonjour",
                word_pt="ola",
                next_review=now,
            )
            question = LessonQuestion(
                child_id=child_id,
                lesson_id=lesson_id,
                target_language="French",
                question_type="translation",
                front="Traduisez: ola",
                front_key=front_key_for("Traduisez: ola"),
                back="bonjour",
                next_review=now,
            )
            foreign_question = LessonQuestion(
                child_id=foreign_child_id,
                lesson_id=foreign_lesson_id,
                target_language="French",
                question_type="translation",
                front="Traduisez: dois",
                front_key=front_key_for("Traduisez: dois"),
                back="deux",
                next_review=now,
            )
            session.add(vocabulary)
            session.add(question)
            session.add(foreign_question)
            session.commit()
            vocabulary_due = vocabulary.next_review

            updated = register_lesson_question_attempt(
                session=session,
                child_id=child_id,
                lesson_question_id=question.id or 0,
                correct=True,
                now=now,
            )
            self.assertEqual(updated.attempt_count, 1)
            self.assertEqual(updated.correct_count, 1)
            self.assertEqual(updated.error_count, 0)
            self.assertEqual(updated.streak, 1)
            self.assertGreater(updated.next_review, now)
            self.assertIsNone(updated.next_review.tzinfo)
            self.assertEqual(vocabulary.next_review, vocabulary_due)

            with self.assertRaisesRegex(ValueError, "not found"):
                register_lesson_question_attempt(
                    session=session,
                    child_id=child_id,
                    lesson_question_id=foreign_question.id or 0,
                    correct=False,
                    now=now,
                )

            retried = register_lesson_question_attempt(
                session=session,
                child_id=child_id,
                lesson_question_id=question.id or 0,
                correct=False,
                now=now,
            )
            self.assertEqual(retried.attempt_count, 2)
            self.assertEqual(retried.error_count, 1)
            self.assertEqual(retried.streak, 0)
            self.assertEqual(retried.next_review, now + timedelta(minutes=15))

    def test_vocabulary_attempt_by_identifier_rejects_foreign_ownership(self) -> None:
        with Session(self.engine) as session:
            child_id, _, foreign_child_id, _ = self._seed_children_and_lessons(session)
            foreign_vocabulary = ReviewItem(
                child_id=foreign_child_id,
                word_en="deux",
                word_pt="dois",
            )
            session.add(foreign_vocabulary)
            session.commit()

            with self.assertRaisesRegex(ValueError, "not found"):
                register_review_attempt(
                    session=session,
                    child_id=child_id,
                    word_en="deux",
                    word_pt="dois",
                    correct=True,
                    review_item_id=foreign_vocabulary.id,
                )


if __name__ == "__main__":
    unittest.main()
