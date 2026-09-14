"""refresh the shared lesson copy without changing learner progress

Revision ID: 0028
Revises: 0027
Create Date: 2026-09-14

The seed files are the source of truth for the shared lesson pack, but older
databases keep the original Portuguese strings in their rows.  This migration
updates only shared rows that match a seed title (ignoring accents), preserving
completion state and every learner-owned lesson.
"""
from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONTENT_DIR = Path(__file__).resolve().parents[2] / "content" / "lessons"


def _title_key(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in folded if not unicodedata.combining(char))


def _seed_files() -> list[dict]:
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(CONTENT_DIR.glob("*.json"))
    ]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("lesson") or not inspector.has_table("lessonitem"):
        return

    metadata = sa.MetaData()
    lesson = sa.Table("lesson", metadata, autoload_with=bind)
    lesson_item = sa.Table("lessonitem", metadata, autoload_with=bind)
    lesson_columns = set(lesson.c.keys())
    shared_rows = list(
        bind.execute(sa.select(lesson).where(lesson.c.child_id.is_(None))).mappings()
    )
    by_id = {row["id"]: row for row in shared_rows}
    by_title = {}
    for row in shared_rows:
        by_title.setdefault(
            (
                _title_key(str(row["title"] or "")),
                str(row.get("target_language") or "").casefold(),
                row.get("level"),
            ),
            [],
        ).append(row)

    for seed in _seed_files():
        seed_title = str(seed.get("title") or "")
        row = by_id.get(seed.get("id")) if seed.get("id") is not None else None
        if row is None:
            candidates = by_title.get(
                (
                    _title_key(seed_title),
                    str(seed.get("target_language", "English")).casefold(),
                    seed.get("level"),
                ),
                [],
            )
            row = candidates[0] if len(candidates) == 1 else None
        if row is None:
            continue

        fields = {
            "title": seed_title,
            "theme": seed.get("theme", ""),
            "objective": seed.get("objective", ""),
            "content": seed.get("content", {}),
            "level": seed.get("level"),
            "target_language": seed.get("target_language", "English"),
        }
        fields = {name: value for name, value in fields.items() if name in lesson_columns}
        bind.execute(lesson.update().where(lesson.c.id == row["id"]).values(**fields))

        incoming = seed.get("items", [])
        existing = list(
            bind.execute(
                sa.select(lesson_item)
                .where(lesson_item.c.lesson_id == row["id"])
                .order_by(lesson_item.c.id)
            ).mappings()
        )
        # Keep item identity (and any future references) intact.  A count
        # mismatch is left alone for the seeder to reconcile explicitly.
        if len(existing) == len(incoming):
            for current, item in zip(existing, incoming):
                bind.execute(
                    lesson_item.update()
                    .where(lesson_item.c.id == current["id"])
                    .values(
                        word_en=item.get("word_en", ""),
                        word_pt=item.get("word_pt", ""),
                        example_sentence_en=item.get("example_sentence_en", ""),
                        example_sentence_pt=item.get("example_sentence_pt", ""),
                    )
                )


def downgrade() -> None:
    # Data-only correction; the previous copy is not recoverable from schema.
    pass
