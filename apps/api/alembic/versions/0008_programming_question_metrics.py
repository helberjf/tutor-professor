"""track programming question metrics

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-12
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("programmingquestion"):
        op.create_table(
            "programmingquestion",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("topic_id", sa.Integer(), sa.ForeignKey("programmingtopic.id"), nullable=False),
            sa.Column("subject_id", sa.Integer(), sa.ForeignKey("programmingsubject.id"), nullable=False),
            sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
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
            sa.UniqueConstraint("topic_id", "question_key"),
        )
        op.create_index("ix_programmingquestion_topic_id", "programmingquestion", ["topic_id"])
        op.create_index("ix_programmingquestion_subject_id", "programmingquestion", ["subject_id"])
        op.create_index("ix_programmingquestion_child_id", "programmingquestion", ["child_id"])
        return

    existing_columns = _column_names("programmingquestion")
    metric_columns = [
        ("attempt_count", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0")),
        ("correct_count", sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0")),
        ("error_count", sa.Column("error_count", sa.Integer(), nullable=False, server_default="0")),
        ("last_selected_option", sa.Column("last_selected_option", sa.String(length=500), nullable=True)),
        ("last_answered_at", sa.Column("last_answered_at", sa.DateTime(), nullable=True)),
    ]
    for column_name, column in metric_columns:
        if column_name not in existing_columns:
            op.add_column("programmingquestion", column)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("programmingquestion"):
        return

    existing_columns = _column_names("programmingquestion")
    with op.batch_alter_table("programmingquestion") as batch_op:
        for column_name in (
            "last_answered_at",
            "last_selected_option",
            "error_count",
            "correct_count",
            "attempt_count",
        ):
            if column_name in existing_columns:
                batch_op.drop_column(column_name)
