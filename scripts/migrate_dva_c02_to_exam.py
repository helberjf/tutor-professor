"""Move the seeded DVA-C02 simulado topics into the exam mode.

The three `DVA-C02 - Simulado N` topics were always simulados wearing a topic's
clothes. Each one becomes an `Exam` with its own question pool, and the topic
plus its `ProgrammingQuestion` rows are removed so the same content stops
appearing in the questions mode.

    python scripts/migrate_dva_c02_to_exam.py --dry-run
    python scripts/migrate_dva_c02_to_exam.py
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from sqlmodel import Session, select


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
sys.path.insert(0, str(API))
sys.path.insert(0, str(ROOT / "scripts"))

import models.database  # noqa: F401,E402  # Register SQLModel tables.
from models.database import (  # noqa: E402
    Exam,
    ExamQuestion,
    ProgrammingFlashcard,
    ProgrammingQuestion,
    ProgrammingSubject,
    ProgrammingTopic,
)
from services.coding_service import programming_question_key  # noqa: E402
from services.exam_service import (  # noqa: E402
    DEFAULT_DOMAIN,
    duration_minutes_for,
    normalize_domains,
)

from dva_c02_question_bank import DOMAIN_WEIGHTS, EXAMS  # noqa: E402
from seed_dva_c02_questions import (  # noqa: E402
    SeedError,
    find_child,
    load_local_secrets,
    normalize,
)

EXAM_CODE = "DVA-C02"
SUBJECT_FRAGMENT = "dva-c02"


def is_simulado_title(title: str) -> bool:
    """A topic that is really a simulado.

    Study topics in this subject are named after what they teach ("AWS Lambda e
    Serverless Computing"), so the word only appears on the ones that were
    always exams. Matching is accent and case insensitive.
    """
    return "simulado" in normalize(title)


@dataclass
class MigrationResult:
    exams_created: int = 0
    questions_moved: int = 0
    topics_removed: int = 0
    topics_kept_for_flashcards: int = 0
    questions_skipped: int = 0
    broken_questions_removed: int = 0
    notes: list[str] = field(default_factory=list)


def blueprint() -> list[dict]:
    return normalize_domains(
        [{"name": name, "weight": weight} for name, weight in DOMAIN_WEIGHTS.items()]
    )


def find_subject(session: Session, child_id: int) -> ProgrammingSubject:
    subjects = session.exec(
        select(ProgrammingSubject).where(ProgrammingSubject.child_id == child_id)
    ).all()
    for subject in subjects:
        if SUBJECT_FRAGMENT in normalize(subject.name):
            return subject
    raise SeedError(f"No subject matching {SUBJECT_FRAGMENT!r} for this child.")


def domains_by_question_key() -> dict[str, str]:
    """The bank already tags every question with its blueprint domain."""
    return {
        programming_question_key(question.question): question.domain
        for exam in EXAMS
        for question in exam.questions
    }


def remove_broken_questions(
    session: Session, *, subject_id: int, result: MigrationResult
) -> None:
    """Drop questions whose options are bare letters.

    They come from a generation that predates the complete-option rule, and every
    screen already filters them out, so they are invisible rows taking up space.
    """
    questions = session.exec(
        select(ProgrammingQuestion).where(ProgrammingQuestion.subject_id == subject_id)
    ).all()
    for question in questions:
        options = [" ".join(str(option or "").split()) for option in list(question.options or [])]
        label_only = [option for option in options if len(option) <= 2]
        if len(options) != 4 or len(label_only) >= 2:
            session.delete(question)
            result.broken_questions_removed += 1


def migrate(session: Session, *, email: str, child_name: str) -> MigrationResult:
    result = MigrationResult()
    child = find_child(session, email, child_name)
    child_id = child.id or 0
    subject = find_subject(session, child_id)
    domains = blueprint()
    domain_for_key = domains_by_question_key()

    topics = session.exec(
        select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject.id)
    ).all()

    for spec in EXAMS:
        target = normalize(spec.title)
        topic = next((item for item in topics if normalize(item.title) == target), None)

        existing_exam = session.exec(
            select(Exam).where(Exam.child_id == child_id, Exam.name == spec.title)
        ).first()
        if existing_exam is not None:
            result.notes.append(f"{spec.title}: exam already exists, skipping")
            if topic is not None:
                # A previous run created the exam but did not finish the cleanup.
                _remove_topic(session, topic, result)
            continue

        if topic is None:
            result.notes.append(f"{spec.title}: topic not found, nothing to move")
            continue

        questions = session.exec(
            select(ProgrammingQuestion)
            .where(ProgrammingQuestion.topic_id == topic.id)
            .order_by(ProgrammingQuestion.id)
        ).all()
        if not questions:
            result.notes.append(f"{spec.title}: topic has no questions, nothing to move")
            continue

        exam = Exam(
            child_id=child_id,
            subject_id=subject.id,
            code=EXAM_CODE,
            name=spec.title,
            question_count=len(questions),
            duration_minutes=duration_minutes_for(len(questions)),
            passing_percent=72,
            domains=domains,
        )
        session.add(exam)
        session.flush()
        result.exams_created += 1

        seen_keys: set[str] = set()
        for question in questions:
            key = question.question_key or programming_question_key(question.question)
            if key in seen_keys:
                result.questions_skipped += 1
                continue
            seen_keys.add(key)
            session.add(
                ExamQuestion(
                    exam_id=exam.id or 0,
                    domain=domain_for_key.get(key, "Development with AWS Services"),
                    question=question.question,
                    question_key=key,
                    options=list(question.options or []),
                    correct_options=[question.correct_option],
                    response_type="single",
                    explanation=question.explanation,
                    difficulty="medium",
                    created_at=question.created_at or datetime.utcnow(),
                )
            )
            result.questions_moved += 1

        _remove_topic(session, topic, result)

    # Any other topic that is a simulado wearing a topic's clothes moves too.
    # The curated three carry the official blueprint; these carry none, which is
    # what a general simulado wants: one pool, shuffled, no per-domain quota.
    for topic in list(topics):
        if not is_simulado_title(topic.title):
            continue
        if any(normalize(spec.title) == normalize(topic.title) for spec in EXAMS):
            continue  # already handled above
        if session.exec(
            select(Exam).where(Exam.child_id == child_id, Exam.name == topic.title)
        ).first() is not None:
            result.notes.append(f"{topic.title}: exam already exists, skipping")
            _remove_topic(session, topic, result)
            continue

        questions = session.exec(
            select(ProgrammingQuestion)
            .where(ProgrammingQuestion.topic_id == topic.id)
            .order_by(ProgrammingQuestion.id)
        ).all()
        if not questions:
            result.notes.append(f"{topic.title}: no questions, left as a topic")
            continue

        exam = Exam(
            child_id=child_id,
            subject_id=subject.id,
            code=EXAM_CODE,
            name=topic.title[:200],
            question_count=len(questions),
            duration_minutes=duration_minutes_for(len(questions)),
            passing_percent=72,
            domains=[],
        )
        session.add(exam)
        session.flush()
        result.exams_created += 1

        seen: set[str] = set()
        for question in questions:
            key = question.question_key or programming_question_key(question.question)
            if key in seen:
                result.questions_skipped += 1
                continue
            seen.add(key)
            session.add(
                ExamQuestion(
                    exam_id=exam.id or 0,
                    domain=DEFAULT_DOMAIN,
                    question=question.question,
                    question_key=key,
                    options=list(question.options or []),
                    correct_options=[question.correct_option],
                    response_type="single",
                    explanation=question.explanation,
                    difficulty="medium",
                    created_at=question.created_at or datetime.utcnow(),
                )
            )
            result.questions_moved += 1

        _remove_topic(session, topic, result)

    remove_broken_questions(session, subject_id=subject.id or 0, result=result)
    return result


def _remove_topic(session: Session, topic: ProgrammingTopic, result: MigrationResult) -> None:
    """Drop the topic once its questions have moved, unless it holds flashcards.

    A simulado topic that also carries flashcards is still study material, and
    deleting it would take those with it. In that case the questions leave — which
    is the whole point — and the topic stays behind holding its cards.
    """
    leftovers = session.exec(
        select(ProgrammingQuestion).where(ProgrammingQuestion.topic_id == topic.id)
    ).all()
    for question in leftovers:
        session.delete(question)

    flashcards = session.exec(
        select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)
    ).all()
    if flashcards:
        session.flush()
        result.topics_kept_for_flashcards += 1
        result.notes.append(
            f"{topic.title}: kept as a topic, it still holds {len(flashcards)} flashcards"
        )
        return

    session.delete(topic)
    result.topics_removed += 1


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Move the seeded DVA-C02 simulado topics into the exam tables."
    )
    parser.add_argument("--email", default="helberjf@gmail.com")
    parser.add_argument("--child", default="Henrique")
    parser.add_argument("--dry-run", action="store_true", help="Report without committing.")
    args = parser.parse_args()

    load_local_secrets()
    os.environ.setdefault("APP_ENV", "development")
    from main import engine  # noqa: E402  # Imported late so secrets load first.

    with Session(engine) as session:
        result = migrate(session, email=args.email, child_name=args.child)
        if args.dry_run:
            session.rollback()
        else:
            session.commit()

    for note in result.notes:
        print(f"  note: {note}")
    print(
        ("Dry run, nothing written: " if args.dry_run else "Migration complete: ")
        + f"exams_created={result.exams_created} "
        + f"questions_moved={result.questions_moved} "
        + f"topics_removed={result.topics_removed} "
        + f"topics_kept_for_flashcards={result.topics_kept_for_flashcards} "
        + f"questions_skipped={result.questions_skipped} "
        + f"broken_questions_removed={result.broken_questions_removed}"
    )


if __name__ == "__main__":
    main()
