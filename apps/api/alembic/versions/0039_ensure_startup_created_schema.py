"""create the tables and columns that only the app's startup step used to create

Revision ID: 0039
Revises: 0038
Create Date: 2026-09-28

Nine tables and sixteen columns were never owned by a migration: the API made
them when it booted, through SQLModel.create_all and the ALTER TABLE list in
main._run_schema_migrations. On Vercel that startup work is switched off, and
the documented way to prepare a database is database_bootstrap.py alone — so a
database prepared that way reached head without them, and the first login
failed with "column user.google_sub does not exist".

This revision creates whatever is missing, in the shape the startup step gives
it: the tables as create_all builds them, the columns with the startup step's
own DDL. A database prepared by the bootstrap alone and one that also booted
the app end up with the same schema. Everything is looked up before it is
created, so on a database that already has it — production included — this
changes nothing.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0039"
down_revision: Union[str, None] = "0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _indexed_columns(table_name: str, *, unique: bool) -> set[tuple[str, ...]]:
    """Column lists already covered by an index (or, for unique, a constraint)."""

    inspector = sa.inspect(op.get_bind())
    covered = {
        tuple(index["column_names"])
        for index in inspector.get_indexes(table_name)
        if index.get("unique") or not unique
    }
    if unique:
        covered |= {
            tuple(constraint["column_names"])
            for constraint in inspector.get_unique_constraints(table_name)
        }
    return covered


def _create_missing_tables(existing: set[str]) -> None:
    """The tables create_all made at boot, frozen as it builds them today."""

    if "useraisettings" not in existing:
        op.create_table(
            "useraisettings",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("api_key_encrypted", sa.String(), nullable=False),
            sa.Column("use_global_key", sa.Boolean(), nullable=False),
            sa.Column("model", sa.String(), nullable=False),
            sa.Column("base_url", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id"),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        )
        op.create_index("ix_useraisettings_user_id", "useraisettings", ["user_id"])

    if "book" not in existing:
        op.create_table(
            "book",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("theme", sa.String(), nullable=False),
            sa.Column("level", sa.Integer(), nullable=False),
            sa.Column("num_pages", sa.Integer(), nullable=False),
            sa.Column("target_language", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
        )
        op.create_index("ix_book_child_id", "book", ["child_id"])

    if "bookpage" not in existing:
        op.create_table(
            "bookpage",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("book_id", sa.Integer(), nullable=False),
            sa.Column("page_number", sa.Integer(), nullable=False),
            sa.Column("text_en", sa.JSON(), nullable=True),
            sa.Column("text_pt", sa.JSON(), nullable=True),
            sa.Column("vocabulary_json", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["book_id"], ["book.id"]),
        )
        op.create_index("ix_bookpage_book_id", "bookpage", ["book_id"])

    for day_table, payload_column in (("diverseday", "custom_subjects"), ("codingday", "subjects")):
        if day_table in existing:
            continue
        op.create_table(
            day_table,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("study_date", sa.Date(), nullable=False),
            sa.Column(payload_column, sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("child_id", "study_date"),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
        )
        op.create_index(f"ix_{day_table}_child_id", day_table, ["child_id"])
        op.create_index(f"ix_{day_table}_study_date", day_table, ["study_date"])

    if "adminflashcard" not in existing:
        op.create_table(
            "adminflashcard",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("front", sa.String(), nullable=False),
            sa.Column("back", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=False),
            sa.Column("code_example", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if "codingdeckconfig" not in existing:
        op.create_table(
            "codingdeckconfig",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=False),
            sa.Column("new_per_day", sa.Integer(), nullable=False),
            sa.Column("max_reviews_per_day", sa.Integer(), nullable=False),
            sa.Column("learning_steps", sa.String(), nullable=False),
            sa.Column("relearning_steps", sa.String(), nullable=False),
            sa.Column("graduating_interval", sa.Integer(), nullable=False),
            sa.Column("easy_interval", sa.Integer(), nullable=False),
            sa.Column("desired_retention", sa.Float(), nullable=False),
            sa.Column("maximum_interval", sa.Integer(), nullable=False),
            sa.Column("insertion_order", sa.String(), nullable=False),
            sa.Column("new_cards_ignore_review_limit", sa.Boolean(), nullable=False),
            sa.Column("leech_threshold", sa.Integer(), nullable=False),
            sa.Column("leech_action", sa.String(), nullable=False),
            sa.Column("fsrs_parameters", sa.String(), nullable=False),
            sa.Column("counter_date", sa.Date(), nullable=True),
            sa.Column("new_done_today", sa.Integer(), nullable=False),
            sa.Column("reviews_done_today", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("child_id", "subject_id"),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
            sa.ForeignKeyConstraint(["subject_id"], ["programmingsubject.id"]),
        )
        op.create_index("ix_codingdeckconfig_child_id", "codingdeckconfig", ["child_id"])
        op.create_index("ix_codingdeckconfig_subject_id", "codingdeckconfig", ["subject_id"])

    if "dailyactivity" not in existing:
        op.create_table(
            "dailyactivity",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("activity_date", sa.Date(), nullable=False),
            sa.Column("activity_type", sa.String(), nullable=False),
            sa.Column("activity_title", sa.String(), nullable=False),
            sa.Column("activity_id", sa.Integer(), nullable=True),
            sa.Column("result_score", sa.Float(), nullable=True),
            sa.Column("result_details", sa.JSON(), nullable=True),
            sa.Column("duration_seconds", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
        )
        op.create_index(
            "ix_daily_activity_child_id_activity_date", "dailyactivity", ["child_id", "activity_date"]
        )
        op.create_index("ix_dailyactivity_activity_date", "dailyactivity", ["activity_date"])
        op.create_index("ix_dailyactivity_activity_type", "dailyactivity", ["activity_type"])
        op.create_index("ix_dailyactivity_child_id", "dailyactivity", ["child_id"])

    if "leetcodemethod" not in existing:
        op.create_table(
            "leetcodemethod",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("language", sa.String(), nullable=False),
            sa.Column("explanation", sa.String(), nullable=False),
            sa.Column("code_example", sa.String(), nullable=False),
            sa.Column("example_output", sa.String(), nullable=False),
            sa.Column("complexity_time", sa.String(), nullable=True),
            sa.Column("complexity_space", sa.String(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
        )
        op.create_index("ix_leetcodemethod_child_id", "leetcodemethod", ["child_id"])


def _startup_columns() -> dict[str, list[sa.Column]]:
    """Columns the startup step added with ALTER TABLE, in its own DDL.

    Built on each call: a Column object can belong to one table only.
    """

    zero = sa.text("0")
    return {
        "user": [
            sa.Column("google_sub", sa.Text(), nullable=True),
            sa.Column("auth_provider", sa.Text(), nullable=False, server_default="password"),
        ],
        "lesson": [
            sa.Column("level", sa.Integer(), nullable=True),
            sa.Column("target_language", sa.Text(), nullable=False, server_default="English"),
        ],
        "childprofile": [
            sa.Column("target_language", sa.Text(), nullable=False, server_default="English"),
        ],
        "programmingsubject": [sa.Column("context", sa.Text(), nullable=True)],
        "codingreviewitem": [
            sa.Column("fsrs_state", sa.Text(), nullable=False, server_default="new"),
            sa.Column("stability", sa.Float(), nullable=False, server_default=zero),
            sa.Column("fsrs_difficulty", sa.Float(), nullable=False, server_default=zero),
            sa.Column("reps", sa.Integer(), nullable=False, server_default=zero),
            sa.Column("lapses", sa.Integer(), nullable=False, server_default=zero),
            sa.Column("learning_step", sa.Integer(), nullable=False, server_default=zero),
            sa.Column("scheduled_days", sa.Integer(), nullable=False, server_default=zero),
            sa.Column("last_rating", sa.Text(), nullable=True),
            sa.Column("suspended", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_leech", sa.Boolean(), nullable=False, server_default=sa.false()),
        ],
        # The next three tables get these from create_all when it makes them. An
        # install whose table is older than the column got it from the ALTER.
        "book": [
            sa.Column("target_language", sa.Text(), nullable=False, server_default="English"),
        ],
        "codingdeckconfig": [
            sa.Column("insertion_order", sa.Text(), nullable=False, server_default="sequential"),
            sa.Column(
                "new_cards_ignore_review_limit", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
            sa.Column("leech_threshold", sa.Integer(), nullable=False, server_default=sa.text("8")),
            sa.Column("leech_action", sa.Text(), nullable=False, server_default="tag"),
            sa.Column("fsrs_parameters", sa.Text(), nullable=False, server_default=""),
        ],
        "useraisettings": [
            sa.Column("use_global_key", sa.Boolean(), nullable=False, server_default=sa.false()),
        ],
    }


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    _create_missing_tables(set(inspector.get_table_names()))

    tables = set(sa.inspect(op.get_bind()).get_table_names())
    for table_name, columns in _startup_columns().items():
        if table_name not in tables:
            continue
        present = _column_names(table_name)
        missing = [column for column in columns if column.name not in present]
        if not missing:
            continue
        with op.batch_alter_table(table_name) as batch_op:
            for column in missing:
                batch_op.add_column(column)

    # Books with no child are the shared shelf; an old table still refuses them.
    if "book" in tables:
        child_id = next(
            (column for column in sa.inspect(op.get_bind()).get_columns("book") if column["name"] == "child_id"),
            None,
        )
        if child_id is not None and not child_id["nullable"]:
            with op.batch_alter_table("book") as batch_op:
                batch_op.alter_column("child_id", existing_type=sa.Integer(), nullable=True)

    # The startup step's index names. A database built by create_all already has
    # the model's own index on the same column, so look at columns, not names.
    if "user" in tables and ("google_sub",) not in _indexed_columns("user", unique=True):
        op.create_index("ix_user_google_sub_unique", "user", ["google_sub"], unique=True)
    if "lesson" in tables and ("level",) not in _indexed_columns("lesson", unique=False):
        op.create_index("ix_lesson_level", "lesson", ["level"])


def downgrade() -> None:
    # On every database that booted the app before this revision — production
    # among them — these tables and columns predate it and hold real data. This
    # revision cannot tell whether it created them, so it never drops them.
    pass
