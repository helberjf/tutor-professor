"""count rate limits in the database so the limit survives more than one instance

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # The guard matters: the bootstrap tests build their fixture with
    # SQLModel.metadata.create_all, which already creates this table, and then
    # stamp an old revision and upgrade through here.
    if inspector.has_table("ratelimitcounter"):
        return

    op.create_table(
        "ratelimitcounter",
        sa.Column("rule", sa.String(length=40), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        # Epoch seconds, bucket-aligned. An integer rather than a timestamp so
        # the bucket arithmetic stays in Python and out of the database.
        sa.Column("window_start", sa.Integer(), nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("rule", "subject", "window_start"),
    )
    op.create_index("ix_ratelimitcounter_expires_at", "ratelimitcounter", ["expires_at"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("ratelimitcounter"):
        op.drop_table("ratelimitcounter")
