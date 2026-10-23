"""Rewrite the "DVA-C02 — Revisão Sol 6.1" course with the v3 lessons; dry-run by default.

The v3 catalog (scripts/content/dva_c02_v3) replaces the reading, study
questions and flashcards of the 28 existing topics in place, keeping their ids,
and adds the topics the catalog has beyond them. Nothing is deleted: question
and flashcard rows are rewritten in place and the extra ones are inserted.
The three simulados (Exam rows) are not touched.

Rewritten questions and cards are new material, so the script refuses to run
while any of them has study progress, unless --allow-progress-reset is given.

    python scripts/rewrite_dva_c02_v3.py --env-file ../local.secrets --url-key SUPABASE_DIRECT_URL \
        --backup tmp/backups/dva-c02-v3-antes.json
    python scripts/rewrite_dva_c02_v3.py ... --backup tmp/backups/dva-c02-v3-antes.json --apply
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
sys.path.insert(0, str(ROOT / "scripts"))

from dotenv import dotenv_values  # noqa: E402
from sqlalchemy import bindparam, create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import models.database as m  # noqa: E402
from schemas.schemas import TopicAIContentSchema  # noqa: E402
from services.ai_flashcard_service import normalize_front  # noqa: E402
from services.coding_service import seed_coding_review_item, validate_programming_question_batch  # noqa: E402

from dva_c02_v3_catalog import Lesson, catalog_hash, load_catalog  # noqa: E402

TARGET_EMAIL = "helberjf@gmail.com"
TARGET_CHILD = "Henrique"
SUBJECT_ID = 30
SUBJECT_NAME = "DVA-C02 — Revisão Sol 6.1"
PREVIOUS_REVISION = "dva-c02-sol61-v2"
REVISION = "dva-c02-v3"
DESCRIPTION = (
    "34 aulas com exemplos em TypeScript (AWS SDK for JavaScript v3) cobrindo os quatro domínios do guia DVA-C02, "
    "com 340 questões comentadas, "
    "340 flashcards e três simulados de 65 questões. Percentual de treino não reproduz a nota escalonada oficial."
)


class RewriteError(ValueError):
    pass


def validated_catalog() -> list[Lesson]:
    lessons = load_catalog(normalize=normalize_front)
    for lesson in lessons:
        TopicAIContentSchema.model_validate(lesson.ai_content())
        validate_programming_question_batch(lesson.quiz, expected_count=len(lesson.quiz), existing_questions=[])
    return lessons


def _rows(session: Session, table: str, column: str, ids: list[int]) -> list[dict]:
    if not ids:
        return []
    query = text(f'SELECT * FROM "{table}" WHERE "{column}" IN :ids ORDER BY id').bindparams(
        bindparam("ids", expanding=True)
    )
    return [dict(r) for r in session.execute(query, {"ids": ids}).mappings()]


def snapshot(session: Session, subject_id: int) -> dict:
    """Every column of the rows this rewrite can touch, for an exact restore."""
    topics = _rows(session, "programmingtopic", "subject_id", [subject_id])
    cards = _rows(session, "programmingflashcard", "subject_id", [subject_id])
    data = {
        "programmingsubject": _rows(session, "programmingsubject", "id", [subject_id]),
        "programmingtopic": topics,
        "programmingquestion": _rows(session, "programmingquestion", "subject_id", [subject_id]),
        "programmingflashcard": cards,
        "codingreviewitem": _rows(session, "codingreviewitem", "flashcard_id", [c["id"] for c in cards]),
    }
    return json.loads(json.dumps(data, ensure_ascii=False, default=lambda v: v.isoformat() if isinstance(v, (date, datetime)) else str(v)))


def _locate_subject(session: Session, email: str, child_name: str, subject_id: int) -> m.ProgrammingSubject:
    user = session.exec(select(m.User).where(m.User.email == email)).one_or_none()
    if user is None:
        raise RewriteError("Requested account not found")
    child = session.exec(
        select(m.ChildProfile).where(m.ChildProfile.user_id == user.id, m.ChildProfile.name == child_name)
    ).one_or_none()
    subject = session.exec(
        select(m.ProgrammingSubject).where(m.ProgrammingSubject.id == subject_id).with_for_update()
    ).one_or_none()
    if child is None or subject is None or subject.child_id != child.id or subject.name != SUBJECT_NAME:
        raise RewriteError("Subject does not belong to the expected account/profile or was renamed")
    return subject


def _guard_progress(session: Session, subject_id: int, allow_reset: bool) -> dict:
    answered = session.exec(
        select(m.ProgrammingQuestion).where(
            m.ProgrammingQuestion.subject_id == subject_id, m.ProgrammingQuestion.attempt_count > 0
        )
    ).all()
    card_ids = session.exec(select(m.ProgrammingFlashcard.id).where(m.ProgrammingFlashcard.subject_id == subject_id)).all()
    reviewed = session.exec(
        select(m.CodingReviewItem).where(
            m.CodingReviewItem.flashcard_id.in_(card_ids or [-1]),
            (m.CodingReviewItem.reps > 0) | (m.CodingReviewItem.attempt_count > 0),
        )
    ).all()
    found = {"answered_questions": len(answered), "reviewed_cards": len(reviewed)}
    if (answered or reviewed) and not allow_reset:
        raise RewriteError(f"Course has study progress {found}; rerun with --allow-progress-reset to discard it")
    return found


def _reset_question(row: m.ProgrammingQuestion) -> None:
    row.attempt_count = 0
    row.correct_count = 0
    row.error_count = 0
    row.last_selected_option = None
    row.last_answered_at = None


def _reset_review(item: m.CodingReviewItem, now: datetime) -> None:
    for field, value in (
        ("difficulty_score", 0.5), ("attempt_count", 0), ("correct_count", 0), ("error_count", 0),
        ("streak", 0), ("last_reviewed", None), ("next_review", now), ("fsrs_state", "new"),
        ("stability", 0.0), ("fsrs_difficulty", 0.0), ("reps", 0), ("lapses", 0),
        ("learning_step", 0), ("scheduled_days", 0), ("last_rating", None),
        ("suspended", False), ("is_leech", False),
    ):
        setattr(item, field, value)


def rewrite_course(
    session: Session,
    lessons: list[Lesson],
    *,
    email: str = TARGET_EMAIL,
    child_name: str = TARGET_CHILD,
    subject_id: int = SUBJECT_ID,
    allow_progress_reset: bool = False,
) -> dict:
    subject = _locate_subject(session, email, child_name, subject_id)
    digest = catalog_hash(lessons)
    context = json.loads(subject.context or "{}")
    if context.get("revision") == REVISION and context.get("catalog_sha256") == digest:
        return {"subject_id": subject_id, "status": "already_current", "catalog_sha256": digest}
    if context.get("revision") not in {PREVIOUS_REVISION, REVISION}:
        raise RewriteError(f"Unexpected course revision {context.get('revision')!r}")
    progress = _guard_progress(session, subject_id, allow_progress_reset)

    now = datetime.utcnow()
    topics = session.exec(
        select(m.ProgrammingTopic)
        .where(m.ProgrammingTopic.subject_id == subject_id)
        .order_by(m.ProgrammingTopic.order_index, m.ProgrammingTopic.id)
        .with_for_update()
    ).all()
    if len(topics) > len(lessons):
        raise RewriteError("The course has more topics than the catalog; refusing to orphan them")

    report = {"topics_updated": 0, "topics_created": 0, "questions_updated": 0, "questions_created": 0,
              "flashcards_updated": 0, "flashcards_created": 0, "review_items_reset": 0, "review_items_created": 0}
    for index, lesson in enumerate(lessons):
        content = lesson.ai_content()
        if index < len(topics):
            topic = topics[index]
            report["topics_updated"] += 1
        else:
            topic = m.ProgrammingTopic(subject_id=subject_id, title=lesson.title, created_at=now)
            report["topics_created"] += 1
        topic.title = lesson.title
        topic.order_index = index
        topic.ai_content = content
        topic.status = m.TopicStatus.not_started
        topic.summary = None
        topic.summary_updated_at = None
        topic.updated_at = now
        session.add(topic)
        session.flush()

        validated = validate_programming_question_batch(lesson.quiz, expected_count=len(lesson.quiz), existing_questions=[])
        rows = session.exec(
            select(m.ProgrammingQuestion).where(m.ProgrammingQuestion.topic_id == topic.id).order_by(m.ProgrammingQuestion.id)
        ).all()
        if len(rows) > len(validated):
            raise RewriteError(f"Topic {topic.id} has more questions than the lesson")
        if {r.question_key for r in rows} & {q.question_key for q in validated}:
            raise RewriteError(f"Topic {topic.id} would reuse a question key in place")
        for position, question in enumerate(validated):
            row = rows[position] if position < len(rows) else m.ProgrammingQuestion(
                topic_id=topic.id, subject_id=subject_id, child_id=subject.child_id, created_at=now
            )
            report["questions_updated" if position < len(rows) else "questions_created"] += 1
            row.question = question.question
            row.question_key = question.question_key
            row.options = question.options
            row.correct_option = question.correct_option
            row.explanation = question.explanation
            _reset_question(row)
            session.add(row)
        session.flush()

        cards = session.exec(
            select(m.ProgrammingFlashcard).where(m.ProgrammingFlashcard.topic_id == topic.id).order_by(m.ProgrammingFlashcard.id)
        ).all()
        if len(cards) > len(lesson.flashcards):
            raise RewriteError(f"Topic {topic.id} has more flashcards than the lesson")
        for position, draft in enumerate(lesson.flashcards):
            card = cards[position] if position < len(cards) else m.ProgrammingFlashcard(
                topic_id=topic.id, subject_id=subject_id, child_id=subject.child_id, created_at=now
            )
            report["flashcards_updated" if position < len(cards) else "flashcards_created"] += 1
            card.front = draft["front"]
            card.back = draft["back"]
            card.code_example = draft["code_example"]
            session.add(card)
            session.flush()
            items = session.exec(select(m.CodingReviewItem).where(m.CodingReviewItem.flashcard_id == card.id)).all()
            for item in items:
                _reset_review(item, now)
                session.add(item)
                report["review_items_reset"] += 1
            if not items:
                seed_coding_review_item(session, subject.child_id, card.id or 0)
                report["review_items_created"] += 1

    subject.description = DESCRIPTION
    subject.context = json.dumps(
        {"revision": REVISION, "catalog_sha256": digest, "previous_revision": context.get("revision"),
         "source_subject_id": context.get("source_subject_id"), "lessons": len(lessons)},
        ensure_ascii=False,
    )
    session.add(subject)
    session.flush()
    return {"subject_id": subject_id, "status": "rewritten", "catalog_sha256": digest,
            "progress_found": progress, **report}


def _engine(env_file: Path, url_key: str):
    url = make_url((dotenv_values(env_file, interpolate=False).get(url_key) or "").strip())
    if url.get_backend_name() != "postgresql":
        raise RewriteError("Expected a PostgreSQL URL")
    if (url.host or "").endswith(".pooler.supabase.com"):
        url = url.set(port=5432)  # session mode: one transaction, with row locks
    return create_engine(url, poolclass=NullPool, connect_args={
        "connect_timeout": 10,
        "options": "-c statement_timeout=120000 -c lock_timeout=15000 -c application_name=dva-c02-v3-rewrite",
    })


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--url-key", default="DATABASE_URL")
    parser.add_argument("--backup", type=Path, required=True, help="where to write the before-snapshot (must not exist)")
    parser.add_argument("--apply", action="store_true", help="commit; without it the transaction is rolled back")
    parser.add_argument("--allow-progress-reset", action="store_true")
    args = parser.parse_args()
    if args.backup.exists():
        parser.error("The backup path already exists; choose a new one")

    lessons = validated_catalog()
    engine = _engine(args.env_file, args.url_key)
    try:
        with Session(engine) as session:
            before = snapshot(session, SUBJECT_ID)
            args.backup.parent.mkdir(parents=True, exist_ok=True)
            with args.backup.open("x", encoding="utf-8") as f:
                json.dump(before, f, ensure_ascii=False, indent=1)
            report = rewrite_course(session, lessons, allow_progress_reset=args.allow_progress_reset)
            report["backup"] = str(args.backup)
            report["timestamp_utc"] = datetime.now(timezone.utc).isoformat()
            if args.apply and report["status"] == "rewritten":
                session.commit()
                report["mode"] = "committed"
            else:
                session.rollback()
                report["mode"] = "dry_run_rolled_back" if not args.apply else "nothing_to_do"
            print(json.dumps(report, ensure_ascii=False, indent=1))
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except RewriteError as error:
        print("Rewrite stopped:", error)
        raise SystemExit(1) from None
