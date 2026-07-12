from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
BOOTSTRAP = API / "database_bootstrap.py"


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
    database: Path, *, include_lesson_question: bool
) -> subprocess.CompletedProcess[str]:
    remove_lesson_question = (
        "" if include_lesson_question else "SQLModel.metadata.remove(LessonQuestion.__table__);"
    )
    source = (
        "from sqlmodel import SQLModel, create_engine;"
        "from models.database import LessonQuestion;"
        f"{remove_lesson_question}"
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
        result = run_alembic(self.database, "upgrade", "0006")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with sqlite3.connect(self.database) as connection:
            connection.execute(
                'INSERT INTO "user" '
                "(id, first_name, last_name, email, cpf_hash, password_hash, created_at) "
                "VALUES (1, 'Grace', 'Hopper', 'grace@example.test', 'cpf', 'hash', CURRENT_TIMESTAMP)"
            )
            connection.execute(
                "INSERT INTO childprofile "
                "(id, user_id, name, age_group, base_language, current_level, streak_count, "
                "voice_preference, auto_audio, created_at) "
                "VALUES (1, 1, 'Student', '10-12', 'Portuguese', 1, 0, 'af_bella', 1, CURRENT_TIMESTAMP)"
            )
            connection.execute(
                "INSERT INTO lesson "
                "(id, title, theme, objective, content, is_completed, child_id) "
                "VALUES (1, 'French verbs', 'Verbs', 'Practice', '{}', 0, 1)"
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
        with sqlite3.connect(self.database) as connection:
            connection.execute(
                'INSERT INTO "user" '
                "(id, first_name, last_name, email, cpf_hash, password_hash, auth_provider, created_at) "
                "VALUES (1, 'Linus', 'Torvalds', 'linus@example.test', 'cpf', 'hash', "
                "'password', CURRENT_TIMESTAMP)"
            )

        self.assert_bootstrap_succeeds()
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM "user"').fetchone()[0], 1)
        self.assert_bootstrap_succeeds()

    def test_front_key_without_unique_identity_is_rejected_without_stamping(self) -> None:
        result = run_alembic(self.database, "upgrade", "0006")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with sqlite3.connect(self.database) as connection:
            connection.execute("ALTER TABLE lessonquestion ADD COLUMN front_key VARCHAR(64)")
            connection.execute("DROP TABLE alembic_version")

        result = run_bootstrap(self.database)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("front_key", result.stdout + result.stderr)
        self.assertIsNone(current_revision(self.database))

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
