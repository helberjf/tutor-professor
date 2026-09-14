"""objectives with their study checklist and reach percentage

Revision ID: 0027
Revises: 0026
Create Date: 2026-09-13
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "objective" not in tables:
        op.create_table(
            "objective",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=True),
            sa.Column("icon_emoji", sa.String(length=10), nullable=True),
            sa.Column("target_date", sa.Date(), nullable=True),
            sa.Column("status", sa.String(length=12), nullable=False, server_default="active"),
            sa.Column("achieved_at", sa.DateTime(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_objective_child_id", "objective", ["child_id"])
        op.create_index("ix_objective_child_status", "objective", ["child_id", "status"])

    if "objectiveitem" not in tables:
        op.create_table(
            "objectiveitem",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("objective_id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("notes", sa.String(length=1000), nullable=True),
            sa.Column("area", sa.String(length=20), nullable=False, server_default="free"),
            sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["objective_id"], ["objective.id"]),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_objectiveitem_objective_id", "objectiveitem", ["objective_id"])
        op.create_index("ix_objectiveitem_child_id", "objectiveitem", ["child_id"])
        op.create_index(
            "ix_objectiveitem_objective_done", "objectiveitem", ["objective_id", "done"]
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    # Items first: they point at the objective.
    if "objectiveitem" in tables:
        op.drop_table("objectiveitem")
    if "objective" in tables:
        op.drop_table("objective")
