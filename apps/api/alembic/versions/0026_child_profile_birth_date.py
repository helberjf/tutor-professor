"""ask for a birth date and derive the age band from it

Revision ID: 0026
Revises: 0025
Create Date: 2026-09-12
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("childprofile"):
        return
    if "birth_date" not in _column_names("childprofile"):
        # Nullable on purpose: profiles created before the date was asked for keep
        # working on the band they were saved with, and get the date next time
        # somebody opens the account area.
        with op.batch_alter_table("childprofile") as batch_op:
            batch_op.add_column(sa.Column("birth_date", sa.Date(), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("childprofile"):
        return
    if "birth_date" in _column_names("childprofile"):
        with op.batch_alter_table("childprofile") as batch_op:
            batch_op.drop_column("birth_date")
