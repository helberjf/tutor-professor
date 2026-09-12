"""Migration 0024 repairs a database whose version outran its schema.

Production read alembic_version 0023 while lacking the two columns 0021 adds —
0021 had been stamped, not run — so every LessonQuestion query failed and the
review screen went down. 0021 never runs again on a database that records it,
so 0024 re-ensures the columns. These checks reproduce that exact state on
SQLite and pin the repair, and that it changes nothing where 0021 did its job.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-0024-"))
os.environ.setdefault("APP_ENV", "test")

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

import database_bootstrap  # noqa: E402

TRANSLATION_COLUMNS = {"front_translation", "supporting_example_translation"}


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def lesson_question_columns(database: Path) -> set[str]:
    with sqlite3.connect(database) as connection:
        return {row[1] for row in connection.execute("PRAGMA table_info(lessonquestion)")}


def current_revision(database: Path) -> str:
    with sqlite3.connect(database) as connection:
        return connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]


def assert_at_least_0024(case: unittest.TestCase, database: Path) -> None:
    """The database has been through 0024 — not that 0024 is still the head.

    Pinning the head revision here made every later migration fail a test about
    0024. What matters is that the repair ran and nothing after it undid the
    columns.
    """

    revision = current_revision(database)
    case.assertGreaterEqual(revision, "0024", f"expected a revision at or past 0024, found {revision}")


class Migration0024Tests(unittest.TestCase):
    def migrated_database(self, name: str) -> Path:
        database = TMP_DIR / f"{name}.sqlite"
        database_bootstrap.bootstrap_database(sqlite_url(database))
        return database

    def test_a_fresh_database_reaches_0024_with_both_columns(self) -> None:
        database = self.migrated_database("fresh")
        assert_at_least_0024(self, database)
        self.assertTrue(TRANSLATION_COLUMNS <= lesson_question_columns(database))

    def test_a_database_stamped_past_0021_without_the_columns_is_repaired(self) -> None:
        database = self.migrated_database("stamped")
        with sqlite3.connect(database) as connection:
            for column in sorted(TRANSLATION_COLUMNS):
                connection.execute(f"ALTER TABLE lessonquestion DROP COLUMN {column}")
            connection.execute("UPDATE alembic_version SET version_num = '0023'")
        # The production state: a version past 0021, none of 0021's columns.
        self.assertFalse(TRANSLATION_COLUMNS & lesson_question_columns(database))
        self.assertEqual(current_revision(database), "0023")

        database_bootstrap.bootstrap_database(sqlite_url(database))

        assert_at_least_0024(self, database)
        self.assertTrue(TRANSLATION_COLUMNS <= lesson_question_columns(database))

    def test_a_single_missing_column_is_added_alone(self) -> None:
        database = self.migrated_database("half")
        with sqlite3.connect(database) as connection:
            connection.execute("ALTER TABLE lessonquestion DROP COLUMN supporting_example_translation")
            connection.execute("UPDATE alembic_version SET version_num = '0023'")

        database_bootstrap.bootstrap_database(sqlite_url(database))

        self.assertTrue(TRANSLATION_COLUMNS <= lesson_question_columns(database))

    def test_upgrading_a_healthy_database_changes_nothing(self) -> None:
        database = self.migrated_database("healthy")
        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE alembic_version SET version_num = '0023'")
        before = lesson_question_columns(database)

        database_bootstrap.bootstrap_database(sqlite_url(database))
        database_bootstrap.bootstrap_database(sqlite_url(database))

        self.assertEqual(lesson_question_columns(database), before)
        assert_at_least_0024(self, database)


if __name__ == "__main__":
    unittest.main()
