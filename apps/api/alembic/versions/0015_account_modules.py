"""let an account switch optional modules on, with programming off by default

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    if "enabled_modules" not in _column_names("user"):
        op.add_column("user", sa.Column("enabled_modules", sa.JSON(), nullable=True))

    # Accounts that already built a programming curriculum keep it visible: the
    # new default is for new accounts, not a feature being taken away.
    if inspector.has_table("childprofile") and inspector.has_table("programmingsubject"):
        op.execute(
            sa.text(
                """
                UPDATE "user"
                SET enabled_modules = '{"coding": true}'
                WHERE id IN (
                    SELECT DISTINCT c.user_id
                    FROM childprofile c
                    JOIN programmingsubject s ON s.child_id = c.id
                    WHERE c.user_id IS NOT NULL
                )
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return
    if "enabled_modules" in _column_names("user"):
        with op.batch_alter_table("user") as batch_op:
            batch_op.drop_column("enabled_modules")
