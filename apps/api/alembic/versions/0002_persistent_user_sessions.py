"""persistent user sessions

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-31
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "usersession",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_token_hash", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_token_hash"),
    )
    op.create_index("ix_usersession_session_token_hash", "usersession", ["session_token_hash"])
    op.create_index("ix_usersession_user_id", "usersession", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_usersession_user_id", "usersession")
    op.drop_index("ix_usersession_session_token_hash", "usersession")
    op.drop_table("usersession")
