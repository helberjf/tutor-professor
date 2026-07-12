"""Safely attach unversioned databases to Alembic and upgrade to head.

This module deliberately does not import ``main`` or the SQLModel metadata.  It
must run before any ``create_all`` call so Alembic remains the owner of the
versioned schema.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Iterable

from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine


API_DIR = Path(__file__).resolve().parent
HEAD_REVISION = "0007"

REVISION_TABLE_COLUMNS: dict[str, dict[str, set[str]]] = {
    "0001": {
        "user": {
            "id",
            "first_name",
            "last_name",
            "email",
            "cpf_hash",
            "password_hash",
            "created_at",
        },
        "childprofile": {"id", "name", "age_group", "created_at"},
        "parentsettings": {"id", "password_hash"},
        "lesson": {"id", "title", "theme", "objective", "content"},
        "lessonitem": {"id", "word_en", "word_pt", "lesson_id"},
        "reviewitem": {"id", "word_en", "word_pt", "child_id"},
        "childlessonprogress": {"id", "child_id", "lesson_id"},
        "quizattempt": {"id", "lesson_id", "score"},
        "audiocache": {"id", "text_hash", "voice", "file_path"},
    },
    "0002": {
        "usersession": {
            "id",
            "session_token_hash",
            "user_id",
            "created_at",
            "last_seen_at",
            "expires_at",
        },
    },
    "0003": {
        "studyday": {
            "id",
            "child_id",
            "study_date",
            "plan_text",
            "studied_text",
            "distractions",
            "created_at",
            "updated_at",
        },
    },
    "0004": {
        "programmingsubject": {"id", "child_id", "name", "created_at"},
        "programmingtopic": {"id", "subject_id", "title", "ai_content"},
        "programmingflashcard": {
            "id",
            "topic_id",
            "subject_id",
            "child_id",
            "front",
            "back",
        },
        "codingreviewitem": {"id", "flashcard_id", "child_id", "next_review"},
    },
    "0005": {"studyday": {"pomodoro_count"}},
    "0006": {
        "lessonquestion": {
            "id",
            "child_id",
            "lesson_id",
            "target_language",
            "question_type",
            "front",
            "back",
            "supporting_example",
            "difficulty_score",
            "attempt_count",
            "correct_count",
            "error_count",
            "streak",
            "last_reviewed",
            "next_review",
            "created_at",
        },
    },
}


class UnsafeUnversionedSchema(RuntimeError):
    """Raised when stamping would hide missing migration effects."""


def _table_names(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def _column_names(engine: Engine, table_name: str) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(table_name)}


def _require_shape(engine: Engine, revision: str) -> None:
    tables = _table_names(engine)
    for table_name, required_columns in REVISION_TABLE_COLUMNS[revision].items():
        if table_name not in tables:
            raise UnsafeUnversionedSchema(
                f"Cannot stamp Alembic revision {revision}: table {table_name!r} is missing."
            )
        missing_columns = required_columns - _column_names(engine, table_name)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise UnsafeUnversionedSchema(
                f"Cannot stamp Alembic revision {revision}: "
                f"table {table_name!r} is missing columns: {missing}."
            )


def _has_unique_identity(engine: Engine) -> bool:
    inspector = inspect(engine)
    expected = ("child_id", "lesson_id", "front_key")
    unique_shapes: Iterable[tuple[str, ...]] = (
        tuple(constraint.get("column_names") or ())
        for constraint in inspector.get_unique_constraints("lessonquestion")
    )
    if expected in unique_shapes:
        return True
    return any(
        index.get("unique") and tuple(index.get("column_names") or ()) == expected
        for index in inspector.get_indexes("lessonquestion")
    )


def _detect_unversioned_revision(engine: Engine) -> str | None:
    tables = _table_names(engine) - {"alembic_version"}
    if not tables:
        return None

    _require_shape(engine, "0001")
    revision = "0001"

    if "usersession" in tables:
        _require_shape(engine, "0002")
        revision = "0002"
    elif tables & {"studyday", "programmingsubject", "lessonquestion"}:
        raise UnsafeUnversionedSchema(
            "Cannot infer a safe Alembic revision: later tables exist without usersession."
        )

    if "studyday" in tables:
        if revision != "0002":
            raise UnsafeUnversionedSchema(
                "Cannot infer a safe Alembic revision for the studyday table."
            )
        _require_shape(engine, "0003")
        revision = "0003"
    elif tables & {"programmingsubject", "programmingtopic", "lessonquestion"}:
        raise UnsafeUnversionedSchema(
            "Cannot infer a safe Alembic revision: later tables exist without studyday."
        )

    programming_tables = {
        "programmingsubject",
        "programmingtopic",
        "programmingflashcard",
        "codingreviewitem",
    }
    present_programming_tables = tables & programming_tables
    if present_programming_tables:
        if revision != "0003" or present_programming_tables != programming_tables:
            raise UnsafeUnversionedSchema(
                "Cannot infer a safe Alembic revision from a partial coding schema."
            )
        _require_shape(engine, "0004")
        revision = "0004"
    elif "lessonquestion" in tables:
        raise UnsafeUnversionedSchema(
            "Cannot infer a safe Alembic revision: lessonquestion exists without coding tables."
        )

    if "studyday" in tables and "pomodoro_count" in _column_names(engine, "studyday"):
        if revision != "0004":
            raise UnsafeUnversionedSchema(
                "Cannot infer a safe Alembic revision for studyday.pomodoro_count."
            )
        _require_shape(engine, "0005")
        revision = "0005"
    elif revision == "0004" and "lessonquestion" in tables:
        raise UnsafeUnversionedSchema(
            "Cannot infer a safe Alembic revision: lessonquestion exists without pomodoro_count."
        )

    if "lessonquestion" in tables:
        if revision != "0005":
            raise UnsafeUnversionedSchema(
                "Cannot infer a safe Alembic revision for lessonquestion."
            )
        _require_shape(engine, "0006")
        revision = "0006"
        lesson_columns = _column_names(engine, "lessonquestion")
        if "front_key" in lesson_columns:
            front_key = next(
                column
                for column in inspect(engine).get_columns("lessonquestion")
                if column["name"] == "front_key"
            )
            if front_key.get("nullable") or not _has_unique_identity(engine):
                raise UnsafeUnversionedSchema(
                    "Cannot stamp 0007: lessonquestion.front_key must be NOT NULL and "
                    "have a unique identity on (child_id, lesson_id, front_key)."
                )
            revision = HEAD_REVISION

    return revision


def _alembic_config(database_url: str) -> Config:
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def bootstrap_database(database_url: str | None = None) -> str:
    """Stamp a verified legacy schema when needed, then upgrade to Alembic head."""

    load_dotenv(API_DIR / ".env")
    resolved_url = database_url or os.getenv("DATABASE_URL") or "sqlite:///./kids_tutor.sqlite"
    config = _alembic_config(resolved_url)
    engine = create_engine(resolved_url)
    try:
        tables = _table_names(engine)
        has_version_table = "alembic_version" in tables
        detected_revision = None if has_version_table else _detect_unversioned_revision(engine)
    finally:
        engine.dispose()

    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = resolved_url
    try:
        if not has_version_table and detected_revision is not None:
            command.stamp(config, detected_revision)
        command.upgrade(config, "head")
    finally:
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url
    return HEAD_REVISION


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", help="Override DATABASE_URL for this run.")
    arguments = parser.parse_args()
    revision = bootstrap_database(arguments.database_url)
    print(f"Database schema is at Alembic revision {revision}.")


if __name__ == "__main__":
    main()
