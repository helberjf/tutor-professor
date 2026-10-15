"""0042 gives each review card a language without losing anybody's progress.

What matters on an existing database is the backfill: a word is labelled with
the language of the lesson that taught it, and a word no lesson claims keeps
the only answer the old schema could have meant, English.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlmodel import SQLModel
import database_bootstrap


def head_revision(url):
    return ScriptDirectory.from_config(database_bootstrap._alembic_config(url)).get_current_head()


def verify_backfill():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/test.sqlite"
        os.environ["DATABASE_URL"] = url
        config = database_bootstrap._alembic_config(url)
        command.upgrade(config, "0041")
        engine = create_engine(url)
        with engine.begin() as db:
            db.execute(
                text(
                    "INSERT INTO lesson (id,title,theme,objective,content,is_completed,child_id,target_language) "
                    "VALUES (1,'Jour 1','Phrases','Apprendre','{}',0,7,'French')"
                )
            )
            db.execute(
                text(
                    "INSERT INTO lessonitem (id,lesson_id,word_en,word_pt,example_sentence_en,example_sentence_pt) "
                    "VALUES (1,1,'Bonjour','Bom dia','Bonjour.','Bom dia.')"
                )
            )
            for review_id, word in ((1, "Bonjour"), (2, "Thank you")):
                db.execute(
                    text(
                        "INSERT INTO reviewitem (id,word_en,word_pt,difficulty_score,attempt_count,"
                        "correct_count,error_count,streak,last_reviewed,next_review,child_id) "
                        "VALUES (:id,:word,'traducao',0.5,3,2,1,1,'2026-10-01','2026-10-02',7)"
                    ),
                    dict(id=review_id, word=word),
                )

        command.upgrade(config, "0042")

        with engine.connect() as db:
            rows = dict(
                db.execute(text("SELECT word_en, target_language FROM reviewitem")).all()
            )
            assert rows["Bonjour"] == "French", rows
            assert rows["Thank you"] == "English", rows
            kept = db.execute(
                text("SELECT attempt_count, correct_count, streak FROM reviewitem WHERE id=1")
            ).one()
            assert tuple(kept) == (3, 2, 1), kept

        assert database_bootstrap.bootstrap_database(url) == head_revision(url)

        command.downgrade(config, "0041")
        assert "target_language" not in {
            column["name"] for column in inspect(engine).get_columns("reviewitem")
        }
        with engine.connect() as db:
            assert db.execute(text("SELECT COUNT(*) FROM reviewitem")).scalar() == 2
        engine.dispose()


def verify_unversioned():
    """A database the app created with create_all already has the column."""

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/unversioned.sqlite"
        os.environ["DATABASE_URL"] = url
        engine = create_engine(url)
        SQLModel.metadata.create_all(engine)
        assert database_bootstrap.bootstrap_database(url) == head_revision(url)
        assert "target_language" in {
            column["name"] for column in inspect(engine).get_columns("reviewitem")
        }
        engine.dispose()


if __name__ == "__main__":
    verify_backfill()
    verify_unversioned()
    print("PASS 0042 labels review cards by language and keeps their progress")
