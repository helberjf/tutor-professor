"""The DVA-C02 v3 rewrite keeps topic ids, never deletes rows and refuses to drop progress."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-dva-c02-v3-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'dva.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from sqlmodel import Session, SQLModel, create_engine, select  # noqa: E402

import models.database as m  # noqa: E402
import rewrite_dva_c02_v3 as rewrite  # noqa: E402

OLD_TOPICS = 28
OLD_PER_TOPIC = 8


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def build_course(path: Path):
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        user = m.User(first_name="H", last_name="S", email=rewrite.TARGET_EMAIL, cpf_hash="x", password_hash="x")
        session.add(user)
        session.flush()
        child = m.ChildProfile(user_id=user.id, name=rewrite.TARGET_CHILD, age_group="18+")
        session.add(child)
        session.flush()
        other = m.ProgrammingSubject(id=19, child_id=child.id, name="DVA-C02")
        subject = m.ProgrammingSubject(
            id=rewrite.SUBJECT_ID, child_id=child.id, name=rewrite.SUBJECT_NAME,
            context=json.dumps({"revision": rewrite.PREVIOUS_REVISION, "source_subject_id": 19}),
        )
        session.add_all([other, subject])
        session.flush()
        for subject_id in (19, rewrite.SUBJECT_ID):
            for t in range(OLD_TOPICS):
                topic = m.ProgrammingTopic(subject_id=subject_id, title=f"{t:02d}. antiga", order_index=t,
                                           status=m.TopicStatus.studied if t < 2 else m.TopicStatus.not_started,
                                           ai_content={"title": "antiga", "sections": [], "quiz": [], "flashcards": []})
                session.add(topic)
                session.flush()
                for n in range(OLD_PER_TOPIC):
                    session.add(m.ProgrammingQuestion(
                        topic_id=topic.id, subject_id=subject_id, child_id=child.id, question=f"antiga {t}-{n}?",
                        question_key=f"k{subject_id}-{t}-{n}", options=["a1", "b1", "c1", "d1"],
                        correct_option="a1", explanation="x"))
                    card = m.ProgrammingFlashcard(topic_id=topic.id, subject_id=subject_id, child_id=child.id,
                                                  front=f"f{t}-{n}", back="v")
                    session.add(card)
                    session.flush()
                    session.add(m.CodingReviewItem(flashcard_id=card.id, child_id=child.id))
        session.add(m.Exam(child_id=child.id, subject_id=rewrite.SUBJECT_ID, code="DVA-C02", name="Simulado 1"))
        session.commit()
    return engine


def test_catalog_quality() -> None:
    lessons = rewrite.validated_catalog()
    require(len(lessons) == 34, "the catalog must have 34 lessons")
    titles = [lesson.title for lesson in lessons]
    require(len(set(titles)) == len(titles), "lesson titles must be unique")
    rank, position = Counter(), Counter()
    for lesson in lessons:
        require(len(lesson.quiz) == 10 and len(lesson.flashcards) == 10, lesson.title)
        for q in lesson.quiz:
            by_length = sorted(range(4), key=lambda i: len(q["options"][i]))
            rank[by_length.index(q["options"].index(q["correct_option"]))] += 1
            position[q["options"].index(q["correct_option"])] += 1
            require(not re.search(r"(^|\s)[A-D]\. ", q["explanation"]), f"letter reference in {lesson.title}")
    total = sum(rank.values())
    # Test-wise readers should not be able to pick the answer by its length or place.
    require(max(rank.values()) / total < 0.6, f"answer length is a giveaway: {dict(rank)}")
    require(max(position.values()) / total < 0.35, f"answer position is a giveaway: {dict(position)}")


def test_rewrite_keeps_ids_and_adds_lessons() -> None:
    engine = build_course(TMP_DIR / "rewrite.sqlite")
    lessons = rewrite.validated_catalog()
    with Session(engine) as session:
        old_ids = [t.id for t in session.exec(select(m.ProgrammingTopic).where(
            m.ProgrammingTopic.subject_id == rewrite.SUBJECT_ID).order_by(m.ProgrammingTopic.order_index)).all()]
        untouched_before = rewrite.snapshot(session, 19)
        report = rewrite.rewrite_course(session, lessons)
        session.commit()
    require(report["topics_updated"] == OLD_TOPICS and report["topics_created"] == 6, str(report))
    require(report["questions_updated"] == OLD_TOPICS * OLD_PER_TOPIC, str(report))
    require(report["questions_created"] == 340 - OLD_TOPICS * OLD_PER_TOPIC, str(report))
    require(report["flashcards_created"] == report["review_items_created"] == 340 - OLD_TOPICS * OLD_PER_TOPIC, str(report))

    with Session(engine) as session:
        topics = session.exec(select(m.ProgrammingTopic).where(
            m.ProgrammingTopic.subject_id == rewrite.SUBJECT_ID).order_by(m.ProgrammingTopic.order_index)).all()
        require([t.id for t in topics[:OLD_TOPICS]] == old_ids, "existing topic ids must be kept")
        require([t.order_index for t in topics] == list(range(34)), "lessons must be ordered 0..33")
        require(all(t.status == m.TopicStatus.not_started for t in topics), "rewritten lessons start unstudied")
        for topic, lesson in zip(topics, lessons):
            require(topic.title == lesson.title and topic.ai_content == lesson.ai_content(), topic.title)
            questions = session.exec(select(m.ProgrammingQuestion).where(m.ProgrammingQuestion.topic_id == topic.id)).all()
            require(len(questions) == 10 and len({q.question_key for q in questions}) == 10, topic.title)
            require([q.correct_option for q in questions] == [q["correct_option"] for q in lesson.quiz], topic.title)
            cards = session.exec(select(m.ProgrammingFlashcard).where(m.ProgrammingFlashcard.topic_id == topic.id)).all()
            require(sorted(c.front for c in cards) == sorted(c["front"] for c in lesson.flashcards), topic.title)
        require(rewrite.snapshot(session, 19) == untouched_before, "other subjects must not change")
        require(len(session.exec(select(m.Exam)).all()) == 1, "simulados are not touched")
        context = json.loads(session.get(m.ProgrammingSubject, rewrite.SUBJECT_ID).context)
        require(context["revision"] == rewrite.REVISION and context["previous_revision"] == rewrite.PREVIOUS_REVISION, str(context))

        again = rewrite.rewrite_course(session, lessons)
        require(again["status"] == "already_current", "a second run must be a no-op")


def test_progress_is_protected() -> None:
    engine = build_course(TMP_DIR / "progress.sqlite")
    lessons = rewrite.validated_catalog()
    with Session(engine) as session:
        row = session.exec(select(m.ProgrammingQuestion).where(m.ProgrammingQuestion.subject_id == rewrite.SUBJECT_ID)).first()
        row.attempt_count = 1
        session.add(row)
        session.commit()
        try:
            rewrite.rewrite_course(session, lessons)
        except rewrite.RewriteError:
            session.rollback()
        else:
            raise AssertionError("progress must block the rewrite")
        report = rewrite.rewrite_course(session, lessons, allow_progress_reset=True)
        require(report["progress_found"]["answered_questions"] == 1, str(report))


def test_wrong_owner_is_refused() -> None:
    engine = build_course(TMP_DIR / "owner.sqlite")
    with Session(engine) as session:
        try:
            rewrite.rewrite_course(session, rewrite.validated_catalog(), email="outra@example.com")
        except rewrite.RewriteError:
            return
    raise AssertionError("another account must be refused")


if __name__ == "__main__":
    test_catalog_quality()
    test_rewrite_keeps_ids_and_adds_lessons()
    test_progress_is_protected()
    test_wrong_owner_is_refused()
    print("DVA-C02 v3 rewrite tests passed")
