from __future__ import annotations

import argparse
import importlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.sql import sqltypes
from sqlmodel import SQLModel


REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
DEFAULT_SQLITE_PATH = API_DIR / "kids_tutor.sqlite"
DEFAULT_BACKUP_DIR = REPO_ROOT / "tmp" / "backups"
DEFAULT_WORK_DIR = REPO_ROOT / "tmp" / "postgres-migration"

sys.path.insert(0, str(API_DIR))

from database_bootstrap import bootstrap_database  # noqa: E402
import models.database  # noqa: E402,F401  # Register SQLModel tables.


class MigrationError(RuntimeError):
    pass


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.resolve().as_posix()}"


def safe_url(database_url: str) -> str:
    return make_url(database_url).render_as_string(hide_password=True)


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def app_tables() -> list[Any]:
    return list(SQLModel.metadata.sorted_tables)


def quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def table_count(engine: Engine, table_name: str) -> int:
    quoted = quote_identifier(table_name)
    with engine.connect() as connection:
        return int(connection.execute(text(f"SELECT COUNT(*) FROM {quoted}")).scalar_one())


def source_tables(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def destination_nonempty_counts(engine: Engine, table_names: list[str]) -> dict[str, int]:
    existing = set(inspect(engine).get_table_names())
    counts: dict[str, int] = {}
    for table_name in table_names:
        if table_name in existing:
            count = table_count(engine, table_name)
            if count:
                counts[table_name] = count
    return counts


def backup_and_prepare_working_copy(source_path: Path, backup_dir: Path, work_dir: Path) -> tuple[Path, Path]:
    if not source_path.exists():
        raise MigrationError(f"SQLite source not found: {source_path}")
    backup_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    backup_path = backup_dir / f"{source_path.name}.{timestamp()}.bak"
    work_path = work_dir / source_path.name

    shutil.copy2(source_path, backup_path)
    if work_path.exists():
        work_path.unlink()
    shutil.copy2(source_path, work_path)
    return backup_path, work_path


def json_column_names(table: Any) -> set[str]:
    return {
        column.name
        for column in table.columns
        if isinstance(column.type, sqltypes.JSON)
    }


def boolean_column_names(table: Any) -> set[str]:
    return {
        column.name
        for column in table.columns
        if isinstance(column.type, sqltypes.Boolean)
    }


def normalize_value(value: Any, column_name: str, json_columns: set[str], bool_columns: set[str]) -> Any:
    if value is None:
        return None
    if column_name in json_columns and isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    if column_name in bool_columns:
        return bool(value)
    return value


def source_rows(source_engine: Engine, table: Any) -> list[dict[str, Any]]:
    table_name = table.name
    quoted_table = quote_identifier(table_name)
    with source_engine.connect() as connection:
        rows = connection.execute(text(f"SELECT * FROM {quoted_table}")).mappings().all()

    allowed_columns = {column.name for column in table.columns}
    json_columns = json_column_names(table)
    bool_columns = boolean_column_names(table)
    result: list[dict[str, Any]] = []
    for row in rows:
        result.append(
            {
                key: normalize_value(value, key, json_columns, bool_columns)
                for key, value in dict(row).items()
                if key in allowed_columns
            }
        )
    return result


def reset_postgres_sequence(connection: Any, table_name: str, column_name: str) -> None:
    sequence_name = connection.execute(
        text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
        {"table_name": table_name, "column_name": column_name},
    ).scalar_one_or_none()
    if not sequence_name:
        return

    connection.execute(
        text(
            """
            SELECT setval(
                :sequence_name,
                COALESCE((SELECT MAX(%s) FROM %s), 1),
                (SELECT MAX(%s) FROM %s) IS NOT NULL
            )
            """
            % (
                quote_identifier(column_name),
                quote_identifier(table_name),
                quote_identifier(column_name),
                quote_identifier(table_name),
            )
        ),
        {"sequence_name": sequence_name},
    )


def copy_data(source_engine: Engine, destination_engine: Engine) -> dict[str, int]:
    available_source_tables = source_tables(source_engine)
    copied_counts: dict[str, int] = {}

    with destination_engine.begin() as destination:
        for table in app_tables():
            if table.name not in available_source_tables:
                copied_counts[table.name] = 0
                continue

            rows = source_rows(source_engine, table)
            if rows:
                destination.execute(table.insert(), rows)
            copied_counts[table.name] = len(rows)

        for table in app_tables():
            primary_key_columns = list(table.primary_key.columns)
            if len(primary_key_columns) == 1:
                column = primary_key_columns[0]
                if isinstance(column.type, sqltypes.Integer):
                    reset_postgres_sequence(destination, table.name, column.name)

    return copied_counts


def prepare_destination_schema(postgres_url: str) -> None:
    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = postgres_url
    try:
        api_main = importlib.import_module("main")
        api_main.create_db_and_tables()
        api_main._run_schema_migrations()
    finally:
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url


def verify_counts(destination_engine: Engine, expected_counts: dict[str, int]) -> None:
    mismatches: list[str] = []
    for table_name, expected in expected_counts.items():
        actual = table_count(destination_engine, table_name)
        if actual != expected:
            mismatches.append(f"{table_name}: expected {expected}, got {actual}")
    if mismatches:
        raise MigrationError("PostgreSQL row-count verification failed: " + "; ".join(mismatches))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Safely migrate the Tutor and Professor SQLite database to PostgreSQL."
    )
    parser.add_argument(
        "--sqlite-path",
        type=Path,
        default=DEFAULT_SQLITE_PATH,
        help="Source SQLite file. The original file is backed up and never modified.",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.getenv("DATABASE_URL"),
        help="Destination PostgreSQL URL. Defaults to DATABASE_URL.",
    )
    parser.add_argument(
        "--allow-nonempty-destination",
        action="store_true",
        help="Allow copying into a PostgreSQL database that already has app rows.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.postgres_url:
        raise MigrationError("Missing --postgres-url or DATABASE_URL.")

    postgres_url = str(args.postgres_url)
    print(f"Destination: {safe_url(postgres_url)}")

    backup_path, work_path = backup_and_prepare_working_copy(
        args.sqlite_path,
        DEFAULT_BACKUP_DIR,
        DEFAULT_WORK_DIR,
    )
    print(f"SQLite backup: {backup_path}")
    print(f"SQLite working copy: {work_path}")

    work_sqlite_url = sqlite_url(work_path)
    print("Bootstrapping PostgreSQL destination...")
    bootstrap_database(postgres_url)

    destination_engine = create_engine(postgres_url)
    source_engine = create_engine(work_sqlite_url)
    try:
        print("Applying API startup schema preparation...")
        prepare_destination_schema(postgres_url)

        table_names = [table.name for table in app_tables()]
        nonempty = destination_nonempty_counts(destination_engine, table_names)
        if nonempty and not args.allow_nonempty_destination:
            details = ", ".join(f"{name}={count}" for name, count in sorted(nonempty.items()))
            raise MigrationError(
                "Refusing to copy into a non-empty PostgreSQL database. "
                f"Existing rows: {details}"
            )

        copied_counts = copy_data(source_engine, destination_engine)
        verify_counts(destination_engine, copied_counts)
    finally:
        source_engine.dispose()
        destination_engine.dispose()

    print("Migration verified. Row counts:")
    for table_name, count in sorted(copied_counts.items()):
        print(f"  {table_name}: {count}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except MigrationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
