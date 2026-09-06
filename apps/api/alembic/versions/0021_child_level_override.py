"""let a child pin their own level instead of following the automatic ladder

Revision ID: 0021
Revises: 0020
Create Date: 2026-09-06
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("childprofile"):
        return

    if "level_override" not in _column_names("childprofile"):
        with op.batch_alter_table("childprofile") as batch_op:
            batch_op.add_column(sa.Column("level_override", sa.Integer(), nullable=True))


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("childprofile"):
        return

    if "level_override" in _column_names("childprofile"):
        with op.batch_alter_table("childprofile") as batch_op:
            batch_op.drop_column("level_override")
