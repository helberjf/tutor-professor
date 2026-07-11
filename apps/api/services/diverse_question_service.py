from __future__ import annotations

import hashlib
import re
import unicodedata
from copy import deepcopy
from typing import Any


_VALID_RATINGS = {"knew", "partial", "unknown"}


def normalize_text(value: str) -> str:
    """Return the accent- and punctuation-insensitive key used for deduplication."""
    plain = unicodedata.normalize("NFD", str(value or ""))
    plain = "".join(ch for ch in plain if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", plain.lower()).strip()


def stable_question_id(subject_name: str, front: str) -> str:
    """Build a stable identifier for a legacy question that does not have one."""
    key = f"{normalize_text(subject_name)}|{normalize_text(front)}"
    return f"question-{hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]}"


def _limited_text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _review_count(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def normalize_question(raw: dict, subject_name: str) -> dict:
    """Normalize one Diverse question while retaining its learning state."""
    front = _limited_text(raw.get("topic"), 120)
    raw_rating = _limited_text(raw.get("last_rating"), 10).lower()
    raw_id = _limited_text(raw.get("id"), 80)
    raw_code = raw.get("code_example")
    last_reviewed = _limited_text(raw.get("last_reviewed"), 40)
    return {
        "id": raw_id or stable_question_id(subject_name, front),
        "topic": front,
        "answer": _limited_text(raw.get("answer"), 2000),
        "code_example": str(raw_code)[:3000] if raw_code not in (None, "") else None,
        "done": bool(raw.get("done", False)),
        "last_rating": raw_rating if raw_rating in _VALID_RATINGS else None,
        "review_count": _review_count(raw.get("review_count")),
        "last_reviewed": last_reviewed or None,
    }


def _merge_content(canonical: dict, incoming: dict) -> None:
    if not canonical.get("answer") and incoming.get("answer"):
        canonical["answer"] = incoming["answer"]
    if not canonical.get("code_example") and incoming.get("code_example"):
        canonical["code_example"] = incoming["code_example"]


def _merge_review_progress(canonical: dict, incoming: dict) -> None:
    """Merge same-level legacy copies without discarding the most advanced state."""
    canonical["done"] = bool(canonical.get("done") or incoming.get("done"))
    current_count = _review_count(canonical.get("review_count"))
    incoming_count = _review_count(incoming.get("review_count"))
    if incoming_count > current_count:
        canonical["review_count"] = incoming_count
        canonical["last_rating"] = incoming.get("last_rating")
        canonical["last_reviewed"] = incoming.get("last_reviewed")
        return

    canonical["review_count"] = current_count
    if incoming_count == current_count:
        if not canonical.get("last_rating") and incoming.get("last_rating"):
            canonical["last_rating"] = incoming["last_rating"]
        incoming_reviewed = incoming.get("last_reviewed")
        if incoming_reviewed and incoming_reviewed > (canonical.get("last_reviewed") or ""):
            canonical["last_reviewed"] = incoming_reviewed


def _merge_question(canonical: dict, incoming: dict, *, merge_review: bool) -> None:
    _merge_content(canonical, incoming)
    if merge_review:
        _merge_review_progress(canonical, incoming)


def normalize_subject(raw: dict) -> dict:
    """Convert a legacy Diverse subject to canonical questions plus lesson references.

    Subject-level questions are authoritative for review state. Embedded lesson
    copies may fill missing answer/code content, but cannot overwrite that state.
    Questions found only in lessons are merged with one another normally.
    """
    source = deepcopy(raw) if isinstance(raw, dict) else {}
    name = _limited_text(source.get("name"), 60) or "Materia"
    by_key: dict[str, dict] = {}
    aliases: dict[str, str] = {}
    subject_keys: set[str] = set()
    explicit_id_keys: set[str] = set()

    def retain_explicit_id(key: str, canonical: dict, item: dict) -> None:
        explicit_id = _limited_text(item.get("id"), 80)
        if not explicit_id:
            return
        if key not in explicit_id_keys:
            previous_id = canonical["id"]
            canonical["id"] = explicit_id
            aliases[previous_id] = explicit_id
            explicit_id_keys.add(key)
        aliases[explicit_id] = canonical["id"]

    def resolve_alias(question_id: str) -> str:
        seen: set[str] = set()
        while question_id in aliases and question_id not in seen:
            seen.add(question_id)
            question_id = aliases[question_id]
        return question_id

    for item in source.get("topics") or []:
        if not isinstance(item, dict):
            continue
        key = normalize_text(item.get("topic"))
        if not key:
            continue
        incoming = normalize_question(item, name)
        subject_keys.add(key)
        canonical = by_key.get(key)
        if canonical is None:
            by_key[key] = incoming
            canonical = incoming
        else:
            _merge_question(canonical, incoming, merge_review=True)
        retain_explicit_id(key, canonical, item)

    lessons: list[dict] = []
    for raw_lesson in source.get("lessons") or []:
        if not isinstance(raw_lesson, dict):
            continue
        ids: list[str] = []
        for raw_id in raw_lesson.get("topic_ids") or []:
            question_id = _limited_text(raw_id, 80)
            if question_id:
                ids.append(aliases.get(question_id, question_id))

        for item in raw_lesson.get("topics") or []:
            if not isinstance(item, dict):
                continue
            key = normalize_text(item.get("topic"))
            if not key:
                continue
            incoming = normalize_question(item, name)
            canonical = by_key.get(key)
            if canonical is None:
                by_key[key] = incoming
                canonical = incoming
            else:
                _merge_question(canonical, incoming, merge_review=key not in subject_keys)
            retain_explicit_id(key, canonical, item)
            ids.append(canonical["id"])

        lessons.append(
            {
                "id": _limited_text(raw_lesson.get("id"), 80),
                "title": _limited_text(raw_lesson.get("title"), 80) or "Licao",
                "created_at": (
                    _limited_text(raw_lesson.get("created_at"), 40)
                    if raw_lesson.get("created_at")
                    else None
                ),
                "topic_ids": list(dict.fromkeys(ids)),
            }
        )

    for lesson in lessons:
        lesson["topic_ids"] = list(
            dict.fromkeys(resolve_alias(question_id) for question_id in lesson["topic_ids"])
        )

    return {"name": name, "topics": list(by_key.values()), "lessons": lessons}
