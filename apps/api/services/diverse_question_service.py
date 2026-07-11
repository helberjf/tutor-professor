from __future__ import annotations

import hashlib
import unicodedata
from copy import deepcopy
from typing import Any


_VALID_RATINGS = {"knew", "partial", "unknown"}


def normalize_text(value: str) -> str:
    """Return the accent- and punctuation-insensitive key used for deduplication."""
    plain = unicodedata.normalize("NFD", str(value or ""))
    plain = "".join(ch for ch in plain if unicodedata.category(ch) != "Mn")
    alphanumeric = "".join(ch.casefold() if ch.isalnum() else " " for ch in plain)
    return " ".join(alphanumeric.split())


def stable_question_id(subject_name: str, front: str) -> str:
    """Build a stable identifier for a legacy question that does not have one."""
    key = f"{normalize_text(subject_name)}|{normalize_text(front)}"
    return f"question-{hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]}"


def _stable_entity_id(prefix: str, key: str, ordinal: int, used_ids: set[str]) -> str:
    salt = 0
    while True:
        source = f"{normalize_text(key)}|{ordinal}|{salt}"
        candidate = f"{prefix}-{hashlib.sha1(source.encode('utf-8')).hexdigest()[:16]}"
        if candidate not in used_ids:
            return candidate
        salt += 1


def has_canonical_subject_identities(raw_subjects: Any) -> bool:
    """Return whether a raw list already carries unique persistent subject/lesson IDs."""
    if not isinstance(raw_subjects, list):
        return False
    subject_ids: set[str] = set()
    for subject in raw_subjects:
        if not isinstance(subject, dict):
            return False
        subject_id = _limited_text(subject.get("id"), 80)
        if not subject_id or subject_id in subject_ids:
            return False
        subject_ids.add(subject_id)

        lessons = subject.get("lessons") or []
        if not isinstance(lessons, list):
            return False
        lesson_ids: set[str] = set()
        for lesson in lessons:
            if not isinstance(lesson, dict):
                return False
            lesson_id = _limited_text(lesson.get("id"), 80)
            if not lesson_id or lesson_id in lesson_ids:
                return False
            lesson_ids.add(lesson_id)
    return True


def capture_original_identity_metadata(raw_subjects: Any) -> dict:
    """Describe IDs exactly as supplied before canonical normalization."""
    subjects = raw_subjects if isinstance(raw_subjects, list) else []
    supplied_subject_ids = [
        _limited_text(subject.get("id"), 80) if isinstance(subject, dict) else ""
        for subject in subjects
    ]
    subject_counts = {
        subject_id: supplied_subject_ids.count(subject_id)
        for subject_id in supplied_subject_ids
        if subject_id
    }
    metadata_subjects: list[dict] = []
    for subject, subject_id in zip(subjects, supplied_subject_ids):
        raw_lessons = subject.get("lessons") or [] if isinstance(subject, dict) else []
        lessons = raw_lessons if isinstance(raw_lessons, list) else []
        supplied_lesson_ids = [
            _limited_text(lesson.get("id"), 80) if isinstance(lesson, dict) else ""
            for lesson in lessons
        ]
        lesson_counts = {
            lesson_id: supplied_lesson_ids.count(lesson_id)
            for lesson_id in supplied_lesson_ids
            if lesson_id
        }
        metadata_subjects.append(
            {
                "id": subject_id or None,
                "duplicate": bool(subject_id and subject_counts[subject_id] > 1),
                "lessons": [
                    {
                        "id": lesson_id or None,
                        "duplicate": bool(lesson_id and lesson_counts[lesson_id] > 1),
                    }
                    for lesson_id in supplied_lesson_ids
                ],
            }
        )
    return {"subjects": metadata_subjects}


def normalize_subjects(raw_subjects: Any) -> list[dict]:
    """Normalize a Diverse subject list while assigning persistent unique identities."""
    source_subjects = [item for item in (raw_subjects or []) if isinstance(item, dict)]
    reserved_ids = {
        subject_id
        for item in source_subjects
        if (subject_id := _limited_text(item.get("id"), 80))
    }
    used_ids: set[str] = set()
    normalized_subjects: list[dict] = []

    for ordinal, item in enumerate(source_subjects):
        explicit_id = _limited_text(item.get("id"), 80)
        if explicit_id and explicit_id not in used_ids:
            subject_id = explicit_id
        else:
            subject_id = _stable_entity_id(
                "subject",
                str(item.get("name") or "Materia"),
                ordinal,
                reserved_ids | used_ids,
            )
        used_ids.add(subject_id)
        prepared = deepcopy(item)
        prepared["id"] = subject_id
        normalized_subjects.append(normalize_subject(prepared))

    return normalized_subjects


def _is_canonical_deterministic_id(value: str) -> bool:
    prefix = "question-"
    digest = value[len(prefix) :] if value.startswith(prefix) else ""
    return len(digest) == 16 and all(ch in "0123456789abcdef" for ch in digest)


def _is_distinct_truncated_question(canonical: dict, incoming: dict) -> bool:
    """Recognize canonical records whose different full fronts were already truncated.

    Arbitrary legacy IDs are not identity evidence. Two distinct IDs produced by
    ``stable_question_id`` plus a front at the storage limit are evidence that a
    prior normalization saw different full questions with the same 120-char prefix.
    """
    canonical_id = str(canonical.get("id") or "")
    incoming_id = str(incoming.get("id") or "")
    return (
        len(str(canonical.get("topic") or "")) == 120
        and len(str(incoming.get("topic") or "")) == 120
        and canonical_id != incoming_id
        and _is_canonical_deterministic_id(canonical_id)
        and _is_canonical_deterministic_id(incoming_id)
    )


def _limited_text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _review_count(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def normalize_question(raw: dict, subject_name: str) -> dict:
    """Normalize one Diverse question while retaining its learning state."""
    original_front = str(raw.get("topic") or "").strip()
    front = original_front[:120]
    raw_rating = _limited_text(raw.get("last_rating"), 10).lower()
    raw_id = _limited_text(raw.get("id"), 80)
    raw_code = raw.get("code_example")
    code_example = str(raw_code)[:3000] if raw_code is not None else ""
    last_reviewed = _limited_text(raw.get("last_reviewed"), 40)
    return {
        "id": raw_id or stable_question_id(subject_name, original_front),
        "topic": front,
        "answer": _limited_text(raw.get("answer"), 2000),
        "code_example": code_example if code_example.strip() else None,
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
        incoming_reviewed = incoming.get("last_reviewed")
        if incoming_reviewed and incoming_reviewed > (canonical.get("last_reviewed") or ""):
            canonical["last_reviewed"] = incoming_reviewed
            canonical["last_rating"] = incoming.get("last_rating")
        elif not canonical.get("last_rating") and incoming.get("last_rating"):
            canonical["last_rating"] = incoming["last_rating"]


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
    subject_id = _limited_text(source.get("id"), 80) or _stable_entity_id(
        "subject", name, 0, set()
    )
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
        explicit_id = _limited_text(item.get("id"), 80)
        if (
            explicit_id
            and key in explicit_id_keys
            and key in by_key
            and _is_distinct_truncated_question(by_key[key], incoming)
        ):
            key = f"{key}|id:{explicit_id}"
        subject_keys.add(key)
        canonical = by_key.get(key)
        if canonical is None:
            by_key[key] = incoming
            canonical = incoming
        else:
            _merge_question(canonical, incoming, merge_review=True)
        retain_explicit_id(key, canonical, item)

    lessons: list[dict] = []
    source_lessons = [
        lesson for lesson in (source.get("lessons") or []) if isinstance(lesson, dict)
    ]
    reserved_lesson_ids = {
        lesson_id
        for lesson in source_lessons
        if (lesson_id := _limited_text(lesson.get("id"), 80))
    }
    used_lesson_ids: set[str] = set()
    for lesson_ordinal, raw_lesson in enumerate(source_lessons):
        if not isinstance(raw_lesson, dict):
            continue
        explicit_lesson_id = _limited_text(raw_lesson.get("id"), 80)
        if explicit_lesson_id and explicit_lesson_id not in used_lesson_ids:
            lesson_id = explicit_lesson_id
        else:
            lesson_id = _stable_entity_id(
                "lesson",
                f"{subject_id}|{raw_lesson.get('title') or 'Licao'}",
                lesson_ordinal,
                reserved_lesson_ids | used_lesson_ids,
            )
        used_lesson_ids.add(lesson_id)
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
                "id": lesson_id,
                "title": _limited_text(raw_lesson.get("title"), 80) or "Licao",
                "created_at": (
                    _limited_text(raw_lesson.get("created_at"), 40)
                    if raw_lesson.get("created_at")
                    else None
                ),
                "topic_ids": list(dict.fromkeys(ids)),
            }
        )

    canonical_ids = {question["id"] for question in by_key.values()}
    for lesson in lessons:
        lesson["topic_ids"] = list(
            dict.fromkeys(
                resolved_id
                for question_id in lesson["topic_ids"]
                if (resolved_id := resolve_alias(question_id)) in canonical_ids
            )
        )

    return {
        "id": subject_id,
        "name": name,
        "topics": list(by_key.values()),
        "lessons": lessons,
    }
