"""keep the question's translation, so a review card can be read

Revision ID: 0022
Revises: 0021
Create Date: 2026-09-07
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("lessonquestion"):
        return

    if "front_pt" not in _column_names("lessonquestion"):
        with op.batch_alter_table("lessonquestion") as batch_op:
            batch_op.add_column(sa.Column("front_pt", sa.String(length=500), nullable=True))


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("lessonquestion"):
        return

    if "front_pt" in _column_names("lessonquestion"):
        with op.batch_alter_table("lessonquestion") as batch_op:
            batch_op.drop_column("front_pt")
