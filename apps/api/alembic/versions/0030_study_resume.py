"""store the last study destination for cross-device resume

Revision ID: 0030
Revises: 0029
Create Date: 2026-09-15
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("studyresume"):
        return

    op.create_table(
        "studyresume",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_id", name="uq_studyresume_child_id"),
    )
    op.create_index("ix_studyresume_child_id", "studyresume", ["child_id"])
    op.create_index("ix_studyresume_kind", "studyresume", ["kind"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("studyresume"):
        op.drop_table("studyresume")
