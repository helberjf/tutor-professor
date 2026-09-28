"""A database prepared by database_bootstrap alone has everything the models use.

On Vercel the API never touches the schema when it boots, and the deploy guide
prepares the database with the bootstrap only. Nine tables and sixteen columns
used to exist only because the app created them at startup, so a database
prepared that way reached the head revision and still failed the first login
with "column user.google_sub does not exist".

This builds an empty SQLite database with the bootstrap command — never with
create_all — and compares it with the SQLModel metadata. A model table, column
or unique constraint that no migration creates fails here, not in production.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from alembic.script import ScriptDirectory  # noqa: E402
from sqlalchemy import UniqueConstraint, create_engine, inspect, text  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import database_bootstrap  # noqa: E402  # Also registers every model table.


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


class BootstrapSchemaMatchesModelsTests(unittest.TestCase):
    maxDiff = None  # A failure should name every missing table and column.

    @classmethod
    def setUpClass(cls) -> None:
        cls.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        database = Path(cls.temp_dir.name) / "bootstrap-only.sqlite"
        cls.database_url = sqlite_url(database)
        # The command operators run, in its own process: nothing in this test
        # process creates a table.
        cls.result = subprocess.run(
            [sys.executable, str(API_DIR / "database_bootstrap.py"), "--database-url", cls.database_url],
            cwd=API_DIR,
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            check=False,
        )
        cls.engine = create_engine(cls.database_url)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.engine.dispose()
        cls.temp_dir.cleanup()

    def setUp(self) -> None:
        self.assertEqual(self.result.returncode, 0, self.result.stdout + self.result.stderr)
        self.inspector = inspect(self.engine)

    def existing_model_tables(self) -> list:
        tables = set(self.inspector.get_table_names())
        return [table for table in SQLModel.metadata.sorted_tables if table.name in tables]

    def test_every_model_table_and_column_exists(self) -> None:
        tables = set(self.inspector.get_table_names())
        missing_tables = sorted(table.name for table in SQLModel.metadata.sorted_tables if table.name not in tables)
        missing_columns = []
        for table in self.existing_model_tables():
            present = {column["name"] for column in self.inspector.get_columns(table.name)}
            missing_columns += [f"{table.name}.{column.name}" for column in table.columns if column.name not in present]
        self.assertEqual(
            {"tables": missing_tables, "columns": missing_columns},
            {"tables": [], "columns": []},
            "model tables and columns that no migration creates",
        )

    def test_every_model_unique_constraint_exists(self) -> None:
        # Code relies on these to refuse duplicates: one AI settings row per
        # account, one Google identity per account, one deck config per subject.
        missing = []
        for table in self.existing_model_tables():
            present = {tuple(unique["column_names"]) for unique in self.inspector.get_unique_constraints(table.name)}
            present |= {
                tuple(index["column_names"]) for index in self.inspector.get_indexes(table.name) if index["unique"]
            }
            declared = [
                tuple(column.name for column in constraint.columns)
                for constraint in table.constraints
                if isinstance(constraint, UniqueConstraint)
            ]
            declared += [tuple(column.name for column in index.columns) for index in table.indexes if index.unique]
            missing += [f"{table.name}{columns}" for columns in declared if columns not in present]
        self.assertEqual(missing, [], "model unique constraints that no migration creates")

    def test_the_reported_revision_is_the_head_the_database_records(self) -> None:
        config = database_bootstrap._alembic_config(self.database_url)
        head = ScriptDirectory.from_config(config).get_current_head()
        with self.engine.connect() as connection:
            recorded = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        self.assertEqual(recorded, head)
        # It used to print a fixed "0008" whatever the database held.
        self.assertIn(f"Database schema is at Alembic revision {head}.", self.result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
