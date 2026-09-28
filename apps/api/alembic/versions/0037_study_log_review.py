"""remember when each study log entry was reviewed, and how it went

Revision ID: 0037
Revises: 0036
Create Date: 2026-09-27

The review mode asks the questions of an entry's sheet. Keeping when that last
happened, how often, and the share the learner knew is what lets the queue
start from the entries that went longest without a review.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "studylogentry"


def _column_names() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table(TABLE):
        return
    existing = _column_names()
    missing = [
        column
        for column in (
            sa.Column("last_reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_review_score", sa.Integer(), nullable=True),
        )
        if column.name not in existing
    ]
    if not missing:
        return
    with op.batch_alter_table(TABLE) as batch_op:
        for column in missing:
            batch_op.add_column(column)


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table(TABLE):
        return
    present = [name for name in ("last_review_score", "review_count", "last_reviewed_at") if name in _column_names()]
    if not present:
        return
    with op.batch_alter_table(TABLE) as batch_op:
        for name in present:
            batch_op.drop_column(name)
