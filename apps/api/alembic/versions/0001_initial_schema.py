"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-05-30

Creates all tables from scratch on a fresh PostgreSQL database.
Run with: alembic upgrade head
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("first_name", sa.String(length=80), nullable=False),
        sa.Column("last_name", sa.String(length=80), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("cpf_hash", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("cpf_hash"),
    )
    op.create_index("ix_user_email", "user", ["email"])
    op.create_index("ix_user_cpf_hash", "user", ["cpf_hash"])

    op.create_table(
        "childprofile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("age_group", sa.String(), nullable=False),
        sa.Column("base_language", sa.String(), nullable=False, server_default="Portuguese"),
        sa.Column("current_level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("streak_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_activity", sa.DateTime(), nullable=True),
        sa.Column("voice_preference", sa.String(), nullable=False, server_default="af_bella"),
        sa.Column("auto_audio", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_childprofile_user_id", "childprofile", ["user_id"])

    op.create_table(
        "parentsettings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("session_token", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "lesson",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("theme", sa.String(), nullable=False),
        sa.Column("objective", sa.String(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=True),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "lessonitem",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("word_en", sa.String(), nullable=False),
        sa.Column("word_pt", sa.String(), nullable=False),
        sa.Column("example_sentence_en", sa.String(), nullable=False),
        sa.Column("example_sentence_pt", sa.String(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lesson.id"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "reviewitem",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("word_en", sa.String(), nullable=False),
        sa.Column("word_pt", sa.String(), nullable=False),
        sa.Column("difficulty_score", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reviewed", sa.DateTime(), nullable=False),
        sa.Column("next_review", sa.DateTime(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "childlessonprogress",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lesson.id"), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_childlessonprogress_child_id", "childlessonprogress", ["child_id"])
    op.create_index("ix_childlessonprogress_lesson_id", "childlessonprogress", ["lesson_id"])

    op.create_table(
        "quizattempt",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lesson.id"), nullable=True),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("attempted_at", sa.DateTime(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "audiocache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("text_hash", sa.String(), nullable=False),
        sa.Column("voice", sa.String(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audiocache_text_hash", "audiocache", ["text_hash"])


def downgrade() -> None:
    op.drop_index("ix_audiocache_text_hash", "audiocache")
    op.drop_table("audiocache")
    op.drop_table("quizattempt")
    op.drop_index("ix_childlessonprogress_lesson_id", "childlessonprogress")
    op.drop_index("ix_childlessonprogress_child_id", "childlessonprogress")
    op.drop_table("childlessonprogress")
    op.drop_table("reviewitem")
    op.drop_table("lessonitem")
    op.drop_table("lesson")
    op.drop_table("parentsettings")
    op.drop_index("ix_childprofile_user_id", "childprofile")
    op.drop_table("childprofile")
    op.drop_index("ix_user_cpf_hash", "user")
    op.drop_index("ix_user_email", "user")
    op.drop_table("user")
