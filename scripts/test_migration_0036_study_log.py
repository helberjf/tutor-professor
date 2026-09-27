"""Migration 0036 files what was already studied into the new study log.

Someone with months of history must not open the "Controle de estudos" to an
empty page. These checks build a database at 0035 holding studied topics,
finished lessons and old "O que estudou" notes, run the upgrade, and pin where
each one lands — and that running it again adds nothing.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-0036-"))
os.environ.setdefault("APP_ENV", "test")

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import database_bootstrap  # noqa: E402
import models.database  # noqa: E402,F401  # Register every table for create_all.

NOW = "2026-09-20 12:00:00"


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def current_revision(database: Path) -> str:
    with sqlite3.connect(database) as connection:
        return connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]


def prepare_database_at_0035(name: str) -> Path:
    """A database the way production is before 0036: every table but the log."""

    database = TMP_DIR / f"{name}.sqlite"
    database_bootstrap.bootstrap_database(sqlite_url(database))
    # The tables and columns the app adds at startup, after the migrations.
    engine = create_engine(sqlite_url(database))
    SQLModel.metadata.create_all(engine)
    engine.dispose()
    with sqlite3.connect(database) as connection:
        lesson_columns = {row[1] for row in connection.execute("PRAGMA table_info(lesson)")}
        if "target_language" not in lesson_columns:
            connection.execute(
                "ALTER TABLE lesson ADD COLUMN target_language VARCHAR NOT NULL DEFAULT 'English'"
            )
        connection.execute("DROP TABLE studylogentry")
        connection.execute("UPDATE alembic_version SET version_num = '0035'")
    return database


def insert_history(database: Path) -> None:
    with sqlite3.connect(database) as connection:
        run = connection.execute
        run(
            "INSERT INTO childprofile (id, name, age_group, base_language, created_at) "
            "VALUES (1, 'Lia', '18+', 'Portuguese', ?), (2, 'Sam', '18+', 'English', ?)",
            (NOW, NOW),
        )
        run("INSERT INTO studydiscipline (id, child_id, name, created_at) VALUES (1, 1, 'Direito', ?)", (NOW,))
        run(
            "INSERT INTO programmingsubject (id, child_id, name, track, discipline_id, created_at) VALUES "
            "(1, 1, 'DVA-C02', 'programming', NULL, ?), "
            "(2, 1, 'Penal', 'general', 1, ?), "
            "(3, 2, 'Python', 'programming', NULL, ?)",
            (NOW, NOW, NOW),
        )
        run(
            "INSERT INTO programmingtopic (id, subject_id, title, order_index, status, created_at, updated_at) VALUES "
            "(1, 1, 'Lambda', 0, 'studied', ?, '2026-09-10 12:00:00'), "
            "(2, 1, 'SQS', 1, 'mastered', ?, '2026-09-12 08:00:00'), "
            "(3, 1, 'SNS', 2, 'not_started', ?, ?), "
            "(4, 2, 'Tipicidade', 0, 'studied', ?, '2026-09-05 09:00:00'), "
            "(5, 3, 'Loops', 0, 'studied', ?, '2026-09-07 09:00:00')",
            (NOW, NOW, NOW, NOW, NOW, NOW),
        )
        run(
            "INSERT INTO dailyactivity (child_id, activity_date, activity_type, activity_title, activity_id, "
            "result_details, created_at) VALUES "
            "(1, '2026-09-01', 'coding_topic', 'Tópico estudado: Lambda', 1, "
            "'{\"topic_id\": 1, \"status\": \"studied\"}', ?), "
            "(1, '2026-08-01', 'diverse', 'Outra coisa', 1, '{\"subject_id\": 9}', ?)",
            (NOW, NOW),
        )
        run(
            "INSERT INTO lesson (id, title, theme, objective, content, is_completed, target_language) VALUES "
            "(1, 'Greetings', 'Saudações', 'Cumprimentar', '{}', 0, 'English'), "
            "(2, 'Bonjour', 'Salutations', 'Saluer', '{}', 0, 'French')"
        )
        run(
            "INSERT INTO childlessonprogress (child_id, lesson_id, is_completed, completed_at, created_at) VALUES "
            "(1, 1, 1, '2026-09-03 10:00:00', ?), "
            "(2, 2, 1, '2026-09-04 10:00:00', ?), "
            "(1, 2, 0, NULL, ?)",
            (NOW, NOW, NOW),
        )
        run(
            "INSERT INTO studyday (child_id, study_date, plan_text, studied_text, created_at, updated_at) VALUES "
            "(1, '2026-09-02', '', 'Revisei verbos\nfiz exercícios', ?, ?), "
            "(1, '2026-09-06', 'Plano', '   ', ?, ?)",
            (NOW, NOW, NOW, NOW),
        )


def log_rows(database: Path) -> dict[tuple[int, str, int], dict]:
    with sqlite3.connect(database) as connection:
        connection.row_factory = sqlite3.Row
        return {
            (row["child_id"], row["source"], row["source_id"]): dict(row)
            for row in connection.execute("SELECT * FROM studylogentry")
        }


class Migration0036Tests(unittest.TestCase):
    def test_a_fresh_database_gets_an_empty_log(self) -> None:
        database = TMP_DIR / "fresh.sqlite"
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertGreaterEqual(current_revision(database), "0036")
        self.assertEqual(log_rows(database), {})

    def test_history_is_filed_by_discipline_and_subject(self) -> None:
        database = prepare_database_at_0035("history")
        insert_history(database)
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertGreaterEqual(current_revision(database), "0036")
        rows = log_rows(database)

        lambda_topic = rows[(1, "topic", 1)]
        self.assertEqual(lambda_topic["discipline"], "Programação")
        self.assertEqual(lambda_topic["subject"], "DVA-C02")
        self.assertEqual(lambda_topic["subject_id"], 1)
        self.assertEqual(lambda_topic["title"], "Lambda")
        self.assertEqual(lambda_topic["studied_on"], "2026-09-01", "the day it was marked, from the log")
        self.assertEqual(rows[(1, "topic", 2)]["studied_on"], "2026-09-12", "else the last change")
        self.assertNotIn((1, "topic", 3), rows, "a topic not studied stays out")
        penal = rows[(1, "topic", 4)]
        self.assertEqual((penal["discipline"], penal["subject"]), ("Direito", "Penal"))
        self.assertEqual(rows[(2, "topic", 5)]["discipline"], "Programming", "named in the learner's language")

        greetings = rows[(1, "lesson", 1)]
        self.assertEqual((greetings["discipline"], greetings["subject"]), ("Inglês", "Saudações"))
        self.assertEqual(greetings["studied_on"], "2026-09-03")
        self.assertEqual(rows[(2, "lesson", 2)]["discipline"], "French")
        self.assertNotIn((1, "lesson", 2), rows, "a lesson not finished stays out")

        notes = [row for key, row in rows.items() if key[1] == "day_note"]
        self.assertEqual(len(notes), 1, "a blank note is not an entry")
        self.assertEqual(notes[0]["discipline"], "Anotações do dia")
        self.assertIsNone(notes[0]["subject"])
        self.assertEqual(notes[0]["title"], "Revisei verbos")
        self.assertEqual(notes[0]["content"], "Revisei verbos\nfiz exercícios")
        self.assertEqual(notes[0]["studied_on"], "2026-09-02")
        self.assertEqual(len(rows), 7)

        with sqlite3.connect(database) as connection:
            kept = connection.execute(
                "SELECT studied_text FROM studyday WHERE study_date = '2026-09-02'"
            ).fetchone()[0]
            activities = connection.execute("SELECT COUNT(*) FROM dailyactivity").fetchone()[0]
        self.assertEqual(kept, "Revisei verbos\nfiz exercícios", "the old note stays for the streak")
        self.assertEqual(activities, 2, "nothing is logged twice")

    def test_running_it_again_adds_nothing(self) -> None:
        database = prepare_database_at_0035("again")
        insert_history(database)
        database_bootstrap.bootstrap_database(sqlite_url(database))
        first = log_rows(database)
        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE alembic_version SET version_num = '0035'")
        database_bootstrap.bootstrap_database(sqlite_url(database))
        self.assertEqual(set(log_rows(database)), set(first))


if __name__ == "__main__":
    unittest.main(verbosity=2)
