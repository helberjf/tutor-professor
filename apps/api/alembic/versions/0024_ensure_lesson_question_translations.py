"""make sure the lesson question translation columns really exist

Revision ID: 0024
Revises: 0023
Create Date: 2026-09-11

Production was found at alembic_version 0023 without the columns that 0021
adds: 0021 had been stamped rather than run. The deployed model selects both
columns, so every query that loaded a LessonQuestion failed with UndefinedColumn
and the review screen and lesson questions were down until the columns were
added by hand.

A version number alone cannot be trusted to describe the schema, and 0021 will
never run again on a database that already records it. This revision re-checks
the columns and adds whatever is missing, so any other database stamped the
same way is repaired on its next upgrade. On a database where 0021 did its job
it changes nothing.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("lessonquestion"):
        return

    columns = _column_names("lessonquestion")
    missing = [
        sa.Column(name, sa.String(length=length), nullable=True)
        for name, length in (("front_translation", 500), ("supporting_example_translation", 1000))
        if name not in columns
    ]
    if not missing:
        return
    with op.batch_alter_table("lessonquestion") as batch_op:
        for column in missing:
            batch_op.add_column(column)


def downgrade() -> None:
    # The columns belong to 0021; dropping them here would undo 0021's effect
    # on every database where it ran correctly.
    pass
