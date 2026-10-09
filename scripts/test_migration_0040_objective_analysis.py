"""Upgrade old objectives and tolerate columns already created by SQLModel."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
sys.path.insert(0, str(API))
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
import database_bootstrap
from sqlmodel import SQLModel


def head_revision(url):
    return ScriptDirectory.from_config(database_bootstrap._alembic_config(url)).get_current_head()


def verify_unversioned_previous_shape():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/old.sqlite"
        engine = create_engine(url)
        SQLModel.metadata.create_all(engine)
        with engine.begin() as db:
            db.execute(text("ALTER TABLE objective DROP COLUMN study_scope"))
            db.execute(text("ALTER TABLE objective DROP COLUMN study_analysis"))
            db.execute(text("ALTER TABLE objective DROP COLUMN analysis_workflow"))
        assert database_bootstrap.bootstrap_database(url) == head_revision(url), "pre-0040 unversioned create_all shape must upgrade safely"
        assert {"study_scope", "study_analysis"} <= {c["name"] for c in inspect(engine).get_columns("objective")}
        engine.dispose()


def verify(already_created=False):
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        url = f"sqlite:///{Path(tmp).as_posix()}/db.sqlite"
        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = url
        try:
            config = database_bootstrap._alembic_config(url)
            command.upgrade(config, "0039")
            engine = create_engine(url)
            with engine.begin() as db:
                db.execute(text("INSERT INTO objective (id,child_id,title,status,order_index,created_at,updated_at) VALUES (1,1,'Legado','active',1,'2026-10-09','2026-10-09')"))
                if already_created:
                    db.execute(text("ALTER TABLE objective ADD COLUMN study_scope JSON"))
                    db.execute(text("ALTER TABLE objective ADD COLUMN study_analysis JSON"))
                    db.execute(text("UPDATE objective SET study_scope='{" + '"discipline_key":"programming","targets":[]' + "}' WHERE id=1"))
            command.upgrade(config, "head")
            with engine.connect() as db:
                revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
                assert revision == head_revision(url), f"objective analysis migration missing: {revision}"
                columns = {c["name"]: c for c in inspect(db).get_columns("objective")}
                assert columns["study_scope"]["nullable"] and columns["study_analysis"]["nullable"]
                row = db.execute(text("SELECT title,study_scope,study_analysis FROM objective")).one()
                assert row[0] == "Legado" and row[2] is None
                assert (row[1] is not None) == already_created
            before = [(c["name"], str(c["type"]), c["nullable"]) for c in inspect(engine).get_columns("objective")]
            assert database_bootstrap.bootstrap_database(url) == head_revision(url)
            assert before == [(c["name"], str(c["type"]), c["nullable"]) for c in inspect(engine).get_columns("objective")]
            engine.dispose()
        finally:
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous


if __name__ == "__main__":
    if "--unversioned" in sys.argv:
        verify_unversioned_previous_shape()
        print("PASS pre-0040 unversioned bootstrap")
        raise SystemExit(0)
    verify()
    verify(True)
    verify_unversioned_previous_shape()
    print("PASS 0040 preserves legacy objectives and is idempotent")
