"""coding curriculum tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "programmingsubject",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("icon_emoji", sa.String(length=10), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_programmingsubject_child_id", "programmingsubject", ["child_id"])

    op.create_table(
        "programmingtopic",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("programmingsubject.id"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="not_started"),
        sa.Column("ai_content", sa.JSON(), nullable=True),
        sa.Column("notes", sa.String(length=5000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_programmingtopic_subject_id", "programmingtopic", ["subject_id"])

    op.create_table(
        "programmingflashcard",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("programmingtopic.id"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("programmingsubject.id"), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("front", sa.String(length=500), nullable=False),
        sa.Column("back", sa.String(length=2000), nullable=False),
        sa.Column("code_example", sa.String(length=3000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_programmingflashcard_topic_id", "programmingflashcard", ["topic_id"])
    op.create_index("ix_programmingflashcard_subject_id", "programmingflashcard", ["subject_id"])
    op.create_index("ix_programmingflashcard_child_id", "programmingflashcard", ["child_id"])

    op.create_table(
        "codingreviewitem",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("flashcard_id", sa.Integer(), sa.ForeignKey("programmingflashcard.id"), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("difficulty_score", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reviewed", sa.DateTime(), nullable=True),
        sa.Column("next_review", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_codingreviewitem_flashcard_id", "codingreviewitem", ["flashcard_id"])
    op.create_index("ix_codingreviewitem_child_id", "codingreviewitem", ["child_id"])


def downgrade() -> None:
    op.drop_index("ix_codingreviewitem_child_id", "codingreviewitem")
    op.drop_index("ix_codingreviewitem_flashcard_id", "codingreviewitem")
    op.drop_table("codingreviewitem")
    op.drop_index("ix_programmingflashcard_child_id", "programmingflashcard")
    op.drop_index("ix_programmingflashcard_subject_id", "programmingflashcard")
    op.drop_index("ix_programmingflashcard_topic_id", "programmingflashcard")
    op.drop_table("programmingflashcard")
    op.drop_index("ix_programmingtopic_subject_id", "programmingtopic")
    op.drop_table("programmingtopic")
    op.drop_index("ix_programmingsubject_child_id", "programmingsubject")
    op.drop_table("programmingsubject")
