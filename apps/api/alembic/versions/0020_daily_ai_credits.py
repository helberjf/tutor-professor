"""give every account a configurable daily AI allowance

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-05
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("user"):
        return

    columns = _column_names("user")
    with op.batch_alter_table("user") as batch_op:
        if "ai_credits_used_today" not in columns:
            batch_op.add_column(sa.Column("ai_credits_used_today", sa.Integer(), nullable=False, server_default="0"))
        if "ai_daily_credit_limit" not in columns:
            batch_op.add_column(sa.Column("ai_daily_credit_limit", sa.Integer(), nullable=False, server_default="3"))
        if "ai_credits_reset_date" not in columns:
            batch_op.add_column(sa.Column("ai_credits_reset_date", sa.Date(), nullable=True))

    op.execute(sa.text('UPDATE "user" SET ai_credits = 3 WHERE ai_credits = 0'))
    if sa.inspect(op.get_bind()).has_table("useraisettings"):
        op.execute(
            sa.text(
                'INSERT INTO useraisettings '
                '(user_id, provider, api_key_encrypted, use_global_key, model, base_url, created_at, updated_at) '
                'SELECT u.id, \'gemini\', \'\', true, \'gemini-3.1-flash-lite\', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP '
                'FROM "user" u WHERE NOT EXISTS '
                '(SELECT 1 FROM useraisettings s WHERE s.user_id = u.id)'
            )
        )


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("user"):
        return
    columns = _column_names("user")
    with op.batch_alter_table("user") as batch_op:
        for column_name in ("ai_credits_reset_date", "ai_daily_credit_limit", "ai_credits_used_today"):
            if column_name in columns:
                batch_op.drop_column(column_name)
