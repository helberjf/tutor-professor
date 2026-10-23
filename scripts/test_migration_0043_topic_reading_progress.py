"""Add the reading bookmark without touching lessons already written."""
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
    """The latest revision, so a later migration does not fail this one."""

    return ScriptDirectory.from_config(database_bootstrap._alembic_config(url)).get_current_head()


def topic_columns(engine):
    return {column["name"]: column for column in inspect(engine).get_columns("programmingtopic")}


def verify(already_created=False):
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/test.sqlite"
        os.environ["DATABASE_URL"] = url
        config = database_bootstrap._alembic_config(url)
        command.upgrade(config, "0042")
        engine = create_engine(url)
        before_keys = inspect(engine).get_foreign_keys("programmingtopic")
        with engine.begin() as db:
            db.execute(text("INSERT INTO programmingtopic (id,subject_id,title,order_index,status,notes,created_at,updated_at) "
                            "VALUES (1,1,'Preservado',0,'studied','minhas notas','2026-10-23','2026-10-23')"))
            if already_created:
                db.execute(text("ALTER TABLE programmingtopic ADD COLUMN reading_progress JSON"))
                db.execute(text("UPDATE programmingtopic SET reading_progress=:p"), dict(p='{"step_index":5,"favorites":[2]}'))
        command.upgrade(config, "0043")
        assert inspect(engine).get_foreign_keys("programmingtopic") == before_keys
        assert topic_columns(engine)["reading_progress"]["nullable"]
        with engine.connect() as db:
            row = db.execute(text("SELECT title,notes,reading_progress FROM programmingtopic")).one()
            assert row[0] == "Preservado" and row[1] == "minhas notas"
            assert (row[2] is not None) == already_created
        assert database_bootstrap.bootstrap_database(url) == head_revision(url)
        command.downgrade(config, "0042")
        assert "reading_progress" not in topic_columns(engine)
        with engine.connect() as db:
            assert db.execute(text("SELECT notes FROM programmingtopic")).scalar() == "minhas notas"
        engine.dispose()


def verify_unversioned():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/unversioned.sqlite"
        os.environ["DATABASE_URL"] = url
        engine = create_engine(url)
        SQLModel.metadata.create_all(engine)
        with engine.begin() as db:
            db.execute(text("ALTER TABLE programmingtopic DROP COLUMN reading_progress"))
        assert database_bootstrap.bootstrap_database(url) == head_revision(url)
        assert "reading_progress" in topic_columns(engine)
        engine.dispose()


if __name__ == "__main__":
    verify()
    verify(True)
    verify_unversioned()
    print("PASS 0043 nullable reading bookmark preserves topics/FKs and tolerates create_all schemas")
