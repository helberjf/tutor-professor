"""The curated DVA-C02 question bank and its seeder."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
os.environ.setdefault("APP_ENV", "test")
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

import dva_c02_question_bank as bank  # noqa: E402
import seed_dva_c02_questions as seeder  # noqa: E402

# Same rule main.py uses to decide whether a stored question can be practised.
OPTION_LABEL_ONLY_RE = re.compile(r"^[A-Da-d][\).:\-]?$")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_bank_shape() -> None:
    questions = bank.all_questions()
    require(len(questions) >= 60, f"expected a substantial bank, got {len(questions)}")
    require(len({exam.title for exam in bank.EXAMS}) == len(bank.EXAMS), "exam titles must be unique")

    keys: dict[str, str] = {}
    for question in questions:
        require(len(question.options) == 4, f"question must have four options: {question.question}")
        require(0 <= question.correct < 4, f"correct index out of range: {question.question}")
        require(
            question.correct_option in question.options,
            f"correct option must be one of the options: {question.question}",
        )
        require(
            len({option.casefold().strip() for option in question.options}) == 4,
            f"options must be distinct: {question.question}",
        )
        for option in question.options:
            require(bool(option.strip()), f"option must not be blank: {question.question}")
            require(
                not OPTION_LABEL_ONLY_RE.fullmatch(option.strip()),
                f"option must be a complete answer, not a letter: {question.question}",
            )
        require(
            len(question.explanation.strip()) >= 40,
            f"explanation must actually explain: {question.question}",
        )
        require(
            question.explanation.strip() != question.correct_option.strip(),
            f"explanation must not merely restate the answer: {question.question}",
        )
        require(len(question.question) <= 1000, f"question exceeds the stored limit: {question.question}")
        require(len(question.explanation) <= 2000, f"explanation exceeds the stored limit: {question.question}")
        require(len(question.correct_option) <= 500, f"option exceeds the stored limit: {question.question}")

        key = programming_question_key(question.question)
        require(key not in keys, f"duplicate question across the bank: {question.question}")
        keys[key] = question.question

    require(
        len({question.correct for question in questions}) == 4,
        "the correct answer must not always sit in the same position",
    )


def test_domain_mix_tracks_the_official_blueprint() -> None:
    questions = bank.all_questions()
    counts = bank.domain_counts()
    require(set(counts) == set(bank.DOMAIN_WEIGHTS), "every domain must be represented")
    for domain, weight in bank.DOMAIN_WEIGHTS.items():
        share = counts[domain] / len(questions)
        require(
            abs(share - weight) <= 0.04,
            f"{domain} is {share:.0%} of the bank but the exam weighs it {weight:.0%}",
        )
    for exam in bank.EXAMS:
        domains = {question.domain for question in exam.questions}
        require(domains == set(bank.DOMAIN_WEIGHTS), f"{exam.title} must cover all four domains")


def test_bank_passes_the_app_validator() -> None:
    """The same contract the AI-generated batches must satisfy."""
    for exam in bank.EXAMS:
        payload = [
            {
                "question": question.question,
                "options": list(question.options),
                "correct_option": question.correct_option,
                "explanation": question.explanation,
            }
            for question in exam.questions
        ]
        validated = validate_programming_question_batch(
            payload, expected_count=len(payload), existing_questions=[]
        )
        require(len(validated) == len(exam.questions), f"{exam.title} must validate in full")


def _session_with_child() -> Session:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    user = User(
        first_name="Test",
        last_name="Parent",
        email="parent@example.test",
        cpf_hash="cpf-hash",
        password_hash="hash",
    )
    session.add(user)
    session.flush()
    session.add(ChildProfile(user_id=user.id, name="Henrique", age_group="10-12"))
    session.commit()
    return session


def test_seed_creates_subject_topics_and_questions() -> None:
    session = _session_with_child()
    try:
        result = seeder.seed(
            session, email="parent@example.test", child_name="Henrique", subject_name="AWS"
        )
        session.commit()

        require(result.subjects_created == 1, "the AWS subject must be created once")
        require(result.topics_created == len(bank.EXAMS), "each simulado must become a topic")
        require(
            result.questions_created == len(bank.all_questions()),
            "every question in the bank must be stored",
        )
        require(result.questions_skipped == 0, "a fresh database must skip nothing")

        topics = session.exec(select(ProgrammingTopic)).all()
        require(len(topics) == len(bank.EXAMS), "topic count must match the exam count")
        for topic in topics:
            stored = session.exec(
                select(ProgrammingQuestion).where(ProgrammingQuestion.topic_id == topic.id)
            ).all()
            require(len(stored) == 21, f"{topic.title} must hold its full simulado")
            for question in stored:
                require(len(list(question.options)) == 4, "stored question must keep four options")
                require(
                    question.correct_option in list(question.options),
                    "stored correct option must be one of the stored options",
                )
                require(bool(question.explanation.strip()), "stored question must keep its explanation")
    finally:
        session.close()


def test_seed_is_idempotent() -> None:
    session = _session_with_child()
    try:
        seeder.seed(session, email="parent@example.test", child_name="Henrique", subject_name="AWS")
        session.commit()
        second = seeder.seed(
            session, email="parent@example.test", child_name="Henrique", subject_name="AWS"
        )
        session.commit()

        require(second.subjects_created == 0, "re-running must not duplicate the subject")
        require(second.topics_created == 0, "re-running must not duplicate topics")
        require(second.questions_created == 0, "re-running must not duplicate questions")
        require(
            second.questions_skipped == len(bank.all_questions()),
            "re-running must recognise every stored question",
        )

        subjects = session.exec(select(ProgrammingSubject)).all()
        require(len(subjects) == 1, "only one AWS subject may exist")
        questions = session.exec(select(ProgrammingQuestion)).all()
        require(
            len(questions) == len(bank.all_questions()),
            "the stored question count must not grow on a second run",
        )
    finally:
        session.close()


def test_seed_finds_a_subject_by_fragment_of_its_title() -> None:
    """Subject titles here are long sentences, so the seeder must not need the whole one."""
    full_title = (
        "Simulado DVA-C02 — Estilo próximo da prova esse simulado "
        "além de ser um banco de questoes ensinará"
    )
    require(len(full_title) <= 100, "the stored subject name column holds at most 100 characters")

    session = _session_with_child()
    try:
        child = session.exec(select(ChildProfile)).first()
        session.add(ProgrammingSubject(child_id=child.id, name=full_title))
        session.commit()

        result = seeder.seed(
            session,
            email="parent@example.test",
            child_name="Henrique",
            subject_name="Simulado DVA-C02",
        )
        session.commit()

        require(result.subjects_created == 0, "an existing subject must be reused, not duplicated")
        require(result.subject_created is False, "the seeder must report that it found the subject")
        require(result.subject_name == full_title, "the resolved subject must be the existing one")
        require(len(session.exec(select(ProgrammingSubject)).all()) == 1, "no second subject may appear")
        require(
            result.questions_created == len(bank.all_questions()),
            "the questions must land in the existing subject",
        )
    finally:
        session.close()


def test_seed_refuses_an_ambiguous_subject_fragment() -> None:
    session = _session_with_child()
    try:
        child = session.exec(select(ChildProfile)).first()
        session.add(ProgrammingSubject(child_id=child.id, name="Simulado DVA-C02 parte 1"))
        session.add(ProgrammingSubject(child_id=child.id, name="Simulado DVA-C02 parte 2"))
        session.commit()

        try:
            seeder.seed(
                session,
                email="parent@example.test",
                child_name="Henrique",
                subject_name="Simulado DVA-C02",
            )
        except seeder.SeedError as error:
            require("parte 1" in str(error) and "parte 2" in str(error), "the error must list the candidates")
        else:
            raise AssertionError("an ambiguous fragment must fail instead of guessing a subject")
    finally:
        session.close()


def test_seed_reports_a_missing_child() -> None:
    session = _session_with_child()
    try:
        seeder.seed(session, email="parent@example.test", child_name="Ninguem", subject_name="AWS")
    except seeder.SeedError as error:
        require("Ninguem" in str(error), "the error must name the child that was not found")
    else:
        raise AssertionError("seeding for an unknown child must fail loudly")
    finally:
        session.close()


def main() -> None:
    for name, test in sorted(globals().items()):
        if name.startswith("test_") and callable(test):
            test()
    print("DVA-C02 question bank checks passed.")


if __name__ == "__main__":
    main()
