"""exam simulado mode: blueprint, question pool and scored attempts

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-31
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("exam"):
        op.create_table(
            "exam",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
            sa.Column("subject_id", sa.Integer(), sa.ForeignKey("programmingsubject.id"), nullable=True),
            sa.Column("code", sa.String(length=40), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("question_count", sa.Integer(), nullable=False, server_default="65"),
            sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="130"),
            sa.Column("passing_percent", sa.Integer(), nullable=False, server_default="72"),
            sa.Column("domains", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("child_id", "name", name="uq_exam_child_name"),
        )
        op.create_index("ix_exam_child_id", "exam", ["child_id"])
        op.create_index("ix_exam_subject_id", "exam", ["subject_id"])

    if not inspector.has_table("examquestion"):
        op.create_table(
            "examquestion",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exam.id"), nullable=False),
            sa.Column("domain", sa.String(length=120), nullable=False),
            sa.Column("question", sa.String(length=1000), nullable=False),
            sa.Column("question_key", sa.String(length=64), nullable=False),
            sa.Column("options", sa.JSON(), nullable=True),
            sa.Column("correct_options", sa.JSON(), nullable=True),
            sa.Column("response_type", sa.String(length=20), nullable=False, server_default="single"),
            sa.Column("explanation", sa.String(length=2000), nullable=False),
            sa.Column("reference_url", sa.String(length=500), nullable=True),
            sa.Column("difficulty", sa.String(length=20), nullable=False, server_default="medium"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("exam_id", "question_key", name="uq_examquestion_identity"),
        )
        op.create_index("ix_examquestion_exam_id", "examquestion", ["exam_id"])
        op.create_index("ix_examquestion_domain", "examquestion", ["domain"])

    if not inspector.has_table("examattempt"):
        op.create_table(
            "examattempt",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exam.id"), nullable=False),
            sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="in_progress"),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("duration_seconds", sa.Integer(), nullable=True),
            sa.Column("question_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("score_percent", sa.Integer(), nullable=True),
            sa.Column("passed", sa.Boolean(), nullable=True),
            sa.Column("domain_breakdown", sa.JSON(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_examattempt_exam_id", "examattempt", ["exam_id"])
        op.create_index("ix_examattempt_child_id", "examattempt", ["child_id"])

    if not inspector.has_table("examattemptanswer"):
        op.create_table(
            "examattemptanswer",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("attempt_id", sa.Integer(), sa.ForeignKey("examattempt.id"), nullable=False),
            sa.Column("exam_question_id", sa.Integer(), sa.ForeignKey("examquestion.id"), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("selected_options", sa.JSON(), nullable=True),
            sa.Column("correct", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("answered_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("attempt_id", "exam_question_id", name="uq_examattemptanswer_identity"),
        )
        op.create_index("ix_examattemptanswer_attempt_id", "examattemptanswer", ["attempt_id"])
        op.create_index(
            "ix_examattemptanswer_exam_question_id", "examattemptanswer", ["exam_question_id"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("examattemptanswer", "examattempt", "examquestion", "exam"):
        if inspector.has_table(table):
            op.drop_table(table)
