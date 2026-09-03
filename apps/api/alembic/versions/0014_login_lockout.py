"""slow down password guessing with a short, self-healing account lock

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    existing_columns = _column_names("user")
    if "failed_login_attempts" not in existing_columns:
        op.add_column(
            "user",
            sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
        )
    if "locked_until" not in existing_columns:
        op.add_column("user", sa.Column("locked_until", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    existing_columns = _column_names("user")
    with op.batch_alter_table("user") as batch_op:
        for column_name in ("locked_until", "failed_login_attempts"):
            if column_name in existing_columns:
                batch_op.drop_column(column_name)
