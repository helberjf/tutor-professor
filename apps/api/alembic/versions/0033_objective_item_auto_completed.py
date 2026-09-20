"""remember which objective items studying checked off by itself

Revision ID: 0033
Revises: 0032
Create Date: 2026-09-19
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("objectiveitem"):
        return
    if "auto_completed" in _column_names("objectiveitem"):
        return

    # Everything checked before this migration was checked by hand, so the
    # default of false is also the truth for every existing row.
    with op.batch_alter_table("objectiveitem") as batch_op:
        batch_op.add_column(
            sa.Column(
                "auto_completed",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("objectiveitem"):
        return
    if "auto_completed" not in _column_names("objectiveitem"):
        return

    with op.batch_alter_table("objectiveitem") as batch_op:
        batch_op.drop_column("auto_completed")
