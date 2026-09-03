"""verify an e-mail address and reset a forgotten password without the admin

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    if "email_verified_at" not in _column_names("user"):
        op.add_column("user", sa.Column("email_verified_at", sa.DateTime(), nullable=True))

    # Accounts that already exist were vouched for by the administrator by hand,
    # so locking them out behind a verification e-mail would be a regression.
    op.execute(
        sa.text(
            "UPDATE \"user\" SET email_verified_at = CURRENT_TIMESTAMP "
            "WHERE email_verified_at IS NULL"
        )
    )

    if not inspector.has_table("authtoken"):
        op.create_table(
            "authtoken",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("purpose", sa.String(length=40), nullable=False),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_authtoken_user_id", "authtoken", ["user_id"])
        op.create_index("ix_authtoken_purpose", "authtoken", ["purpose"])
        op.create_index("ix_authtoken_token_hash", "authtoken", ["token_hash"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("authtoken"):
        op.drop_table("authtoken")
    if inspector.has_table("user") and "email_verified_at" in _column_names("user"):
        with op.batch_alter_table("user") as batch_op:
            batch_op.drop_column("email_verified_at")
