"""canonical lesson questions

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lessonquestion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lesson.id"), nullable=False),
        sa.Column("target_language", sa.String(length=40), nullable=False),
        sa.Column("question_type", sa.String(length=40), nullable=False),
        sa.Column("front", sa.String(length=500), nullable=False),
        sa.Column("back", sa.String(length=2000), nullable=False),
        sa.Column("supporting_example", sa.String(length=1000), nullable=True),
        sa.Column("difficulty_score", sa.Float(), nullable=False, server_default="0.45"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reviewed", sa.DateTime(), nullable=True),
        sa.Column("next_review", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lessonquestion_child_id", "lessonquestion", ["child_id"])
    op.create_index("ix_lessonquestion_lesson_id", "lessonquestion", ["lesson_id"])


def downgrade() -> None:
    op.drop_index("ix_lessonquestion_lesson_id", "lessonquestion")
    op.drop_index("ix_lessonquestion_child_id", "lessonquestion")
    op.drop_table("lessonquestion")
