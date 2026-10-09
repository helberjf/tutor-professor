"""Private resumable objective analysis, without new foreign keys.

Revision ID: 0041
Revises: 0040
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("objective")}
    if "analysis_workflow" not in columns:
        op.add_column("objective", sa.Column("analysis_workflow", sa.JSON(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("objective")}
    if "analysis_workflow" in columns:
        with op.batch_alter_table("objective") as batch:
            batch.drop_column("analysis_workflow")
