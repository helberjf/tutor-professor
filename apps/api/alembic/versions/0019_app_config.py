"""hold the rotating Kokoro tunnel address somewhere both sides can reach

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # Guarded for the same reason as 0018: the bootstrap tests create the tables
    # with create_all first, then stamp an older revision and upgrade through here.
    if inspector.has_table("appconfig"):
        return

    op.create_table(
        "appconfig",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=1000), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("appconfig"):
        op.drop_table("appconfig")
