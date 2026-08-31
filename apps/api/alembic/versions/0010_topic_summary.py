"""store the per-topic revision sheet

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-31
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("programmingtopic"):
        return

    existing_columns = _column_names("programmingtopic")
    # The subject sheet is the join of these, so a summary is generated once and
    # then reread many times instead of costing an AI call per visit.
    if "summary" not in existing_columns:
        op.add_column("programmingtopic", sa.Column("summary", sa.Text(), nullable=True))
    if "summary_updated_at" not in existing_columns:
        op.add_column("programmingtopic", sa.Column("summary_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("programmingtopic"):
        return

    existing_columns = _column_names("programmingtopic")
    with op.batch_alter_table("programmingtopic") as batch_op:
        for column_name in ("summary_updated_at", "summary"):
            if column_name in existing_columns:
                batch_op.drop_column(column_name)
