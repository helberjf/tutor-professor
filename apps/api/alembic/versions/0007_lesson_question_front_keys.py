"""persist normalized lesson-question identities

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-12
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def normalize_front(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(re.sub(r"[\W_]+", " ", text).split())


def _front_key(front: object) -> str:
    return hashlib.sha256(normalize_front(front).encode("utf-8")).hexdigest()


def upgrade() -> None:
    op.add_column(
        "lessonquestion",
        sa.Column("front_key", sa.String(length=64), nullable=True),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, child_id, lesson_id, front FROM lessonquestion "
            "ORDER BY child_id, lesson_id, id"
        )
    ).mappings()
    seen: set[tuple[int, int, str]] = set()
    for row in rows:
        key = _front_key(row["front"])
        identity = (row["child_id"], row["lesson_id"], key)
        if identity in seen:
            # Preserve legacy duplicates while reserving the canonical normalized key
            # for the oldest row, so all future inserts are still deduplicated.
            key = hashlib.sha256(f"{key}\0legacy-{row['id']}".encode("utf-8")).hexdigest()
        seen.add(identity)
        connection.execute(
            sa.text("UPDATE lessonquestion SET front_key = :front_key WHERE id = :id"),
            {"front_key": key, "id": row["id"]},
        )

    with op.batch_alter_table("lessonquestion") as batch_op:
        batch_op.alter_column(
            "front_key",
            existing_type=sa.String(length=64),
            nullable=False,
        )
        batch_op.create_unique_constraint(
            "uq_lessonquestion_child_lesson_front_key",
            ["child_id", "lesson_id", "front_key"],
        )


def downgrade() -> None:
    with op.batch_alter_table("lessonquestion") as batch_op:
        batch_op.drop_constraint(
            "uq_lessonquestion_child_lesson_front_key",
            type_="unique",
        )
        batch_op.drop_column("front_key")
