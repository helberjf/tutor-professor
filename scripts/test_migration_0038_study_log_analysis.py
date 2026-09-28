"""Migration 0038 creates the table of period analyses, and running it again changes nothing.

Production reaches it at 0037 with study log entries already there: they stay
as they are, and the new table starts empty.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-0038-"))
os.environ.setdefault("APP_ENV", "test")

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

import database_bootstrap  # noqa: E402

NOW = "2026-09-28 12:00:00"
TABLE = "studyloganalysis"


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def tables(database: Path) -> set[str]:
    with sqlite3.connect(database) as connection:
        return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def columns(database: Path) -> set[str]:
    with sqlite3.connect(database) as connection:
        return {row[1] for row in connection.execute(f"PRAGMA table_info({TABLE})")}


def prepare_at_0037(name: str) -> Path:
    """A database as production was: at 0037, one entry, no analyses table."""

    database = TMP_DIR / f"{name}.sqlite"
    database_bootstrap.bootstrap_database(sqlite_url(database))
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO childprofile (id, name, age_group, created_at) VALUES (1, 'Lia', '18+', ?)", (NOW,)
        )
        connection.execute(
            "INSERT INTO studylogentry (id, child_id, studied_on, title, title_is_auto, discipline, "
            "subject_is_auto, source, review_count, created_at, updated_at) "
            "VALUES (1, 1, '2026-09-20', 'Controle', 0, 'Direito', 0, 'manual', 0, ?, ?)",
            (NOW, NOW),
        )
        connection.execute(f"DROP TABLE {TABLE}")
        connection.execute("UPDATE alembic_version SET version_num = '0037'")
    return database


class Migration0038Tests(unittest.TestCase):
    def test_a_fresh_database_has_the_table(self) -> None:
        database = TMP_DIR / "fresh.sqlite"
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertIn(TABLE, tables(database))
        self.assertTrue(
            {"child_id", "period_start", "period_end", "title", "content", "stats"} <= columns(database)
        )

    def test_upgrading_keeps_the_log_and_runs_again_harmlessly(self) -> None:
        database = prepare_at_0037("existing")
        self.assertNotIn(TABLE, tables(database))
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertIn(TABLE, tables(database))
        with sqlite3.connect(database) as connection:
            self.assertEqual(connection.execute("SELECT title FROM studylogentry").fetchall(), [("Controle",)])
            self.assertEqual(connection.execute(f"SELECT COUNT(*) FROM {TABLE}").fetchone(), (0,))
            connection.execute(
                f"INSERT INTO {TABLE} (child_id, period_start, period_end, title, content, created_at, updated_at) "
                "VALUES (1, '2026-09-21', '2026-09-27', 'Semana', '## Resumo', ?, ?)",
                (NOW, NOW),
            )
            with self.assertRaises(sqlite3.IntegrityError, msg="one analysis per period"):
                connection.execute(
                    f"INSERT INTO {TABLE} (child_id, period_start, period_end, title, content, created_at, updated_at) "
                    "VALUES (1, '2026-09-21', '2026-09-27', 'De novo', '## Resumo', ?, ?)",
                    (NOW, NOW),
                )
            connection.commit()
            connection.execute("UPDATE alembic_version SET version_num = '0037'")
        database_bootstrap.bootstrap_database(sqlite_url(database))
        with sqlite3.connect(database) as connection:
            self.assertEqual(connection.execute(f"SELECT title FROM {TABLE}").fetchall(), [("Semana",)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
