"""multiple-choice questions for diverse and english study areas

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-30
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("studyquestion"):
        return

    op.create_table(
        "studyquestion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("area", sa.String(length=20), nullable=False),
        sa.Column("subject_name", sa.String(length=120), nullable=False),
        sa.Column("topic_key", sa.String(length=120), nullable=False),
        sa.Column("topic_title", sa.String(length=300), nullable=False),
        sa.Column("question", sa.String(length=1000), nullable=False),
        sa.Column("question_key", sa.String(length=64), nullable=False),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("correct_option", sa.String(length=500), nullable=False),
        sa.Column("explanation", sa.String(length=2000), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_selected_option", sa.String(length=500), nullable=True),
        sa.Column("last_answered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "child_id",
            "area",
            "subject_name",
            "topic_key",
            "question_key",
            name="uq_studyquestion_identity",
        ),
    )
    op.create_index("ix_studyquestion_child_id", "studyquestion", ["child_id"])
    op.create_index(
        "ix_studyquestion_child_area_subject",
        "studyquestion",
        ["child_id", "area", "subject_name"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("studyquestion"):
        return

    op.drop_index("ix_studyquestion_child_area_subject", table_name="studyquestion")
    op.drop_index("ix_studyquestion_child_id", table_name="studyquestion")
    op.drop_table("studyquestion")
