"""Optional study scope and the last valid objective diagnosis.

Revision ID: 0040
Revises: 0039
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("objective")}
    for name in ("study_scope", "study_analysis"):
        if name not in columns:
            op.add_column("objective", sa.Column(name, sa.JSON(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("objective")}
    with op.batch_alter_table("objective") as batch:
        for name in ("study_analysis", "study_scope"):
            if name in columns:
                batch.drop_column(name)
