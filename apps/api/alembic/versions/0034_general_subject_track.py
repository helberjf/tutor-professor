"""study the other subjects the way programming is studied

Revision ID: 0034
Revises: 0033
Create Date: 2026-09-23

"Outras matérias" used to be a list of loose questions saved per date, while
programming had subjects, topics with a lesson, flashcards, questions and a
simulado. Both now use the second shape: a subject carries a ``track`` that
says which list shows it, and the questions saved under the old shape move into
it as flashcards so nothing already written is lost.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MIGRATED_DESCRIPTION = "Trazida de Outras matérias."
LOOSE_QUESTIONS_TOPIC = "Perguntas salvas"


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _clean(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _as_list(value: object) -> list:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    return value if isinstance(value, list) else []


def _collect_diverse_subjects(bind) -> dict[int, dict[str, dict]]:
    """Every child's old subjects, merged by name across the dates they were saved on."""

    rows = bind.execute(
        sa.text("SELECT child_id, custom_subjects FROM diverseday ORDER BY study_date, id")
    ).all()
    by_child: dict[int, dict[str, dict]] = {}
    for child_id, raw_subjects in rows:
        for raw_subject in _as_list(raw_subjects):
            if not isinstance(raw_subject, dict):
                continue
            name = _clean(raw_subject.get("name"), 100)
            if not name:
                continue
            merged = by_child.setdefault(int(child_id), {}).setdefault(
                name.casefold(),
                {"name": name, "questions": {}, "lessons": {}},
            )
            for raw_topic in _as_list(raw_subject.get("topics")):
                if not isinstance(raw_topic, dict):
                    continue
                front = _clean(raw_topic.get("topic"), 500)
                back = str(raw_topic.get("answer") or "").strip()[:2000]
                if not front or not back:
                    continue
                merged["questions"].setdefault(
                    front.casefold(),
                    {
                        "id": str(raw_topic.get("id") or ""),
                        "front": front,
                        "back": back,
                        "code_example": (str(raw_topic.get("code_example") or "").strip()[:3000] or None),
                        "done": bool(raw_topic.get("done")),
                    },
                )
            for raw_lesson in _as_list(raw_subject.get("lessons")):
                if not isinstance(raw_lesson, dict):
                    continue
                title = _clean(raw_lesson.get("title"), 200)
                topic_ids = [str(item) for item in _as_list(raw_lesson.get("topic_ids"))]
                if title and topic_ids:
                    merged["lessons"].setdefault(title.casefold(), {"title": title, "topic_ids": topic_ids})
    return by_child


def _move_diverse_subjects(bind) -> None:
    inspector = sa.inspect(bind)
    needed = {"diverseday", "programmingsubject", "programmingtopic", "programmingflashcard"}
    if not needed.issubset(set(inspector.get_table_names())):
        return

    subjects = sa.table(
        "programmingsubject",
        sa.column("id", sa.Integer),
        sa.column("child_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("relevance", sa.Integer),
        sa.column("track", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    topics = sa.table(
        "programmingtopic",
        sa.column("id", sa.Integer),
        sa.column("subject_id", sa.Integer),
        sa.column("title", sa.String),
        sa.column("order_index", sa.Integer),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    flashcards = sa.table(
        "programmingflashcard",
        sa.column("topic_id", sa.Integer),
        sa.column("subject_id", sa.Integer),
        sa.column("child_id", sa.Integer),
        sa.column("front", sa.String),
        sa.column("back", sa.String),
        sa.column("code_example", sa.String),
        sa.column("created_at", sa.DateTime),
    )

    now = datetime.utcnow()
    for child_id, subjects_by_name in _collect_diverse_subjects(bind).items():
        existing = {
            str(name).casefold()
            for (name,) in bind.execute(
                sa.text(
                    "SELECT name FROM programmingsubject WHERE child_id = :child AND track = 'general'"
                ),
                {"child": child_id},
            ).all()
        }
        for key, subject in subjects_by_name.items():
            if key in existing or not subject["questions"]:
                continue
            subject_id = bind.execute(
                subjects.insert()
                .values(
                    child_id=child_id,
                    name=subject["name"],
                    description=MIGRATED_DESCRIPTION,
                    relevance=3,
                    track="general",
                    created_at=now,
                )
                .returning(subjects.c.id)
            ).scalar_one()

            questions = list(subject["questions"].values())
            by_id = {question["id"]: question for question in questions if question["id"]}
            groups: list[tuple[str, list[dict]]] = []
            placed: set[str] = set()
            for lesson in subject["lessons"].values():
                members = [by_id[item] for item in lesson["topic_ids"] if item in by_id and item not in placed]
                if members:
                    placed.update(member["id"] for member in members)
                    groups.append((lesson["title"], members))
            loose = [question for question in questions if question["id"] not in placed]
            if loose:
                groups.append((LOOSE_QUESTIONS_TOPIC, loose))

            for order_index, (title, members) in enumerate(groups):
                topic_id = bind.execute(
                    topics.insert()
                    .values(
                        subject_id=subject_id,
                        title=title,
                        order_index=order_index,
                        status="studied" if all(member["done"] for member in members) else "not_started",
                        created_at=now,
                        updated_at=now,
                    )
                    .returning(topics.c.id)
                ).scalar_one()
                bind.execute(
                    flashcards.insert(),
                    [
                        {
                            "topic_id": topic_id,
                            "subject_id": subject_id,
                            "child_id": child_id,
                            "front": member["front"],
                            "back": member["back"],
                            "code_example": member["code_example"],
                            "created_at": now,
                        }
                        for member in members
                    ],
                )


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("programmingsubject"):
        return

    if "track" not in _column_names("programmingsubject"):
        # Everything that exists today is a programming subject.
        with op.batch_alter_table("programmingsubject") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "track",
                    sa.String(length=20),
                    nullable=False,
                    server_default=sa.text("'programming'"),
                )
            )
    if "ix_programmingsubject_track" not in _index_names("programmingsubject"):
        op.create_index("ix_programmingsubject_track", "programmingsubject", ["track"])

    _move_diverse_subjects(op.get_bind())


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("programmingsubject"):
        return
    # The moved subjects stay behind as programming subjects; the old per-date
    # rows they came from were never touched, so nothing is lost either way.
    if "ix_programmingsubject_track" in _index_names("programmingsubject"):
        op.drop_index("ix_programmingsubject_track", table_name="programmingsubject")
    if "track" in _column_names("programmingsubject"):
        with op.batch_alter_table("programmingsubject") as batch_op:
            batch_op.drop_column("track")
