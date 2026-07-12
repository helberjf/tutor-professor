from __future__ import annotations

import hashlib
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
BOOTSTRAP = API / "database_bootstrap.py"
sys.path.insert(0, str(API))

import database_bootstrap  # noqa: E402
from services.language_question_service import front_key_for  # noqa: E402


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def run_alembic(database: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = sqlite_url(database)
    return subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", *arguments],
        cwd=API,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def run_bootstrap(database: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(BOOTSTRAP), "--database-url", sqlite_url(database)],
        cwd=API,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        check=False,
    )


def run_create_all(
    database: Path, *, include_lesson_question: bool, mutation: str = ""
) -> subprocess.CompletedProcess[str]:
    remove_lesson_question = (
        "" if include_lesson_question else "SQLModel.metadata.remove(LessonQuestion.__table__);"
    )
    source = (
        "from sqlmodel import SQLModel, create_engine;"
        "from sqlalchemy import UniqueConstraint;"
        "from models.database import (LessonQuestion, ProgrammingFlashcard, UserAISettings);"
        f"{remove_lesson_question}"
        f"{mutation}"
        f"engine=create_engine({sqlite_url(database)!r});"
        "SQLModel.metadata.create_all(engine);engine.dispose()"
    )
    return subprocess.run(
        [sys.executable, "-c", source],
        cwd=API,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        check=False,
    )


def current_revision(database: Path) -> str | None:
    with sqlite3.connect(database) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return None
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        return row[0] if row else None


def lesson_question_columns(database: Path) -> set[str]:
    with sqlite3.connect(database) as connection:
        return {row[1] for row in connection.execute("PRAGMA table_info('lessonquestion')")}


def has_lesson_question_identity(database: Path) -> bool:
    expected = ("child_id", "lesson_id", "front_key")
    with sqlite3.connect(database) as connection:
        for index_row in connection.execute("PRAGMA index_list('lessonquestion')"):
            if not index_row[2]:
                continue
            columns = tuple(
                row[2]
                for row in connection.execute(
                    f"PRAGMA index_info('{index_row[1]}')"
                )
            )
            if columns == expected:
                return True
    return False


def insert_language_fixture(
    database: Path, questions: list[tuple[int, str, str]]
) -> None:
    with sqlite3.connect(database) as connection:
        connection.execute(
            'INSERT INTO "user" '
            "(id, first_name, last_name, email, cpf_hash, password_hash, auth_provider, created_at) "
            "VALUES (1, 'Ada', 'Lovelace', 'ada@example.test', 'cpf', 'hash', "
            "'password', CURRENT_TIMESTAMP)"
        )
        connection.execute(
            "INSERT INTO childprofile "
            "(id, user_id, name, age_group, base_language, current_level, streak_count, "
            "voice_preference, auto_audio, target_language, created_at) "
            "VALUES (1, 1, 'Student', '10-12', 'Portuguese', 1, 0, 'af_bella', 1, "
            "'French', CURRENT_TIMESTAMP)"
        )
        connection.execute(
            "INSERT INTO lesson "
            "(id, title, theme, objective, content, is_completed, child_id, target_language) "
            "VALUES (1, 'French verbs', 'Verbs', 'Practice', '{}', 0, 1, 'French')"
        )
        for question_id, front, front_key in questions:
            connection.execute(
                "INSERT INTO lessonquestion "
                "(id, child_id, lesson_id, target_language, question_type, front, front_key, "
                "back, difficulty_score, attempt_count, correct_count, error_count, streak, "
                "next_review, created_at) "
                "VALUES (?, 1, 1, 'French', 'translation', ?, ?, 'Ola', "
                "0.45, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                (question_id, front, front_key),
            )


class DatabaseBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.database = Path(self.temp_dir.name) / "test.sqlite"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def assert_bootstrap_succeeds(self) -> None:
        result = run_bootstrap(self.database)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(current_revision(self.database), "0007")
        self.assertIn("front_key", lesson_question_columns(self.database))
        self.assertTrue(has_lesson_question_identity(self.database))

    def test_empty_database_upgrades_to_head_and_is_idempotent(self) -> None:
        self.assert_bootstrap_succeeds()
        self.assert_bootstrap_succeeds()

    def test_unversioned_legacy_create_all_shape_stamps_0005_then_upgrades(self) -> None:
        result = run_create_all(self.database, include_lesson_question=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with sqlite3.connect(self.database) as connection:
            connection.execute(
                'INSERT INTO "user" '
                "(id, first_name, last_name, email, cpf_hash, password_hash, auth_provider, created_at) "
                "VALUES (1, 'Ada', 'Lovelace', 'ada@example.test', 'cpf', 'hash', "
                "'password', CURRENT_TIMESTAMP)"
            )

        self.assert_bootstrap_succeeds()
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(
                connection.execute('SELECT email FROM "user" WHERE id = 1').fetchone()[0],
                "ada@example.test",
            )
        self.assert_bootstrap_succeeds()

    def test_unversioned_0006_shape_is_upgraded_instead_of_stamped_head(self) -> None:
        result = run_create_all(self.database, include_lesson_question=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = run_alembic(self.database, "stamp", "0005")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = run_alembic(self.database, "upgrade", "0006")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with sqlite3.connect(self.database) as connection:
            connection.execute(
                'INSERT INTO "user" '
                "(id, first_name, last_name, email, cpf_hash, password_hash, auth_provider, created_at) "
                "VALUES (1, 'Grace', 'Hopper', 'grace@example.test', 'cpf', 'hash', "
                "'password', CURRENT_TIMESTAMP)"
            )
            connection.execute(
                "INSERT INTO childprofile "
                "(id, user_id, name, age_group, base_language, current_level, streak_count, "
                "voice_preference, auto_audio, target_language, created_at) "
                "VALUES (1, 1, 'Student', '10-12', 'Portuguese', 1, 0, 'af_bella', 1, "
                "'French', CURRENT_TIMESTAMP)"
            )
            connection.execute(
                "INSERT INTO lesson "
                "(id, title, theme, objective, content, is_completed, child_id, target_language) "
                "VALUES (1, 'French verbs', 'Verbs', 'Practice', '{}', 0, 1, 'French')"
            )
            connection.execute(
                "INSERT INTO lessonquestion "
                "(id, child_id, lesson_id, target_language, question_type, front, back, "
                "difficulty_score, attempt_count, correct_count, error_count, streak, next_review, created_at) "
                "VALUES (1, 1, 1, 'French', 'translation', 'Bonjour?', 'Olá', "
                "0.45, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
            connection.execute("DROP TABLE alembic_version")

        self.assert_bootstrap_succeeds()
        with sqlite3.connect(self.database) as connection:
            row = connection.execute(
                "SELECT front, back, front_key FROM lessonquestion WHERE id = 1"
            ).fetchone()
        self.assertEqual(row[0:2], ("Bonjour?", "Olá"))
        self.assertEqual(len(row[2]), 64)

    def test_unversioned_head_shaped_database_is_stamped_without_data_loss(self) -> None:
        result = run_create_all(self.database, include_lesson_question=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        insert_language_fixture(
            self.database,
            [(1, "Bonjour?", front_key_for("Bonjour?"))],
        )

        self.assert_bootstrap_succeeds()
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM "user"').fetchone()[0], 1)
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO lessonquestion "
                    "(id, child_id, lesson_id, target_language, question_type, front, front_key, "
                    "back, difficulty_score, attempt_count, correct_count, error_count, streak, "
                    "next_review, created_at) "
                    "VALUES (2, 1, 1, 'French', 'translation', 'BONJOUR!', ?, 'Hello', "
                    "0.45, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    (front_key_for("BONJOUR!"),),
                )
        self.assert_bootstrap_succeeds()

    def test_unversioned_head_shape_with_noncanonical_front_key_is_rejected(self) -> None:
        result = run_create_all(self.database, include_lesson_question=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        insert_language_fixture(
            self.database,
            [(1, "Bonjour?", "f" * 64)],
        )

        result = run_bootstrap(self.database)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("front_key", result.stdout + result.stderr)
        self.assertIsNone(current_revision(self.database))
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT front_key FROM lessonquestion WHERE id = 1"
                ).fetchone()[0],
                "f" * 64,
            )

    def test_unversioned_head_shape_accepts_exact_legacy_duplicate_keys(self) -> None:
        result = run_create_all(self.database, include_lesson_question=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        canonical_key = front_key_for("Bonjour?")
        duplicate_key = hashlib.sha256(
            f"{canonical_key}\0legacy-2".encode("utf-8")
        ).hexdigest()
        insert_language_fixture(
            self.database,
            [
                (1, "Bonjour?", canonical_key),
                (2, "BONJOUR!", duplicate_key),
            ],
        )

        self.assert_bootstrap_succeeds()
        with sqlite3.connect(self.database) as connection:
            rows = connection.execute(
                "SELECT id, front_key FROM lessonquestion ORDER BY id"
            ).fetchall()
        self.assertEqual(rows, [(1, canonical_key), (2, duplicate_key)])

    def test_front_key_without_unique_identity_is_rejected_without_stamping(self) -> None:
        result = run_create_all(self.database, include_lesson_question=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = run_alembic(self.database, "stamp", "0005")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = run_alembic(self.database, "upgrade", "0006")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with sqlite3.connect(self.database) as connection:
            connection.execute("ALTER TABLE lessonquestion ADD COLUMN front_key VARCHAR(64)")
            connection.execute("DROP TABLE alembic_version")

        result = run_bootstrap(self.database)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("lessonquestion", (result.stdout + result.stderr).lower())
        self.assertIsNone(current_revision(self.database))

    def test_legacy_shape_missing_code_example_is_rejected(self) -> None:
        result = run_create_all(self.database, include_lesson_question=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with sqlite3.connect(self.database) as connection:
            connection.execute("ALTER TABLE programmingflashcard DROP COLUMN code_example")

        result = run_bootstrap(self.database)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("programmingflashcard", result.stdout + result.stderr)
        self.assertIn("code_example", result.stdout + result.stderr)
        self.assertIsNone(current_revision(self.database))

    def test_legacy_shape_missing_index_is_rejected(self) -> None:
        mutation = (
            "ProgrammingFlashcard.__table__.indexes.remove("
            "next(index for index in ProgrammingFlashcard.__table__.indexes "
            "if index.name == 'ix_programmingflashcard_topic_id'));"
        )
        result = run_create_all(
            self.database, include_lesson_question=False, mutation=mutation
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        result = run_bootstrap(self.database)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("index", (result.stdout + result.stderr).lower())
        self.assertIsNone(current_revision(self.database))

    def test_legacy_shape_missing_foreign_key_is_rejected(self) -> None:
        mutation = (
            "ProgrammingFlashcard.__table__.constraints.remove("
            "next(constraint for constraint in ProgrammingFlashcard.__table__.foreign_key_constraints "
            "if tuple(constraint.column_keys) == ('topic_id',)));"
        )
        result = run_create_all(
            self.database, include_lesson_question=False, mutation=mutation
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        result = run_bootstrap(self.database)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("foreign key", (result.stdout + result.stderr).lower())
        self.assertIsNone(current_revision(self.database))

    def test_legacy_shape_missing_unique_constraint_is_rejected(self) -> None:
        mutation = (
            "UserAISettings.__table__.constraints.remove("
            "next(constraint for constraint in UserAISettings.__table__.constraints "
            "if isinstance(constraint, UniqueConstraint)));"
        )
        result = run_create_all(
            self.database, include_lesson_question=False, mutation=mutation
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        result = run_bootstrap(self.database)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unique", (result.stdout + result.stderr).lower())
        self.assertIsNone(current_revision(self.database))

    def test_legacy_shape_nullability_mismatch_is_rejected(self) -> None:
        mutation = "ProgrammingFlashcard.__table__.c.code_example.nullable=False;"
        result = run_create_all(
            self.database, include_lesson_question=False, mutation=mutation
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        result = run_bootstrap(self.database)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("nullable", (result.stdout + result.stderr).lower())
        self.assertIsNone(current_revision(self.database))

    def test_percent_encoded_database_url_is_safe_and_errors_are_redacted(self) -> None:
        database_url = "postgresql://user:p%40ss@127.0.0.1:1/private_db"
        config = database_bootstrap._alembic_config(database_url)
        self.assertEqual(config.get_main_option("sqlalchemy.url"), database_url)

        with mock.patch.object(
            database_bootstrap,
            "create_engine",
            side_effect=RuntimeError(f"connection failed: {database_url}"),
        ):
            with self.assertRaises(Exception) as raised:
                database_bootstrap.bootstrap_database(database_url)

        message = str(raised.exception)
        self.assertNotIn("p%40ss", message)
        self.assertNotIn(database_url, message)
        self.assertNotIn("private_db", message)

    def test_postgresql_advisory_lock_wraps_the_entire_critical_section(self) -> None:
        engine = mock.MagicMock()
        engine.dialect.name = "postgresql"
        connection = engine.connect.return_value.__enter__.return_value

        with database_bootstrap._bootstrap_lock(
            engine, "postgresql://user:secret@db.example.test/app"
        ) as inspection_bind:
            self.assertIs(inspection_bind, connection)
            self.assertEqual(connection.execute.call_count, 1)
            acquire_sql = str(connection.execute.call_args.args[0])
            self.assertIn("pg_advisory_lock", acquire_sql)

        self.assertEqual(connection.execute.call_count, 2)
        release_sql = str(connection.execute.call_args.args[0])
        self.assertIn("pg_advisory_unlock", release_sql)

    def test_postgresql_inspection_transaction_is_released_before_migrations(self) -> None:
        connection = mock.MagicMock(spec=database_bootstrap.Connection)
        database_bootstrap._release_inspection_transaction(connection)
        connection.commit.assert_called_once_with()

        engine = mock.MagicMock(spec=database_bootstrap.Engine)
        database_bootstrap._release_inspection_transaction(engine)
        self.assertFalse(hasattr(engine, "commit"))

    def test_unknown_database_backend_is_refused_without_uri_disclosure(self) -> None:
        engine = mock.MagicMock()
        engine.dialect.name = "mysql"
        database_url = "mysql://user:secret@db.example.test/private_db"

        with self.assertRaises(database_bootstrap.DatabaseBootstrapError) as raised:
            with database_bootstrap._bootstrap_lock(engine, database_url):
                self.fail("unsupported backend must not enter the critical section")

        message = str(raised.exception)
        self.assertNotIn("secret", message)
        self.assertNotIn("private_db", message)

    def test_concurrent_empty_sqlite_bootstraps_are_serialized(self) -> None:
        for iteration in range(2):
            database = Path(self.temp_dir.name) / f"concurrent-{iteration}.sqlite"
            command = [
                sys.executable,
                str(BOOTSTRAP),
                "--database-url",
                sqlite_url(database),
            ]
            processes = [
                subprocess.Popen(
                    command,
                    cwd=API,
                    env=os.environ.copy(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                for _ in range(2)
            ]
            results = [process.communicate(timeout=30) for process in processes]
            for process, (stdout, stderr) in zip(processes, results):
                self.assertEqual(process.returncode, 0, stdout + stderr)
            self.assertEqual(current_revision(database), "0007")

            repeated = run_bootstrap(database)
            self.assertEqual(repeated.returncode, 0, repeated.stdout + repeated.stderr)

    def test_migrated_database_can_downgrade_and_upgrade_0007(self) -> None:
        self.assert_bootstrap_succeeds()
        result = run_alembic(self.database, "downgrade", "0006")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("front_key", lesson_question_columns(self.database))
        result = run_alembic(self.database, "upgrade", "head")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(current_revision(self.database), "0007")
        self.assertTrue(has_lesson_question_identity(self.database))

    def test_startup_sources_bootstrap_before_create_all_or_uvicorn(self) -> None:
        dockerfile = (API / "Dockerfile").read_text(encoding="utf-8")
        docker_command = dockerfile.index("database_bootstrap.py")
        self.assertLess(docker_command, dockerfile.index("uvicorn"))

        runner = (ROOT / "scripts" / "run-api.ps1").read_text(encoding="utf-8")
        bootstrap_command = runner.index("database_bootstrap.py")
        self.assertLess(bootstrap_command, runner.index("uvicorn"))

        main = (API / "main.py").read_text(encoding="utf-8")
        startup = main[main.index("def on_startup") : main.index("def hash_session_token")]
        self.assertLess(startup.index("bootstrap_database"), startup.index("create_db_and_tables"))

        initializer = (ROOT / "scripts" / "init_db.py").read_text(encoding="utf-8")
        init_body = initializer[initializer.index("def init_db") :]
        self.assertLess(init_body.index("bootstrap_database"), init_body.index("create_all"))

        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("database_bootstrap.py", readme)

        alembic_env = (API / "alembic" / "env.py").read_text(encoding="utf-8")
        self.assertIn('database_url.replace("%", "%%")', alembic_env)


if __name__ == "__main__":
    unittest.main(verbosity=2)
