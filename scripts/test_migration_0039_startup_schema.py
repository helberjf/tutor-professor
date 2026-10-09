"""Migration 0039 creates what the startup step made, and leaves it alone where it exists.

Production reaches 0039 already holding every one of those tables and columns,
with data in them, because its schema went through the app's startup step. The
upgrade must not change a thing there. An older install can hold an earlier copy
of a startup table, missing columns the startup step would have added; those
are completed with the same defaults.
"""
from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

import database_bootstrap  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402

HEAD_REVISION = ScriptDirectory.from_config(database_bootstrap._alembic_config("sqlite://")).get_current_head()

NOW = "2026-09-28 12:00:00"
STARTUP_TABLES = (
    "adminflashcard",
    "book",
    "bookpage",
    "codingday",
    "codingdeckconfig",
    "dailyactivity",
    "diverseday",
    "leetcodemethod",
    "useraisettings",
)


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def run(arguments: list[str], database: Path, **extra_env: str) -> None:
    environment = {**os.environ, "DATABASE_URL": sqlite_url(database), **extra_env}
    result = subprocess.run(
        [sys.executable, *arguments], cwd=API_DIR, env=environment, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise AssertionError(result.stdout + result.stderr)


def alembic(database: Path, *arguments: str) -> None:
    run(["-m", "alembic", "-c", "alembic.ini", *arguments], database)


def boot_the_app(database: Path, temp_dir: Path) -> None:
    """Run the startup step itself, the way a long-running server does at boot."""

    run(
        ["-c", "import main; main.create_db_and_tables(); main._run_schema_migrations()"],
        database,
        APP_ENV="test",
        SESSION_SECRET="test-session-secret",
        TTS_PROVIDER="none",
        AUDIO_CACHE_DIR=str(temp_dir / "audio"),
    )


def schema(database: Path) -> list[tuple]:
    with sqlite3.connect(database) as connection:
        return connection.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()


def columns(database: Path, table: str) -> dict[str, tuple]:
    """name -> (declared type, not null, default) from PRAGMA table_info."""

    with sqlite3.connect(database) as connection:
        return {row[1]: (row[2], row[3], row[4]) for row in connection.execute(f"PRAGMA table_info('{table}')")}


def version(database: Path) -> str:
    with sqlite3.connect(database) as connection:
        return connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]


class Migration0039Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.temp_dir = Path(self.temp.name)
        self.database = self.temp_dir / "db.sqlite"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_a_database_that_booted_the_app_is_left_exactly_as_it_was(self) -> None:
        alembic(self.database, "upgrade", "0038")
        boot_the_app(self.database, self.temp_dir)
        with sqlite3.connect(self.database) as connection:
            connection.execute(
                'INSERT INTO "user" (id, first_name, last_name, email, cpf_hash, password_hash, '
                "google_sub, auth_provider, created_at) "
                "VALUES (1, 'Ada', 'Lovelace', 'ada@example.test', 'cpf', 'hash', 'google-1', 'google', ?)",
                (NOW,),
            )
            connection.execute(
                "INSERT INTO useraisettings (id, user_id, provider, api_key_encrypted, use_global_key, "
                "model, created_at, updated_at) VALUES (1, 1, 'gemini', '', 1, 'gemini-3.1-flash-lite', ?, ?)",
                (NOW, NOW),
            )
            connection.execute(
                "INSERT INTO book (id, child_id, title, theme, level, num_pages, target_language, created_at) "
                "VALUES (1, NULL, 'Shared', 'Animals', 2, 5, 'French', ?)",
                (NOW,),
            )
        before = schema(self.database)

        # Pin the schema-preservation assertion to the revision under test.
        # Later migrations are allowed to extend these tables at bootstrap.
        alembic(self.database, "upgrade", "0039")
        alembic(self.database, "upgrade", "0039")
        self.assertEqual(version(self.database), "0039")
        self.assertEqual(schema(self.database), before, "0039 must not change a schema that already has it all")

        database_bootstrap.bootstrap_database(sqlite_url(self.database))
        database_bootstrap.bootstrap_database(sqlite_url(self.database))

        self.assertEqual(version(self.database), HEAD_REVISION)
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(
                connection.execute('SELECT google_sub, auth_provider FROM "user" WHERE id = 1').fetchone(),
                ("google-1", "google"),
            )
            self.assertEqual(connection.execute("SELECT use_global_key FROM useraisettings").fetchone(), (1,))
            self.assertEqual(connection.execute("SELECT title, target_language FROM book").fetchone(), ("Shared", "French"))

    def test_older_copies_of_the_startup_tables_are_completed(self) -> None:
        alembic(self.database, "upgrade", "0038")
        with sqlite3.connect(self.database) as connection:
            # As create_all made them before the startup step's later ALTERs.
            connection.executescript(
                """
                CREATE TABLE book (
                    id INTEGER NOT NULL PRIMARY KEY,
                    child_id INTEGER NOT NULL REFERENCES childprofile (id),
                    title VARCHAR NOT NULL, theme VARCHAR NOT NULL,
                    level INTEGER NOT NULL, num_pages INTEGER NOT NULL,
                    created_at DATETIME NOT NULL
                );
                CREATE INDEX ix_book_child_id ON book (child_id);
                CREATE TABLE codingdeckconfig (
                    id INTEGER NOT NULL PRIMARY KEY,
                    child_id INTEGER NOT NULL, subject_id INTEGER NOT NULL,
                    new_per_day INTEGER NOT NULL, max_reviews_per_day INTEGER NOT NULL,
                    learning_steps VARCHAR NOT NULL, relearning_steps VARCHAR NOT NULL,
                    graduating_interval INTEGER NOT NULL, easy_interval INTEGER NOT NULL,
                    desired_retention FLOAT NOT NULL, maximum_interval INTEGER NOT NULL,
                    counter_date DATE, new_done_today INTEGER NOT NULL,
                    reviews_done_today INTEGER NOT NULL,
                    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
                    UNIQUE (child_id, subject_id)
                );
                CREATE TABLE useraisettings (
                    id INTEGER NOT NULL PRIMARY KEY,
                    user_id INTEGER NOT NULL UNIQUE REFERENCES "user" (id),
                    provider VARCHAR NOT NULL, api_key_encrypted VARCHAR NOT NULL,
                    model VARCHAR NOT NULL, base_url VARCHAR,
                    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
                );
                """
            )
            connection.execute(
                "INSERT INTO book (id, child_id, title, theme, level, num_pages, created_at) "
                "VALUES (1, 1, 'Old book', 'Colors', 1, 5, ?)",
                (NOW,),
            )
            connection.execute(
                "INSERT INTO codingdeckconfig VALUES (1, 1, 1, 20, 200, '1 10', '10', 1, 4, 0.9, 36500, "
                "NULL, 0, 0, ?, ?)",
                (NOW, NOW),
            )
            connection.execute(
                "INSERT INTO useraisettings VALUES (1, 1, 'gemini', 'secret', 'gemini-3.1-flash-lite', NULL, ?, ?)",
                (NOW, NOW),
            )

        database_bootstrap.bootstrap_database(sqlite_url(self.database))

        with sqlite3.connect(self.database) as connection:
            self.assertEqual(
                connection.execute("SELECT title, child_id, target_language FROM book").fetchone(),
                ("Old book", 1, "English"),
            )
            self.assertEqual(
                connection.execute(
                    "SELECT insertion_order, new_cards_ignore_review_limit, leech_threshold, leech_action, "
                    "fsrs_parameters, new_per_day FROM codingdeckconfig"
                ).fetchone(),
                ("sequential", 0, 8, "tag", "", 20),
            )
            self.assertEqual(
                connection.execute("SELECT api_key_encrypted, use_global_key FROM useraisettings").fetchone(),
                ("secret", 0),
            )
            # The shared shelf: a book that belongs to no child.
            connection.execute(
                "INSERT INTO book (id, child_id, title, theme, level, num_pages, target_language, created_at) "
                "VALUES (2, NULL, 'Shared', 'Animals', 1, 5, 'English', ?)",
                (NOW,),
            )
        self.assertEqual(columns(self.database, "book")["child_id"][1], 0, "book.child_id must accept NULL")
        created = set(STARTUP_TABLES) - {"book", "codingdeckconfig", "useraisettings"}
        with sqlite3.connect(self.database) as connection:
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertLessEqual(created, tables)

    def test_downgrade_never_drops_what_may_predate_it(self) -> None:
        alembic(self.database, "upgrade", "0039")
        before = schema(self.database)

        alembic(self.database, "downgrade", "0038")

        self.assertEqual(version(self.database), "0038")
        self.assertEqual(schema(self.database), before)
        self.assertIn("google_sub", columns(self.database, "user"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
