"""Safely attach known unversioned schemas to Alembic and upgrade to head.

The bootstrap owns the complete inspect/stamp/upgrade critical section. SQLite
file databases use an operating-system file lock and PostgreSQL uses a
session-level advisory lock. Other database backends are refused rather than
running migrations without an interprocess lock.

This module deliberately does not import ``main`` or call ``create_all``.
Importing the model metadata is safe and lets legacy schema checks stay aligned
with the complete SQLModel schema.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import time
import unicodedata
from contextlib import contextmanager
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Iterator

from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from sqlalchemy import UniqueConstraint, create_engine, inspect, text
from sqlalchemy.engine import Connection, Engine, make_url
from sqlalchemy.sql.schema import Table
from sqlmodel import SQLModel

import models.database  # noqa: F401  # Register every table in SQLModel.metadata.


API_DIR = Path(__file__).resolve().parent
HEAD_REVISION = "0007"
POSTGRES_ADVISORY_LOCK_ID = 4992089506640973647


class UnsafeUnversionedSchema(RuntimeError):
    """Raised when stamping would hide missing migration effects."""


class DatabaseBootstrapError(RuntimeError):
    """A credential-safe bootstrap failure."""


@dataclass(frozen=True)
class ColumnShape:
    nullable: bool


@dataclass(frozen=True)
class TableShape:
    columns: dict[str, ColumnShape]
    primary_key: tuple[str, ...]
    foreign_keys: frozenset[tuple[tuple[str, ...], str, tuple[str, ...]]]
    unique_constraints: frozenset[tuple[str, ...]]
    indexes: frozenset[tuple[str, tuple[str, ...], bool]]


def _metadata_table_shape(table: Table) -> TableShape:
    return TableShape(
        columns={
            column.name: ColumnShape(
                nullable=bool(column.nullable),
            )
            for column in table.columns
        },
        primary_key=tuple(column.name for column in table.primary_key.columns),
        foreign_keys=frozenset(
            (
                tuple(constraint.column_keys),
                constraint.referred_table.name,
                tuple(element.column.name for element in constraint.elements),
            )
            for constraint in table.foreign_key_constraints
        ),
        unique_constraints=frozenset(
            tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        ),
        indexes=frozenset(
            (
                str(index.name),
                tuple(column.name for column in index.columns),
                bool(index.unique),
            )
            for index in table.indexes
        ),
    )


def _actual_table_shape(bind: Engine | Connection, table_name: str) -> TableShape:
    inspector = inspect(bind)
    columns = inspector.get_columns(table_name)
    indexes = inspector.get_indexes(table_name)
    return TableShape(
        columns={
            column["name"]: ColumnShape(
                nullable=bool(column["nullable"]),
            )
            for column in columns
        },
        primary_key=tuple(
            inspector.get_pk_constraint(table_name).get("constrained_columns") or ()
        ),
        foreign_keys=frozenset(
            (
                tuple(constraint.get("constrained_columns") or ()),
                str(constraint.get("referred_table")),
                tuple(constraint.get("referred_columns") or ()),
            )
            for constraint in inspector.get_foreign_keys(table_name)
        ),
        unique_constraints=frozenset(
            tuple(constraint.get("column_names") or ())
            for constraint in inspector.get_unique_constraints(table_name)
        ),
        indexes=frozenset(
            (
                str(index.get("name")),
                tuple(index.get("column_names") or ()),
                bool(index.get("unique")),
            )
            for index in indexes
            if not index.get("duplicates_constraint")
        ),
    )


CURRENT_SHAPE: dict[str, TableShape] = {
    table.name: _metadata_table_shape(table)
    for table in SQLModel.metadata.sorted_tables
}
LEGACY_CREATE_ALL_SHAPE = {
    name: shape for name, shape in CURRENT_SHAPE.items() if name != "lessonquestion"
}
_head_lesson_shape = CURRENT_SHAPE["lessonquestion"]
MIGRATION_0006_SHAPE = {
    **LEGACY_CREATE_ALL_SHAPE,
    "lessonquestion": replace(
        _head_lesson_shape,
        columns={
            name: shape
            for name, shape in _head_lesson_shape.columns.items()
            if name != "front_key"
        },
        unique_constraints=frozenset(
            columns
            for columns in _head_lesson_shape.unique_constraints
            if columns != ("child_id", "lesson_id", "front_key")
        ),
    ),
}


def _schema_error(table_name: str, detail: str) -> UnsafeUnversionedSchema:
    return UnsafeUnversionedSchema(
        f"Cannot safely stamp the unversioned database: table {table_name!r} {detail}."
    )


def _validate_table_shape(
    table_name: str, expected: TableShape, actual: TableShape
) -> None:
    expected_names = set(expected.columns)
    actual_names = set(actual.columns)
    if expected_names != actual_names:
        missing = sorted(expected_names - actual_names)
        extra = sorted(actual_names - expected_names)
        detail = f"has different columns (missing={missing}, extra={extra})"
        raise _schema_error(table_name, detail)

    for column_name in sorted(expected_names):
        expected_column = expected.columns[column_name]
        actual_column = actual.columns[column_name]
        if expected_column.nullable != actual_column.nullable:
            raise _schema_error(
                table_name,
                f"column {column_name!r} has incorrect nullable state",
            )
    if expected.primary_key != actual.primary_key:
        raise _schema_error(table_name, "has an incorrect primary key")
    if expected.foreign_keys != actual.foreign_keys:
        raise _schema_error(table_name, "has different foreign key constraints")
    if expected.unique_constraints != actual.unique_constraints:
        raise _schema_error(table_name, "has different unique constraints")
    if expected.indexes != actual.indexes:
        raise _schema_error(table_name, "has different indexes")


def _validate_known_shape(
    bind: Engine | Connection, expected_tables: dict[str, TableShape]
) -> None:
    inspector = inspect(bind)
    actual_tables = set(inspector.get_table_names()) - {"alembic_version"}
    missing_tables = set(expected_tables) - actual_tables
    if missing_tables:
        raise UnsafeUnversionedSchema(
            "Cannot safely stamp the unversioned database: missing required tables "
            f"{sorted(missing_tables)}."
        )
    for table_name in sorted(expected_tables):
        _validate_table_shape(
            table_name,
            expected_tables[table_name],
            _actual_table_shape(bind, table_name),
        )


def _canonical_front_key(front: object) -> str:
    # Keep this revision-specific transform frozen to the exact 0007 migration.
    normalized = unicodedata.normalize("NFKD", str(front or "").lower())
    normalized = "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    )
    normalized = " ".join(re.sub(r"[\W_]+", " ", normalized).split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _lesson_question_rows(bind: Engine | Connection) -> list[dict[str, object]]:
    query = text(
        "SELECT id, child_id, lesson_id, front, front_key FROM lessonquestion "
        "ORDER BY child_id, lesson_id, id"
    )
    if isinstance(bind, Connection):
        return [dict(row) for row in bind.execute(query).mappings()]
    with bind.connect() as connection:
        return [dict(row) for row in connection.execute(query).mappings()]


def _validate_head_lesson_question_keys(bind: Engine | Connection) -> None:
    """Require the exact deterministic data state produced by migration 0007."""

    seen: set[tuple[object, object, str]] = set()
    for row in _lesson_question_rows(bind):
        expected_key = _canonical_front_key(row["front"])
        identity = (row["child_id"], row["lesson_id"], expected_key)
        if identity in seen:
            expected_key = hashlib.sha256(
                f"{expected_key}\0legacy-{row['id']}".encode("utf-8")
            ).hexdigest()
        seen.add(identity)
        if row["front_key"] != expected_key:
            raise _schema_error(
                "lessonquestion",
                f"row {row['id']!r} has a noncanonical front_key",
            )


def _detect_unversioned_revision(bind: Engine | Connection) -> str | None:
    inspector = inspect(bind)
    tables = set(inspector.get_table_names()) - {"alembic_version"}
    if not tables:
        return None

    if "lessonquestion" not in tables:
        _validate_known_shape(bind, LEGACY_CREATE_ALL_SHAPE)
        return "0005"

    lesson_columns = {
        column["name"] for column in inspector.get_columns("lessonquestion")
    }
    if "front_key" not in lesson_columns:
        _validate_known_shape(bind, MIGRATION_0006_SHAPE)
        return "0006"

    _validate_known_shape(bind, CURRENT_SHAPE)
    _validate_head_lesson_question_keys(bind)
    return HEAD_REVISION


@contextmanager
def _lock_sqlite_file(database_path: str) -> Iterator[None]:
    if database_path in {"", ":memory:"}:
        # In-memory SQLite databases are process-local, so no interprocess lock
        # can coordinate or is needed between their independent schemas.
        yield
        return

    path = Path(database_path)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    lock_path = Path(f"{path}.alembic.lock")
    with lock_path.open("a+b") as lock_file:
        lock_file.seek(0, os.SEEK_END)
        if lock_file.tell() == 0:
            lock_file.write(b"\0")
            lock_file.flush()
        lock_file.seek(0)
        if os.name == "nt":
            import msvcrt

            while True:
                try:
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    # Windows' blocking mode gives up after a short fixed retry
                    # window. Non-blocking retries keep the critical section
                    # serialized even when a migration takes longer.
                    time.sleep(0.1)
            try:
                yield
            finally:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


@contextmanager
def _bootstrap_lock(
    engine: Engine, database_url: str
) -> Iterator[Engine | Connection]:
    url = make_url(database_url)
    if engine.dialect.name == "sqlite":
        with _lock_sqlite_file(url.database or ":memory:"):
            yield engine
        return

    if engine.dialect.name == "postgresql":
        with engine.connect() as connection:
            connection.execute(
                text("SELECT pg_advisory_lock(:lock_id)"),
                {"lock_id": POSTGRES_ADVISORY_LOCK_ID},
            )
            try:
                yield connection
            finally:
                connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": POSTGRES_ADVISORY_LOCK_ID},
                )
        return

    raise DatabaseBootstrapError(
        "Database bootstrap requires SQLite or PostgreSQL so migrations can be "
        "protected by a cross-process lock."
    )


def _alembic_config(database_url: str) -> Config:
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _release_inspection_transaction(bind: Engine | Connection) -> None:
    """Release PostgreSQL catalog locks while retaining the session advisory lock."""

    if isinstance(bind, Connection):
        bind.commit()


def _run_bootstrap(database_url: str) -> str:
    config = _alembic_config(database_url)
    engine = create_engine(database_url)
    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        with _bootstrap_lock(engine, database_url) as inspection_bind:
            tables = set(inspect(inspection_bind).get_table_names())
            has_version_table = "alembic_version" in tables
            detected_revision = (
                None
                if has_version_table
                else _detect_unversioned_revision(inspection_bind)
            )
            _release_inspection_transaction(inspection_bind)
            if not has_version_table and detected_revision is not None:
                command.stamp(config, detected_revision)
            command.upgrade(config, "head")
    finally:
        engine.dispose()
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url
    return HEAD_REVISION


def bootstrap_database(database_url: str | None = None) -> str:
    """Verify a known legacy schema, serialize migration, and upgrade to head."""

    load_dotenv(API_DIR / ".env")
    resolved_url = database_url or os.getenv("DATABASE_URL") or "sqlite:///./kids_tutor.sqlite"
    try:
        return _run_bootstrap(resolved_url)
    except (UnsafeUnversionedSchema, DatabaseBootstrapError):
        raise
    except Exception:
        # Never propagate driver/Alembic errors that can contain a full URI or
        # password. Operators get a stable message and can inspect DB-side logs.
        raise DatabaseBootstrapError(
            "Database bootstrap failed; connection details were redacted."
        ) from None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", help="Override DATABASE_URL for this run.")
    arguments = parser.parse_args()
    revision = bootstrap_database(arguments.database_url)
    print(f"Database schema is at Alembic revision {revision}.")


if __name__ == "__main__":
    main()
