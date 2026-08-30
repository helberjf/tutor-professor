"""Seed the curated DVA-C02 simulados into the programming curriculum.

Each simulado in ``dva_c02_question_bank`` becomes a ProgrammingTopic, and its
questions become ProgrammingQuestion rows — the same records the AI generation
path creates, so the existing "Modo questões / Fazer simulado" screen runs them
with no change.

The script is idempotent: questions already stored for a topic (matched by the
same question_key the app uses) are left alone, so re-running only adds what is
missing.

    python scripts/seed_dva_c02_questions.py --child Henrique
    python scripts/seed_dva_c02_questions.py --subject AWS --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlmodel import Session, select


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
sys.path.insert(0, str(API))
sys.path.insert(0, str(ROOT / "scripts"))

import models.database  # noqa: F401,E402  # Register SQLModel tables.
from models.database import (  # noqa: E402
    ChildProfile,
    ProgrammingQuestion,
    ProgrammingSubject,
    ProgrammingTopic,
    User,
)
from services.coding_service import (  # noqa: E402
    programming_question_key,
    validate_programming_question_batch,
)

from dva_c02_question_bank import EXAMS, Exam  # noqa: E402

TARGET_EMAIL = "helberjf@gmail.com"
TARGET_CHILD = "Henrique"
# Matched as a fragment, so the full subject title does not have to be retyped.
DEFAULT_SUBJECT = "Simulado DVA-C02"
SUBJECT_DESCRIPTION = "Certificacao DVA-C02"
SUBJECT_ICON = "☁️"


class SeedError(RuntimeError):
    pass


@dataclass
class SeedResult:
    subjects_created: int = 0
    topics_created: int = 0
    questions_created: int = 0
    questions_skipped: int = 0
    subject_name: str = ""
    subject_created: bool = False


def normalize(value: str) -> str:
    stripped = unicodedata.normalize("NFD", value)
    without_marks = "".join(ch for ch in stripped if unicodedata.category(ch) != "Mn")
    return " ".join(without_marks.split()).casefold()


def load_local_secrets() -> None:
    secrets_path = ROOT / "local.secrets"
    if not secrets_path.exists():
        return
    for raw_line in secrets_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def find_child(session: Session, email: str, child_name: str) -> ChildProfile:
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        raise SeedError(f"User not found: {email}")
    children = session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).all()
    target = normalize(child_name)
    for child in children:
        if normalize(child.name) == target:
            return child
    available = ", ".join(child.name for child in children) or "(none)"
    raise SeedError(f"Child not found for {email}: {child_name}. Available: {available}")


def find_or_create_subject(
    session: Session, *, child: ChildProfile, name: str, result: SeedResult
) -> ProgrammingSubject:
    """Resolve the subject that receives the simulados.

    Subject titles in this app can be long sentences, so an exact match is tried
    first and then a fragment match, which lets ``--subject "Simulado DVA-C02"``
    find a subject whose full title continues past that. An ambiguous fragment is
    an error rather than a guess: seeding into the wrong subject is not something
    the user can spot easily afterwards.
    """
    subjects = session.exec(
        select(ProgrammingSubject).where(ProgrammingSubject.child_id == child.id)
    ).all()
    target = normalize(name)

    for subject in subjects:
        if normalize(subject.name) == target:
            result.subject_name = subject.name
            return subject

    partial = [
        subject
        for subject in subjects
        if target in normalize(subject.name) or normalize(subject.name) in target
    ]
    if len(partial) > 1:
        titles = "; ".join(repr(subject.name) for subject in partial)
        raise SeedError(
            f"{name!r} matches more than one subject: {titles}. "
            "Re-run with --subject using the full title of the one you want."
        )
    if partial:
        result.subject_name = partial[0].name
        return partial[0]

    subject = ProgrammingSubject(
        child_id=child.id or 0,
        name=name,
        description=SUBJECT_DESCRIPTION,
        icon_emoji=SUBJECT_ICON,
    )
    session.add(subject)
    session.flush()
    result.subjects_created += 1
    result.subject_name = subject.name
    result.subject_created = True
    return subject


def find_or_create_topic(
    session: Session, *, subject: ProgrammingSubject, exam: Exam, result: SeedResult
) -> ProgrammingTopic:
    topics = session.exec(
        select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject.id)
    ).all()
    target = normalize(exam.title)
    for topic in topics:
        if normalize(topic.title) == target:
            return topic

    topic = ProgrammingTopic(
        subject_id=subject.id or 0,
        title=exam.title,
        order_index=len(topics),
        notes=exam.objective,
    )
    session.add(topic)
    session.flush()
    result.topics_created += 1
    return topic


def seed_exam(
    session: Session,
    *,
    child: ChildProfile,
    subject: ProgrammingSubject,
    exam: Exam,
    result: SeedResult,
) -> None:
    topic = find_or_create_topic(session, subject=subject, exam=exam, result=result)
    existing = session.exec(
        select(ProgrammingQuestion).where(ProgrammingQuestion.topic_id == topic.id)
    ).all()
    existing_keys = {question.question_key for question in existing}

    pending = [
        question
        for question in exam.questions
        if programming_question_key(question.question) not in existing_keys
    ]
    result.questions_skipped += len(exam.questions) - len(pending)
    if not pending:
        return

    # Run the curated batch through the same validator the AI path uses, so a
    # typo in the bank fails here instead of reaching the simulado screen.
    validate_programming_question_batch(
        [
            {
                "question": question.question,
                "options": list(question.options),
                "correct_option": question.correct_option,
                "explanation": question.explanation,
            }
            for question in pending
        ],
        expected_count=len(pending),
        existing_questions=[question.question for question in existing],
    )

    now = datetime.utcnow()
    for question in pending:
        session.add(
            ProgrammingQuestion(
                topic_id=topic.id or 0,
                subject_id=subject.id or 0,
                child_id=child.id or 0,
                question=question.question,
                question_key=programming_question_key(question.question),
                options=list(question.options),
                correct_option=question.correct_option,
                explanation=question.explanation,
                created_at=now,
            )
        )
        result.questions_created += 1


def seed(session: Session, *, email: str, child_name: str, subject_name: str) -> SeedResult:
    result = SeedResult()
    child = find_child(session, email, child_name)
    subject = find_or_create_subject(session, child=child, name=subject_name, result=result)
    for exam in EXAMS:
        seed_exam(session, child=child, subject=subject, exam=exam, result=result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the DVA-C02 simulados into the configured database.")
    parser.add_argument("--email", default=TARGET_EMAIL)
    parser.add_argument("--child", default=TARGET_CHILD)
    parser.add_argument("--subject", default=DEFAULT_SUBJECT, help="Programming subject that receives the simulados.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without committing.")
    args = parser.parse_args()

    load_local_secrets()
    os.environ.setdefault("APP_ENV", "development")
    from main import engine  # noqa: E402  # Imported late so secrets are loaded first.

    with Session(engine) as session:
        result = seed(session, email=args.email, child_name=args.child, subject_name=args.subject)
        if args.dry_run:
            session.rollback()
        else:
            session.commit()

    where = "WOULD CREATE new subject" if result.subject_created else "found existing subject"
    print(f"Subject: {where} {result.subject_name!r}")
    print(
        ("Dry run, nothing written: " if args.dry_run else "Seed complete: ")
        + f"subjects_created={result.subjects_created} "
        + f"topics_created={result.topics_created} "
        + f"questions_created={result.questions_created} "
        + f"questions_skipped={result.questions_skipped}"
    )
    if result.subject_created:
        print(
            "Check the subject line above before running without --dry-run: "
            "if the simulados belong in a subject you already have, re-run with "
            "--subject matching part of its title."
        )


if __name__ == "__main__":
    main()
