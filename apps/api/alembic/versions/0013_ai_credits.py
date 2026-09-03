"""meter the administrator's AI key with per-account credits

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    existing_columns = _column_names("user")
    if "ai_credits" not in existing_columns:
        op.add_column(
            "user",
            sa.Column("ai_credits", sa.Integer(), nullable=False, server_default="0"),
        )
    if "ai_credits_used" not in existing_columns:
        op.add_column(
            "user",
            sa.Column("ai_credits_used", sa.Integer(), nullable=False, server_default="0"),
        )
    if "ai_unlimited" not in existing_columns:
        op.add_column(
            "user",
            sa.Column("ai_unlimited", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        # Whoever already had the AI authorized was using it without a meter, so
        # metering them now would cut off access the administrator already gave.
        #
        # useraisettings.use_global_key is created by the app's own idempotent
        # ALTERs rather than by any migration, so on an Alembic-only database it
        # may not exist yet - and then there is nobody to grandfather in.
        grandfather = inspector.has_table("useraisettings") and (
            "use_global_key" in _column_names("useraisettings")
        )
        if grandfather:
            op.execute(
                sa.text(
                    'UPDATE "user" SET ai_unlimited = true WHERE id IN '
                    "(SELECT user_id FROM useraisettings WHERE use_global_key = true)"
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    existing_columns = _column_names("user")
    with op.batch_alter_table("user") as batch_op:
        for column_name in ("ai_unlimited", "ai_credits_used", "ai_credits"):
            if column_name in existing_columns:
                batch_op.drop_column(column_name)
