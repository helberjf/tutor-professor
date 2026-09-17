"""paginate programming subjects by relevance and last use

Revision ID: 0031
Revises: 0030
Create Date: 2026-09-16
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("programmingsubject"):
        return

    columns = _column_names("programmingsubject")
    with op.batch_alter_table("programmingsubject") as batch_op:
        if "relevance" not in columns:
            batch_op.add_column(
                sa.Column(
                    "relevance",
                    sa.Integer(),
                    nullable=False,
                    server_default=sa.text("3"),
                )
            )
        if "last_used_at" not in columns:
            batch_op.add_column(sa.Column("last_used_at", sa.DateTime(), nullable=True))

    # Existing curricula already have useful activity timestamps on their
    # topics. Preserve that history so the default ordering is meaningful on
    # the first request after deployment, before the learner opens a card again.
    if inspector.has_table("programmingtopic"):
        op.execute(
            sa.text(
                """
                UPDATE programmingsubject
                SET last_used_at = (
                    SELECT MAX(programmingtopic.updated_at)
                    FROM programmingtopic
                    WHERE programmingtopic.subject_id = programmingsubject.id
                )
                WHERE last_used_at IS NULL
                  AND EXISTS (
                    SELECT 1
                    FROM programmingtopic
                    WHERE programmingtopic.subject_id = programmingsubject.id
                  )
                """
            )
        )

    indexes = _index_names("programmingsubject")
    if "ix_programmingsubject_relevance" not in indexes:
        op.create_index(
            "ix_programmingsubject_relevance",
            "programmingsubject",
            ["relevance"],
        )
    if "ix_programmingsubject_last_used_at" not in indexes:
        op.create_index(
            "ix_programmingsubject_last_used_at",
            "programmingsubject",
            ["last_used_at"],
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("programmingsubject"):
        return

    indexes = _index_names("programmingsubject")
    if "ix_programmingsubject_last_used_at" in indexes:
        op.drop_index("ix_programmingsubject_last_used_at", table_name="programmingsubject")
    if "ix_programmingsubject_relevance" in indexes:
        op.drop_index("ix_programmingsubject_relevance", table_name="programmingsubject")

    columns = _column_names("programmingsubject")
    with op.batch_alter_table("programmingsubject") as batch_op:
        if "last_used_at" in columns:
            batch_op.drop_column("last_used_at")
        if "relevance" in columns:
            batch_op.drop_column("relevance")
