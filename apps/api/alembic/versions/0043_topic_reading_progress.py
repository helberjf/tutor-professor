"""Remember where the reader stopped in a lesson and which parts they starred.

Revision ID: 0043
Revises: 0042

Closing the reading modal on part 6 of 23 sent the reader back to part 1 next
time, and there was no way to mark a part to come back to. One nullable JSON
column on the topic keeps both, server side, so the phone and the computer
reopen the same place.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("programmingtopic")}
    if "reading_progress" not in columns:
        op.add_column("programmingtopic", sa.Column("reading_progress", sa.JSON(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("programmingtopic")}
    if "reading_progress" in columns:
        with op.batch_alter_table("programmingtopic") as batch:
            batch.drop_column("reading_progress")
