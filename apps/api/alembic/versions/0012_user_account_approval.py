"""hold a new account until the administrator approves it

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-02
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    existing_columns = _column_names("user")
    if "status" not in existing_columns:
        op.add_column(
            "user",
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        )
        # Everyone who already had access keeps it: only signups from here on wait.
        op.execute(sa.text("UPDATE \"user\" SET status = 'approved'"))
    if "reviewed_at" not in existing_columns:
        op.add_column("user", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    if "reviewed_by_user_id" not in existing_columns:
        op.add_column("user", sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True))
    if "review_note" not in existing_columns:
        op.add_column("user", sa.Column("review_note", sa.String(length=300), nullable=True))

    if "ix_user_status" not in _index_names("user"):
        op.create_index("ix_user_status", "user", ["status"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    if "ix_user_status" in _index_names("user"):
        op.drop_index("ix_user_status", table_name="user")

    existing_columns = _column_names("user")
    with op.batch_alter_table("user") as batch_op:
        for column_name in ("review_note", "reviewed_by_user_id", "reviewed_at", "status"):
            if column_name in existing_columns:
                batch_op.drop_column(column_name)
