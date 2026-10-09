"""Add private workflow without changing diagnoses, foreign keys or old schemas."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from alembic import command
from sqlalchemy import create_engine, inspect, text
from sqlmodel import SQLModel
import database_bootstrap


def verify(already_created=False):
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/test.sqlite"
        os.environ["DATABASE_URL"] = url
        config = database_bootstrap._alembic_config(url)
        command.upgrade(config, "0040")
        engine = create_engine(url)
        before_keys = inspect(engine).get_foreign_keys("objective")
        with engine.begin() as db:
            db.execute(text("INSERT INTO objective (id,child_id,title,status,order_index,study_analysis,created_at,updated_at) "
                            "VALUES (1,1,'Preservado','active',0,:analysis,'2026-10-09','2026-10-09')"),
                       dict(analysis='{"summary":"previous diagnosis"}'))
            if already_created:
                db.execute(text("ALTER TABLE objective ADD COLUMN analysis_workflow JSON"))
                db.execute(text("UPDATE objective SET analysis_workflow=:workflow"), dict(workflow='{"job_id":"existing"}'))
        command.upgrade(config, "0041")
        assert inspect(engine).get_foreign_keys("objective") == before_keys
        columns = {column["name"]: column for column in inspect(engine).get_columns("objective")}
        assert columns["analysis_workflow"]["nullable"]
        with engine.connect() as db:
            row = db.execute(text("SELECT title,study_analysis,analysis_workflow FROM objective")).one()
            assert row[0] == "Preservado" and "previous diagnosis" in row[1]
            assert (row[2] is not None) == already_created
        assert database_bootstrap.bootstrap_database(url) == "0041"
        command.downgrade(config, "0040")
        assert "analysis_workflow" not in {column["name"] for column in inspect(engine).get_columns("objective")}
        with engine.connect() as db:
            assert "previous diagnosis" in db.execute(text("SELECT study_analysis FROM objective")).scalar()
        engine.dispose()


def verify_unversioned():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/unversioned.sqlite"
        os.environ["DATABASE_URL"] = url
        engine = create_engine(url)
        SQLModel.metadata.create_all(engine)
        with engine.begin() as db:
            db.execute(text("ALTER TABLE objective DROP COLUMN analysis_workflow"))
        assert database_bootstrap.bootstrap_database(url) == "0041"
        assert "analysis_workflow" in {column["name"] for column in inspect(engine).get_columns("objective")}
        engine.dispose()


if __name__ == "__main__":
    verify()
    verify(True)
    verify_unversioned()
    print("PASS 0041 nullable workflow preserves diagnoses/FKs and tolerates create_all schemas")
