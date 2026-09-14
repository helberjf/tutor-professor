"""refresh text snapshots in active study sessions

Revision ID: 0029
Revises: 0028
Create Date: 2026-09-14

Study sessions deliberately store a stable queue, including display text.  A
session that was opened before the shared lesson copy was corrected therefore
needs its labels refreshed once; its order, position, and answer counters stay
unchanged.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("studysession"):
        return

    metadata = sa.MetaData()
    study_session = sa.Table("studysession", metadata, autoload_with=bind)
    lesson = sa.Table("lesson", metadata, autoload_with=bind)
    lesson_item = sa.Table("lessonitem", metadata, autoload_with=bind)

    titles = {
        row["id"]: row["title"]
        for row in bind.execute(sa.select(lesson.c.id, lesson.c.title)).mappings()
    }
    item_copy = {
        row["id"]: row
        for row in bind.execute(
            sa.select(
                lesson_item.c.id,
                lesson_item.c.lesson_id,
                lesson_item.c.word_pt,
                lesson_item.c.example_sentence_pt,
            )
        ).mappings()
    }

    sessions = bind.execute(
        sa.select(study_session.c.id, study_session.c["items"]).where(
            study_session.c.status == "active"
        )
    ).mappings()
    for record in sessions:
        items = record["items"]
        if not isinstance(items, list):
            continue
        changed = False
        refreshed = []
        for raw_card in items:
            card = dict(raw_card) if isinstance(raw_card, dict) else raw_card
            if not isinstance(card, dict):
                refreshed.append(card)
                continue
            lesson_id = card.get("lesson_id")
            if lesson_id in titles and card.get("topic_title") != titles[lesson_id]:
                card["topic_title"] = titles[lesson_id]
                changed = True
            source = item_copy.get(card.get("ref_id"))
            if source is not None and card.get("kind") == "lesson_item":
                for key, value in (
                    ("answer", source["word_pt"]),
                    ("example_translation", source["example_sentence_pt"] or ""),
                ):
                    if card.get(key) != value:
                        card[key] = value
                        changed = True
            refreshed.append(card)
        if changed:
            bind.execute(
                study_session.update()
                .where(study_session.c.id == record["id"])
                .values(items=refreshed)
            )


def downgrade() -> None:
    # Data-only correction; the previous queue snapshot is intentionally not
    # restored because it contains the copy this migration fixes.
    pass
