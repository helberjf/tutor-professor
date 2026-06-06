"""study days

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "studyday",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("study_date", sa.Date(), nullable=False),
        sa.Column("plan_text", sa.String(), nullable=False),
        sa.Column("studied_text", sa.String(), nullable=False),
        sa.Column("distractions", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_id", "study_date"),
    )
    op.create_index("ix_studyday_child_id", "studyday", ["child_id"])
    op.create_index("ix_studyday_study_date", "studyday", ["study_date"])


def downgrade() -> None:
    op.drop_index("ix_studyday_study_date", "studyday")
    op.drop_index("ix_studyday_child_id", "studyday")
    op.drop_table("studyday")
