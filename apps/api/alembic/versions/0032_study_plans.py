"""study plans that turn a goal into ordered, measurable objectives

Revision ID: 0032
Revises: 0031
Create Date: 2026-09-17
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PLAN_FOREIGN_KEY = "fk_objective_plan_id_studyplan"


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _plan_foreign_keys() -> list[dict]:
    return [
        foreign_key
        for foreign_key in sa.inspect(op.get_bind()).get_foreign_keys("objective")
        if foreign_key.get("referred_table") == "studyplan"
    ]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("studyplan"):
        op.create_table(
            "studyplan",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("goal", sa.String(length=500), nullable=False),
            sa.Column("profile", sa.Text(), nullable=True),
            sa.Column("weekly_hours", sa.Integer(), nullable=True),
            sa.Column("target_date", sa.Date(), nullable=True),
            sa.Column("diagnosis", sa.String(length=1000), nullable=False),
            sa.Column("focus", sa.String(length=300), nullable=True),
            sa.Column("avoid", sa.JSON(), nullable=True),
            sa.Column("shortest_path", sa.JSON(), nullable=True),
            sa.Column("source", sa.String(length=60), nullable=False),
            sa.Column("status", sa.String(length=12), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("revised_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_studyplan_child_id", "studyplan", ["child_id"])
        op.create_index("ix_studyplan_child_status", "studyplan", ["child_id", "status"])

    if not inspector.has_table("objective"):
        return

    # Nullable on purpose: every objective created before plans existed keeps
    # working as a standalone one.
    columns = _column_names("objective")
    needs_foreign_key = not _plan_foreign_keys()
    with op.batch_alter_table("objective") as batch_op:
        if "plan_id" not in columns:
            batch_op.add_column(sa.Column("plan_id", sa.Integer(), nullable=True))
        if "plan_order" not in columns:
            batch_op.add_column(sa.Column("plan_order", sa.Integer(), nullable=True))
        if needs_foreign_key:
            batch_op.create_foreign_key(
                PLAN_FOREIGN_KEY, "studyplan", ["plan_id"], ["id"]
            )

    if "ix_objective_plan_id" not in _index_names("objective"):
        op.create_index("ix_objective_plan_id", "objective", ["plan_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if inspector.has_table("objective"):
        if "ix_objective_plan_id" in _index_names("objective"):
            op.drop_index("ix_objective_plan_id", table_name="objective")
        columns = _column_names("objective")
        foreign_keys = _plan_foreign_keys()
        with op.batch_alter_table("objective") as batch_op:
            for foreign_key in foreign_keys:
                if foreign_key.get("name"):
                    batch_op.drop_constraint(foreign_key["name"], type_="foreignkey")
            if "plan_order" in columns:
                batch_op.drop_column("plan_order")
            if "plan_id" in columns:
                batch_op.drop_column("plan_id")

    # The objectives no longer point at plans, so the table can go.
    if inspector.has_table("studyplan"):
        op.drop_table("studyplan")
