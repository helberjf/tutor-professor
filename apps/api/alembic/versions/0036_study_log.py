"""the study log: every study in one place, filed by discipline and subject

Revision ID: 0036
Revises: 0035
Create Date: 2026-09-26

The "Controle de estudos" holds one row per thing studied. Besides what the
learner writes from now on, it starts with what the app already knows was
studied, so the page does not open empty for someone with months of history:

* topics marked as studied or mastered, under their discipline and subject;
* language lessons finished, under the language;
* the notes typed in "O que estudou", under "Anotações do dia" — the old field
  never said which discipline a note was about, and guessing would file some of
  them in the wrong place. ``studyday.studied_text`` stays as it is: the streak
  of the days before this migration still reads it.

No ``dailyactivity`` row is written: each of these was logged when it happened.
Running the backfill again adds nothing (it skips what is already there).
"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "studylogentry"

# Frozen copies of the labels the app writes, so this migration keeps producing
# the same rows even after the service that names things changes.
_LABELS = {
    "pt": {"programming": "Programação", "day_note": "Anotações do dia"},
    "en": {"programming": "Programming", "day_note": "Daily notes"},
}
_LANGUAGE_LABELS_PT = {
    "English": "Inglês",
    "French": "Francês",
    "Spanish": "Espanhol",
    "German": "Alemão",
    "Italian": "Italiano",
    "Russian": "Russo",
}

_log = sa.table(
    TABLE,
    sa.column("child_id", sa.Integer),
    sa.column("studied_on", sa.Date),
    sa.column("title", sa.String),
    sa.column("title_is_auto", sa.Boolean),
    sa.column("discipline", sa.String),
    sa.column("subject", sa.String),
    sa.column("subject_id", sa.Integer),
    sa.column("subject_is_auto", sa.Boolean),
    sa.column("content", sa.Text),
    sa.column("source", sa.String),
    sa.column("source_id", sa.Integer),
    sa.column("created_at", sa.DateTime),
    sa.column("updated_at", sa.DateTime),
)


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _label_language(base_language: object) -> str:
    value = str(base_language or "Portuguese").strip().casefold()
    return "pt" if value.startswith("portug") else "en"


def _language_label(target_language: object, lang: str) -> str:
    name = str(target_language or "").strip() or "English"
    return _LANGUAGE_LABELS_PT.get(name, name) if lang == "pt" else name


def _clip(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _first_line_title(text: str) -> str:
    for raw_line in text.splitlines():
        line = raw_line.strip().lstrip("#>*-•").strip()
        if line:
            return line[:120]
    return ""


def _as_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _as_dict(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _child_languages(bind) -> dict[int, str]:
    children = sa.table("childprofile", sa.column("id", sa.Integer), sa.column("base_language", sa.String))
    return {
        int(child_id): _label_language(base_language)
        for child_id, base_language in bind.execute(sa.select(children.c.id, children.c.base_language))
    }


def _existing_keys(bind) -> set[tuple[int, str, int]]:
    return {
        (int(child_id), str(source), int(source_id))
        for child_id, source, source_id in bind.execute(
            sa.select(_log.c.child_id, _log.c.source, _log.c.source_id).where(_log.c.source_id.is_not(None))
        )
    }


def _topic_study_dates(bind) -> dict[tuple[int, int], date]:
    """The day each topic was first marked as studied, from the activity log."""

    # The activity log is created by the app's create_all, after the migrations,
    # so a brand-new database reaches this point without it.
    if not sa.inspect(bind).has_table("dailyactivity"):
        return {}
    activity = sa.table(
        "dailyactivity",
        sa.column("child_id", sa.Integer),
        sa.column("activity_id", sa.Integer),
        sa.column("activity_type", sa.String),
        sa.column("activity_date", sa.Date),
        sa.column("result_details", sa.JSON),
    )
    first_seen: dict[tuple[int, int], date] = {}
    rows = bind.execute(
        sa.select(
            activity.c.child_id,
            activity.c.activity_id,
            activity.c.activity_date,
            activity.c.result_details,
        ).where(
            activity.c.activity_type.in_(("coding_topic", "diverse")),
            activity.c.activity_id.is_not(None),
        )
    )
    for child_id, topic_id, activity_date, details in rows:
        parsed = _as_dict(details)
        if parsed.get("topic_id") != topic_id or parsed.get("status") not in ("studied", "mastered"):
            continue
        day = _as_date(activity_date)
        if day is None:
            continue
        key = (int(child_id), int(topic_id))
        if key not in first_seen or day < first_seen[key]:
            first_seen[key] = day
    return first_seen


def _studied_topic_rows(bind, languages, existing, now) -> list[dict]:
    topics = sa.table(
        "programmingtopic",
        sa.column("id", sa.Integer),
        sa.column("subject_id", sa.Integer),
        sa.column("title", sa.String),
        sa.column("status", sa.String),
        sa.column("updated_at", sa.DateTime),
    )
    subjects = sa.table(
        "programmingsubject",
        sa.column("id", sa.Integer),
        sa.column("child_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("track", sa.String),
        sa.column("discipline_id", sa.Integer),
    )
    disciplines = sa.table("studydiscipline", sa.column("id", sa.Integer), sa.column("name", sa.String))
    discipline_names = (
        {
            int(discipline_id): name
            for discipline_id, name in bind.execute(sa.select(disciplines.c.id, disciplines.c.name))
        }
        if sa.inspect(bind).has_table("studydiscipline")
        else {}
    )
    study_dates = _topic_study_dates(bind)
    rows: list[dict] = []
    query = (
        sa.select(
            topics.c.id,
            topics.c.title,
            topics.c.updated_at,
            subjects.c.id,
            subjects.c.child_id,
            subjects.c.name,
            subjects.c.track,
            subjects.c.discipline_id,
        )
        .select_from(topics.join(subjects, subjects.c.id == topics.c.subject_id))
        .where(sa.cast(topics.c.status, sa.String).in_(("studied", "mastered")))
        .order_by(topics.c.id)
    )
    for topic_id, title, updated_at, subject_id, child_id, subject_name, track, discipline_id in bind.execute(query):
        key = (int(child_id), "topic", int(topic_id))
        if key in existing:
            continue
        lang = languages.get(int(child_id), "pt")
        if track == "general":
            discipline = discipline_names.get(int(discipline_id or 0)) or subject_name
        else:
            discipline = _LABELS[lang]["programming"]
        studied_on = study_dates.get((int(child_id), int(topic_id))) or _as_date(updated_at) or now.date()
        rows.append(
            {
                "child_id": int(child_id),
                "studied_on": studied_on,
                "title": _clip(title, 200) or "?",
                "title_is_auto": True,
                "discipline": _clip(discipline, 100) or _LABELS[lang]["programming"],
                "subject": _clip(subject_name, 100) or None,
                "subject_id": int(subject_id),
                "subject_is_auto": False,
                "content": None,
                "source": "topic",
                "source_id": int(topic_id),
                "created_at": now,
                "updated_at": now,
            }
        )
        existing.add(key)
    return rows


def _finished_lesson_rows(bind, languages, existing, now) -> list[dict]:
    progress = sa.table(
        "childlessonprogress",
        sa.column("child_id", sa.Integer),
        sa.column("lesson_id", sa.Integer),
        sa.column("is_completed", sa.Boolean),
        sa.column("completed_at", sa.DateTime),
        sa.column("created_at", sa.DateTime),
    )
    lessons = sa.table(
        "lesson",
        sa.column("id", sa.Integer),
        sa.column("title", sa.String),
        sa.column("theme", sa.String),
        sa.column("target_language", sa.String),
    )
    # Added by the app's startup patches rather than a migration, so a brand-new
    # database does not have it yet; its lessons would all be English anyway.
    has_language = "target_language" in {
        column["name"] for column in sa.inspect(bind).get_columns("lesson")
    }
    rows: list[dict] = []
    query = (
        sa.select(
            progress.c.child_id,
            progress.c.lesson_id,
            progress.c.completed_at,
            progress.c.created_at,
            lessons.c.title,
            lessons.c.theme,
            lessons.c.target_language if has_language else sa.null(),
        )
        .select_from(progress.join(lessons, lessons.c.id == progress.c.lesson_id))
        .where(progress.c.is_completed.is_(True))
        .order_by(progress.c.completed_at, progress.c.lesson_id)
    )
    for child_id, lesson_id, completed_at, created_at, title, theme, target_language in bind.execute(query):
        key = (int(child_id), "lesson", int(lesson_id))
        if key in existing:
            continue
        lang = languages.get(int(child_id), "pt")
        rows.append(
            {
                "child_id": int(child_id),
                "studied_on": _as_date(completed_at) or _as_date(created_at) or now.date(),
                "title": _clip(title, 200) or "?",
                "title_is_auto": True,
                "discipline": _clip(_language_label(target_language, lang), 100),
                "subject": _clip(theme, 100) or None,
                "subject_id": None,
                "subject_is_auto": False,
                "content": None,
                "source": "lesson",
                "source_id": int(lesson_id),
                "created_at": now,
                "updated_at": now,
            }
        )
        existing.add(key)
    return rows


def _day_note_rows(bind, languages, existing, now) -> list[dict]:
    days = sa.table(
        "studyday",
        sa.column("id", sa.Integer),
        sa.column("child_id", sa.Integer),
        sa.column("study_date", sa.Date),
        sa.column("studied_text", sa.String),
    )
    rows: list[dict] = []
    query = sa.select(days.c.id, days.c.child_id, days.c.study_date, days.c.studied_text).order_by(days.c.study_date)
    for day_id, child_id, study_date, studied_text in bind.execute(query):
        text = str(studied_text or "").strip()
        key = (int(child_id), "day_note", int(day_id))
        if not text or key in existing:
            continue
        lang = languages.get(int(child_id), "pt")
        rows.append(
            {
                "child_id": int(child_id),
                "studied_on": _as_date(study_date) or now.date(),
                "title": _first_line_title(text) or _LABELS[lang]["day_note"],
                "title_is_auto": True,
                "discipline": _LABELS[lang]["day_note"],
                "subject": None,
                "subject_id": None,
                "subject_is_auto": False,
                "content": text,
                "source": "day_note",
                "source_id": int(day_id),
                "created_at": now,
                "updated_at": now,
            }
        )
        existing.add(key)
    return rows


def _backfill(bind) -> None:
    inspector = sa.inspect(bind)
    languages = _child_languages(bind) if inspector.has_table("childprofile") else {}
    existing = _existing_keys(bind)
    now = datetime.utcnow()
    rows: list[dict] = []
    if inspector.has_table("programmingtopic") and inspector.has_table("programmingsubject"):
        rows += _studied_topic_rows(bind, languages, existing, now)
    if inspector.has_table("childlessonprogress") and inspector.has_table("lesson"):
        rows += _finished_lesson_rows(bind, languages, existing, now)
    if inspector.has_table("studyday"):
        rows += _day_note_rows(bind, languages, existing, now)
    for start in range(0, len(rows), 500):
        bind.execute(_log.insert(), rows[start : start + 500])


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("child_id", sa.Integer(), nullable=False),
            sa.Column("studied_on", sa.Date(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("title_is_auto", sa.Boolean(), nullable=False),
            sa.Column("discipline", sa.String(length=100), nullable=False),
            sa.Column("subject", sa.String(length=100), nullable=True),
            sa.Column("subject_id", sa.Integer(), nullable=True),
            sa.Column("subject_is_auto", sa.Boolean(), nullable=False),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("source", sa.String(length=12), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("source_filename", sa.String(length=255), nullable=True),
            sa.Column("duration_minutes", sa.Integer(), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("summary_updated_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["child_id"], ["childprofile.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("child_id", "source", "source_id", name="uq_studylogentry_child_source"),
        )
    indexes = _index_names(TABLE)
    if "ix_studylogentry_child_id" not in indexes:
        op.create_index("ix_studylogentry_child_id", TABLE, ["child_id"])
    if "ix_studylogentry_child_studied_on" not in indexes:
        op.create_index("ix_studylogentry_child_studied_on", TABLE, ["child_id", "studied_on"])

    _backfill(op.get_bind())


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table(TABLE):
        op.drop_table(TABLE)
