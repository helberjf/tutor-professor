"""Seeding must be safe against a database that is already in use.

The seed files used to pin lesson ids 1..40. Production had generated its own
lessons under those ids — 39 of them with student progress — and the seed looked
lessons up by id, so running it would have rewritten them into French and
Russian content and replaced their items. These checks run the real seed
against a production-shaped database and pin that it only ever adds.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-seed-safety-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'seed.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "seed-safety-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "seed-safety@example.com"

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from sqlalchemy import delete, func  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
import init_db  # noqa: E402
from models.database import (  # noqa: E402
    ChildLessonProgress,
    ChildProfile,
    Lesson,
    LessonItem,
    LessonQuestion,
)

PRODUCTION_LESSON_COUNT = 45  # what production held when this was written
QUIET = lambda _message: None  # noqa: E731


def seed_files() -> list[dict]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(init_db.LESSONS_DIR.glob("*.json"))]


def build_production_world(session: Session) -> int:
    """Lessons 1..5 identical to the intro files, 6..45 generated with progress."""
    for model in (ChildLessonProgress, LessonItem, LessonQuestion, Lesson):
        session.execute(delete(model))
    child = ChildProfile(name="Aluna real", age_group="7-9", target_language="English")
    session.add(child)
    session.flush()

    intro = {data["id"]: data for data in seed_files() if "id" in data}
    for lesson_id in range(1, PRODUCTION_LESSON_COUNT + 1):
        if lesson_id in intro:
            data = intro[lesson_id]
            session.add(Lesson(
                id=lesson_id, title=data["title"], theme=data["theme"], objective=data["objective"],
                content=data["content"], child_id=None, target_language="English",
            ))
            items = data["items"]
        else:
            session.add(Lesson(
                id=lesson_id, title=f"English de hoje - Dia {lesson_id}", theme="Frases do dia",
                objective="Aprenda 3 frases uteis em english hoje.",
                content={"generated_by": "gemini", "generated_level": 1}, child_id=None,
                target_language="English", level=1,
            ))
            items = [
                {"word_en": f"phrase {lesson_id}-{n}", "word_pt": f"frase {lesson_id}-{n}",
                 "example_sentence_en": "note", "example_sentence_pt": "nota"}
                for n in range(3)
            ]
        session.flush()
        for item in items:
            session.add(LessonItem(lesson_id=lesson_id, **item))
        if lesson_id != 8:
            session.add(ChildLessonProgress(child_id=child.id, lesson_id=lesson_id, is_completed=True))
    session.commit()
    return child.id or 0


def snapshot(session: Session) -> dict:
    lessons = {
        lesson.id: (lesson.title, lesson.theme, lesson.objective, lesson.content, lesson.level,
                    lesson.target_language, lesson.child_id, lesson.is_completed)
        for lesson in session.exec(select(Lesson).where(Lesson.id <= PRODUCTION_LESSON_COUNT)).all()
    }
    items = sorted(
        (item.lesson_id, item.word_en, item.word_pt)
        for item in session.exec(select(LessonItem).where(LessonItem.lesson_id <= PRODUCTION_LESSON_COUNT)).all()
    )
    progress = sorted(
        (row.child_id, row.lesson_id, row.is_completed)
        for row in session.exec(select(ChildLessonProgress)).all()
    )
    return {"lessons": lessons, "items": items, "progress": progress}


class ProductionShapedSeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        main.on_startup()
        cls.new_titles = [data["title"] for data in seed_files() if "id" not in data]

    def test_seed_only_adds_and_leaves_every_existing_lesson_alone(self) -> None:
        with Session(main.engine) as session:
            build_production_world(session)
            before = snapshot(session)

            report = init_db.seed_lessons(session, log=QUIET)
            session.commit()

            self.assertEqual(snapshot(session), before, "an existing lesson, item or progress row changed")
            self.assertEqual(report["updated"], [])
            self.assertEqual([lesson_id for lesson_id, _ in report["unchanged"]], [1, 2, 3, 4, 5])

            added_ids = [lesson_id for lesson_id, _ in report["added"]]
            expected_ids = list(range(PRODUCTION_LESSON_COUNT + 1, PRODUCTION_LESSON_COUNT + 1 + len(self.new_titles)))
            self.assertEqual(added_ids, expected_ids, "new lessons must take the ids after the last real one")
            stored = session.exec(select(Lesson.title).where(Lesson.id > PRODUCTION_LESSON_COUNT)).all()
            self.assertEqual(sorted(stored), sorted(self.new_titles))

    def test_new_lessons_follow_the_apps_own_id_allocation(self) -> None:
        with Session(main.engine) as session:
            build_production_world(session)
            init_db.seed_lessons(session, log=QUIET)
            session.commit()
            # The app names its next lesson after this id, so the day counter of
            # the next generated lesson jumps past the seeded block.
            expected = PRODUCTION_LESSON_COUNT + len(self.new_titles) + 1
            self.assertEqual(main.get_next_lesson_day(session), expected)

    def test_seeding_twice_changes_nothing_the_second_time(self) -> None:
        with Session(main.engine) as session:
            build_production_world(session)
            init_db.seed_lessons(session, log=QUIET)
            session.commit()
            count = session.exec(select(func.count(Lesson.id))).one()

            second = init_db.seed_lessons(session, log=QUIET)
            session.commit()

            self.assertEqual(second["added"], [])
            self.assertEqual(second["updated"], [])
            self.assertEqual(session.exec(select(func.count(Lesson.id))).one(), count)

    def test_a_file_claiming_a_taken_id_is_refused_and_writes_nothing(self) -> None:
        colliding_dir = Path(tempfile.mkdtemp(prefix="colliding-seed-", dir=TMP_DIR))
        french = next(data for data in seed_files() if data["title"] == "Frances de hoje - Nivel A1")
        (colliding_dir / "01_new_lesson.json").write_text(
            json.dumps({"id": 99, **{k: v for k, v in french.items() if k != "title"}, "title": "Primeira nova"}),
            encoding="utf-8",
        )
        (colliding_dir / "02_collides.json").write_text(json.dumps({"id": 6, **french}), encoding="utf-8")

        with Session(main.engine) as session:
            build_production_world(session)
            before = snapshot(session)
            count = session.exec(select(func.count(Lesson.id))).one()

            with self.assertRaises(init_db.SeedCollisionError):
                init_db.seed_lessons(session, colliding_dir, log=QUIET)
            session.rollback()

            self.assertEqual(snapshot(session), before)
            self.assertEqual(
                session.exec(select(func.count(Lesson.id))).one(), count,
                "the lesson staged before the refusal must not survive it",
            )

    def test_a_childs_private_lesson_is_never_adopted_by_title(self) -> None:
        with Session(main.engine) as session:
            child_id = build_production_world(session)
            private = Lesson(
                id=200, title="Frances de hoje - Nivel A1", theme="mine", objective="mine",
                content={}, child_id=child_id, target_language="French",
            )
            session.add(private)
            session.commit()

            init_db.seed_lessons(session, log=QUIET)
            session.commit()

            session.refresh(private)
            self.assertEqual((private.theme, private.child_id), ("mine", child_id))
            shared = session.exec(
                select(Lesson).where(Lesson.title == "Frances de hoje - Nivel A1", Lesson.child_id == None)  # noqa: E711
            ).all()
            self.assertEqual(len(shared), 1, "the shared seed lesson must be added alongside it")

    def test_dry_run_reports_the_same_plan_and_writes_nothing(self) -> None:
        with Session(main.engine) as session:
            build_production_world(session)
            before = snapshot(session)

        report = init_db.init_db(dry_run=True)

        with Session(main.engine) as session:
            self.assertEqual(snapshot(session), before)
            self.assertEqual(session.exec(select(func.count(Lesson.id))).one(), PRODUCTION_LESSON_COUNT)
        self.assertEqual(len(report["added"]), len(self.new_titles))
        self.assertEqual(report["added"][0][0], PRODUCTION_LESSON_COUNT + 1)
        self.assertEqual(report["updated"], [])


if __name__ == "__main__":
    unittest.main()
