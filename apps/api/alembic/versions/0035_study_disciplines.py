"""group the general subjects under disciplines, the way programming groups its own

Revision ID: 0035
Revises: 0034
Create Date: 2026-09-23

"Outras disciplinas" holds disciplines — Francês, Direito — and each one holds
subjects (Gramática, Conversação...) exactly as programming holds Python or
DVA-C02. Programming stays the built-in discipline and has no row here. A
general subject that already exists moves into a discipline of the same name,
so nothing disappears from the list.
"""
from __future__ import annotations

from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _wrap_general_subjects(bind) -> None:
    """Give every general subject without a discipline one named after it."""

    disciplines = sa.table(
        "studydiscipline",
        sa.column("id", sa.Integer),
        sa.column("child_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("icon_emoji", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    orphans = bind.execute(
        sa.text(
            "SELECT id, child_id, name, icon_emoji FROM programmingsubject "
            "WHERE track = 'general' AND discipline_id IS NULL ORDER BY id"
        )
    ).all()
    now = datetime.utcnow()
    for subject_id, child_id, name, icon_emoji in orphans:
        existing = bind.execute(
            sa.text(
                "SELECT id FROM studydiscipline WHERE child_id = :child AND lower(name) = lower(:name)"
            ),
            {"child": child_id, "name": name},
        ).scalar()
        discipline_id = existing or bind.execute(
            disciplines.insert()
            .values(child_id=child_id, name=name, icon_emoji=icon_emoji, created_at=now)
            .returning(disciplines.c.id)
        ).scalar_one()
        bind.execute(
            sa.text("UPDATE programmingsubject SET discipline_id = :discipline WHERE id = :subject"),
            {"discipline": discipline_id, "subject": subject_id},
        )


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("studydiscipline"):
        op.create_table(
            "studydiscipline",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=True),
            sa.Column("icon_emoji", sa.String(length=10), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_studydiscipline_child_id", "studydiscipline", ["child_id"])

    if not inspector.has_table("programmingsubject"):
        return
    if "discipline_id" not in _column_names("programmingsubject"):
        with op.batch_alter_table("programmingsubject") as batch_op:
            batch_op.add_column(sa.Column("discipline_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_programmingsubject_discipline_id",
                "studydiscipline",
                ["discipline_id"],
                ["id"],
            )
    if "ix_programmingsubject_discipline_id" not in _index_names("programmingsubject"):
        op.create_index("ix_programmingsubject_discipline_id", "programmingsubject", ["discipline_id"])

    _wrap_general_subjects(op.get_bind())


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("programmingsubject") and "discipline_id" in _column_names("programmingsubject"):
        if "ix_programmingsubject_discipline_id" in _index_names("programmingsubject"):
            op.drop_index("ix_programmingsubject_discipline_id", table_name="programmingsubject")
        with op.batch_alter_table("programmingsubject") as batch_op:
            batch_op.drop_constraint("fk_programmingsubject_discipline_id", type_="foreignkey")
            batch_op.drop_column("discipline_id")
    if inspector.has_table("studydiscipline"):
        op.drop_index("ix_studydiscipline_child_id", table_name="studydiscipline")
        op.drop_table("studydiscipline")
