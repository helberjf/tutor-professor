"""keep the AI's analysis of each period of the study log

Revision ID: 0038
Revises: 0037
Create Date: 2026-09-28

The analysis of a period is paid for with a provider call, so it is stored to
be read again instead of written anew each time. One row per period: analysing
the same days again replaces it. The numbers it was written from go along, so
an old analysis still shows the figures it talks about.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "studyloganalysis"


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("period_end", sa.Date(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("stats", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("child_id", "period_start", "period_end", name="uq_studyloganalysis_child_period"),
        )
    if "ix_studyloganalysis_child_id" not in _index_names(TABLE):
        op.create_index("ix_studyloganalysis_child_id", TABLE, ["child_id"])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(TABLE):
        op.drop_table(TABLE)
