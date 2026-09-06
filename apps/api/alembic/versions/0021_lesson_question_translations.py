"""store base-language translations for lesson questions

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
    if not sa.inspect(op.get_bind()).has_table("lessonquestion"):
        return

    columns = _column_names("lessonquestion")
    with op.batch_alter_table("lessonquestion") as batch_op:
        if "front_translation" not in columns:
            batch_op.add_column(sa.Column("front_translation", sa.String(length=500), nullable=True))
        if "supporting_example_translation" not in columns:
            batch_op.add_column(
                sa.Column("supporting_example_translation", sa.String(length=1000), nullable=True)
            )


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("lessonquestion"):
        return
    columns = _column_names("lessonquestion")
    with op.batch_alter_table("lessonquestion") as batch_op:
        for column_name in ("supporting_example_translation", "front_translation"):
            if column_name in columns:
                batch_op.drop_column(column_name)
