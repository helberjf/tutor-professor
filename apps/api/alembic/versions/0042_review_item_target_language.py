"""Tie every vocabulary review card to the language it was learned in.

Revision ID: 0042
Revises: 0041

A child who switched the language they study kept the old queue: review items
only recorded whose card it was, so English words stayed due forever next to
the new French lesson. The column lets the queue ask only for the language
being studied now.

Existing rows are backfilled from the lesson that taught the word, which is the
only record of its language; anything with no matching lesson keeps the old
implicit answer, English.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


BACKFILL = sa.text(
    """
    UPDATE reviewitem
    SET target_language = COALESCE((
        SELECT l.target_language
        FROM lessonitem li
        JOIN lesson l ON l.id = li.lesson_id
        WHERE li.word_en = reviewitem.word_en
          AND (l.child_id = reviewitem.child_id OR l.child_id IS NULL)
        ORDER BY CASE WHEN l.child_id IS NULL THEN 1 ELSE 0 END, l.id DESC
        LIMIT 1
    ), 'English')
    """
)


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("reviewitem")}
    if "target_language" not in columns:
        op.add_column(
            "reviewitem",
            sa.Column("target_language", sa.Text(), nullable=False, server_default="English"),
        )
    bind.execute(BACKFILL)


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("reviewitem")}
    if "target_language" in columns:
        with op.batch_alter_table("reviewitem") as batch:
            batch.drop_column("target_language")
