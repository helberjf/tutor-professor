from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session, select


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"

import sys

sys.path.insert(0, str(API))
sys.path.insert(0, str(ROOT))

import models.database  # noqa: F401  # Register all SQLModel tables.
from models.database import (
    ChildProfile,
    CodingReviewItem,
    ProgrammingFlashcard,
    ProgrammingSubject,
    ProgrammingTopic,
    User,
)

from scripts import seed_helber_coding_courses as seed


REQUIRED_SUBJECTS = {
    "prova Aws cloud practitioner",
    "React",
    "Vite",
    "cybersecurity para saas",
    "load balancer",
    "GitHub actions",
    "perguntas de entrevista",
    "system design",
    "microservices",
    "mensageira para entrevistas",
}


class HelberCodingCourseSeedTests(unittest.TestCase):
    def make_session(self) -> tuple[Session, object]:
        tmp_dir = Path(tempfile.mkdtemp(prefix="helber-coding-seed-"))
        db_path = tmp_dir / "test.sqlite"
        engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(engine)
        session = Session(engine)
        return session, engine

    def create_target_user(self, session: Session) -> ChildProfile:
        user = User(
            first_name="Helber",
            last_name="JF",
            email="helberjf@gmail.com",
            cpf_hash="cpf-test",
            password_hash="hash-test",
        )
        session.add(user)
        session.flush()
        child = ChildProfile(user_id=user.id, name="Henrique", age_group="7-9")
        session.add(child)
        session.commit()
        session.refresh(child)
        return child

    def test_catalog_includes_requested_subjects_with_aws_as_largest_course(self) -> None:
        catalog = seed.get_course_catalog()

        self.assertTrue(REQUIRED_SUBJECTS.issubset({course.name for course in catalog}))
        aws_course = next(course for course in catalog if course.name == "prova Aws cloud practitioner")
        other_lengths = [len(course.topics) for course in catalog if course.name != aws_course.name]

        self.assertGreaterEqual(len(aws_course.topics), 24)
        self.assertGreater(len(aws_course.topics), max(other_lengths))

        for course in catalog:
            self.assertGreaterEqual(len(course.topics), 8, course.name)
            for topic in course.topics:
                content = seed.build_topic_content(course, topic)
                self.assertGreaterEqual(len(content["sections"]), 3, topic.title)
                self.assertGreaterEqual(len(content["quiz"]), 3, topic.title)
                self.assertGreaterEqual(len(content["flashcards"]), 4, topic.title)

    def test_seed_is_idempotent_and_preserves_existing_topic_state(self) -> None:
        session, _engine = self.make_session()
        try:
            child = self.create_target_user(session)
            react = ProgrammingSubject(
                child_id=child.id or 0,
                name="React",
                description="Manual subject",
            )
            session.add(react)
            session.flush()
            existing_topic = ProgrammingTopic(
                subject_id=react.id or 0,
                title="useState e useEffect",
                order_index=0,
                status="studied",
                notes="nao sobrescrever minhas notas",
            )
            session.add(existing_topic)
            session.commit()

            first = seed.seed_courses(session, email="helberjf@gmail.com", child_name="Henrique")
            second = seed.seed_courses(session, email="helberjf@gmail.com", child_name="Henrique")

            self.assertGreater(first.topics_created + first.topics_updated, 0)
            self.assertEqual(second.subjects_created, 0)
            self.assertEqual(second.topics_created, 0)
            self.assertEqual(second.flashcards_created, 0)

            subjects = session.exec(
                select(ProgrammingSubject).where(ProgrammingSubject.child_id == child.id)
            ).all()
            subject_names = [subject.name for subject in subjects]
            self.assertTrue(REQUIRED_SUBJECTS.issubset(set(subject_names)))
            self.assertEqual(len(subject_names), len(set(name.casefold() for name in subject_names)))

            aws_subject = next(subject for subject in subjects if subject.name == "prova Aws cloud practitioner")
            aws_topics = session.exec(
                select(ProgrammingTopic).where(ProgrammingTopic.subject_id == aws_subject.id)
            ).all()
            self.assertGreaterEqual(len(aws_topics), 24)

            preserved = session.exec(
                select(ProgrammingTopic).where(
                    ProgrammingTopic.subject_id == react.id,
                    ProgrammingTopic.title == "useState e useEffect",
                )
            ).one()
            self.assertEqual(preserved.status, "studied")
            self.assertEqual(preserved.notes, "nao sobrescrever minhas notas")
            self.assertIsNotNone(preserved.ai_content)

            all_topics = session.exec(select(ProgrammingTopic)).all()
            self.assertGreaterEqual(len(all_topics), 120)
            for topic in all_topics:
                self.assertTrue(topic.ai_content and topic.ai_content.get("sections"), topic.title)
                flashcards = session.exec(
                    select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)
                ).all()
                self.assertGreaterEqual(len(flashcards), 4, topic.title)
                fronts = [card.front.casefold().strip() for card in flashcards]
                self.assertEqual(len(fronts), len(set(fronts)), topic.title)

            review_items = session.exec(select(CodingReviewItem)).all()
            review_keys = [(item.child_id, item.flashcard_id) for item in review_items]
            self.assertEqual(len(review_keys), len(set(review_keys)))
        finally:
            session.close()


if __name__ == "__main__":
    unittest.main()

