"""study session queue, day that closes by studying, and the onboarding stamp

Revision ID: 0025
Revises: 0024
Create Date: 2026-09-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("studysession"):
        op.create_table(
            "studysession",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
            sa.Column("status", sa.String(length=12), nullable=False, server_default="active"),
            sa.Column("session_date", sa.Date(), nullable=False),
            sa.Column("items", sa.JSON(), nullable=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("answered_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_studysession_child_id", "studysession", ["child_id"])
        op.create_index("ix_studysession_session_date", "studysession", ["session_date"])
        op.create_index("ix_studysession_child_status", "studysession", ["child_id", "status"])

    if inspector.has_table("studyday") and "auto_completed_at" not in _column_names("studyday"):
        with op.batch_alter_table("studyday") as batch_op:
            batch_op.add_column(sa.Column("auto_completed_at", sa.DateTime(), nullable=True))

    if inspector.has_table("user") and "onboarding_completed_at" not in _column_names("user"):
        with op.batch_alter_table("user") as batch_op:
            batch_op.add_column(sa.Column("onboarding_completed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if inspector.has_table("user") and "onboarding_completed_at" in _column_names("user"):
        with op.batch_alter_table("user") as batch_op:
            batch_op.drop_column("onboarding_completed_at")

    if inspector.has_table("studyday") and "auto_completed_at" in _column_names("studyday"):
        with op.batch_alter_table("studyday") as batch_op:
            batch_op.drop_column("auto_completed_at")

    if inspector.has_table("studysession"):
        op.drop_index("ix_studysession_child_status", table_name="studysession")
        op.drop_index("ix_studysession_session_date", table_name="studysession")
        op.drop_index("ix_studysession_child_id", table_name="studysession")
        op.drop_table("studysession")
