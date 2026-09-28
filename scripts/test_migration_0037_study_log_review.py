"""Migration 0037 adds the review columns to the study log without touching entries.

Production reaches it with entries already in the table: they must come out
with no review yet (count 0), and running the upgrade again must change nothing.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-0037-"))
os.environ.setdefault("APP_ENV", "test")

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

import database_bootstrap  # noqa: E402

NOW = "2026-09-27 12:00:00"
REVIEW_COLUMNS = ("last_reviewed_at", "review_count", "last_review_score")


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def columns(database: Path) -> set[str]:
    with sqlite3.connect(database) as connection:
        return {row[1] for row in connection.execute("PRAGMA table_info(studylogentry)")}


def prepare_at_0036(name: str) -> Path:
    """A database as production was: at 0036, one entry, no review columns."""

    database = TMP_DIR / f"{name}.sqlite"
    database_bootstrap.bootstrap_database(sqlite_url(database))
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO childprofile (id, name, age_group, created_at) VALUES (1, 'Lia', '18+', ?)", (NOW,)
        )
        connection.execute(
            "INSERT INTO studylogentry (id, child_id, studied_on, title, title_is_auto, discipline, "
            "subject_is_auto, source, created_at, updated_at) "
            "VALUES (1, 1, '2026-09-20', 'Controle', 0, 'Direito', 0, 'manual', ?, ?)",
            (NOW, NOW),
        )
        for column in reversed(REVIEW_COLUMNS):
            connection.execute(f"ALTER TABLE studylogentry DROP COLUMN {column}")
        connection.execute("UPDATE alembic_version SET version_num = '0036'")
    return database


class Migration0037Tests(unittest.TestCase):
    def test_a_fresh_database_has_the_review_columns(self) -> None:
        database = TMP_DIR / "fresh.sqlite"
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertTrue(set(REVIEW_COLUMNS) <= columns(database))

    def test_existing_entries_start_without_a_review(self) -> None:
        database = prepare_at_0036("existing")
        self.assertFalse(set(REVIEW_COLUMNS) & columns(database))
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertTrue(set(REVIEW_COLUMNS) <= columns(database))
        with sqlite3.connect(database) as connection:
            row = connection.execute(
                "SELECT title, review_count, last_reviewed_at, last_review_score FROM studylogentry WHERE id = 1"
            ).fetchone()
        self.assertEqual(row, ("Controle", 0, None, None))

        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE alembic_version SET version_num = '0036'")
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertTrue(set(REVIEW_COLUMNS) <= columns(database), "running it again changes nothing")


if __name__ == "__main__":
    unittest.main(verbosity=2)
