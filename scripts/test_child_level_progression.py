"""The child's level must rise with the number of questions answered.

Before this, the level formula only read QuizAttempt rows, so a child who
answered questions in the licao/revisao (which write ReviewItem, not
QuizAttempt) was capped at level 2 forever and the AI never left the BEGINNER
difficulty band. These checks pin the new behaviour:

  - every answered question counts, from any screen (licao, revisao, quiz, simulado);
  - accuracy only nudges the level by one, it never gates it;
  - a hand-picked level (level_override) wins and survives more answers.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-level-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'level.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "level-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "level@example.com"

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

import httpx  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402
from models.database import ChildProfile, ExamAttempt, QuizAttempt, ReviewItem  # noqa: E402


class AutomaticLadderTests(unittest.TestCase):
    """Pure-function checks on the questions-answered ladder."""

    def test_level_rises_monotonically_with_questions_answered(self) -> None:
        neutral_accuracy = 0.70  # between the penalty and bonus bands
        levels = [
            main.compute_automatic_child_level(answered, neutral_accuracy)
            for answered in (0, 20, 50, 100, 175, 275, 400, 550, 750, 1000)
        ]
        self.assertEqual(levels, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    def test_level_never_goes_backwards_as_answers_accumulate(self) -> None:
        previous = 0
        for answered in range(0, 1200, 7):
            level = main.compute_automatic_child_level(answered, 0.70)
            self.assertGreaterEqual(level, previous, f"level dropped at {answered} answers")
            previous = level

    def test_accuracy_only_nudges_by_one_level(self) -> None:
        weak = main.compute_automatic_child_level(300, 0.30)
        neutral = main.compute_automatic_child_level(300, 0.70)
        strong = main.compute_automatic_child_level(300, 0.95)
        self.assertEqual(neutral - weak, 1, "low accuracy should cost exactly one level")
        self.assertEqual(strong - neutral, 1, "high accuracy should add exactly one level")

    def test_accuracy_is_ignored_before_there_is_enough_signal(self) -> None:
        # Under the sample floor a perfect (or terrible) run must not move the level.
        for accuracy in (0.0, 1.0):
            self.assertEqual(main.compute_automatic_child_level(5, accuracy), 1)

    def test_level_stays_within_bounds(self) -> None:
        self.assertEqual(main.compute_automatic_child_level(0, 0.0), main.MIN_CHILD_LEVEL)
        self.assertEqual(main.compute_automatic_child_level(100_000, 1.0), main.MAX_CHILD_LEVEL)


class QuestionCountingTests(unittest.TestCase):
    """Every screen the child answers a question on must feed the level."""

    @classmethod
    def setUpClass(cls) -> None:
        main.on_startup()

    def _make_child(self, name: str) -> int:
        with Session(main.engine) as session:
            child = ChildProfile(name=name, age_group="7-9", target_language="English", current_level=1)
            session.add(child)
            session.commit()
            session.refresh(child)
            return child.id or 0

    def _level_of(self, child_id: int) -> int:
        with Session(main.engine) as session:
            child = session.get(ChildProfile, child_id)
            return main.compute_and_update_child_level(session=session, child=child)

    def test_review_answers_count_towards_the_level(self) -> None:
        """The licao mini-activity and revisao write ReviewItem rows — they must count."""
        child_id = self._make_child("review-only")
        self.assertEqual(self._level_of(child_id), 1)

        with Session(main.engine) as session:
            # 60 answered questions at 80% correct, spread over 12 words.
            for index in range(12):
                session.add(ReviewItem(
                    child_id=child_id, word_en=f"w{index}", word_pt=f"p{index}",
                    attempt_count=5, correct_count=4, error_count=1,
                ))
            session.commit()

        answered, correct = self._count(child_id)
        self.assertEqual((answered, correct), (60, 48))
        # 60 answers -> ladder level 3, accuracy 0.8 is neutral (no nudge).
        self.assertEqual(self._level_of(child_id), 3)

    def test_quiz_and_exam_answers_also_count(self) -> None:
        child_id = self._make_child("quiz-and-exam")
        with Session(main.engine) as session:
            session.add(QuizAttempt(child_id=child_id, lesson_id=None, score=8, total_questions=10))
            session.add(ExamAttempt(
                exam_id=1, child_id=child_id, status="finished",
                question_count=15, correct_count=12,
            ))
            # An unfinished sitting must not be counted.
            session.add(ExamAttempt(
                exam_id=1, child_id=child_id, status="in_progress",
                question_count=99, correct_count=99,
            ))
            session.commit()

        answered, correct = self._count(child_id)
        self.assertEqual((answered, correct), (25, 20), "unfinished exam should be excluded")

    def test_answering_a_lot_of_questions_climbs_past_the_old_level_2_cap(self) -> None:
        """The regression this whole change is about: no quiz, but the level still climbs."""
        child_id = self._make_child("no-quiz-grinder")
        with Session(main.engine) as session:
            for index in range(80):
                session.add(ReviewItem(
                    child_id=child_id, word_en=f"g{index}", word_pt=f"gp{index}",
                    attempt_count=10, correct_count=7, error_count=3,
                ))
            session.commit()

        answered, _ = self._count(child_id)
        self.assertEqual(answered, 800)
        level = self._level_of(child_id)
        self.assertGreater(level, 2, "a child who never opens /quiz must still pass level 2")
        self.assertEqual(level, 9)

    def test_falls_back_to_correct_error_split_when_attempt_count_is_missing(self) -> None:
        child_id = self._make_child("legacy-rows")
        with Session(main.engine) as session:
            session.add(ReviewItem(
                child_id=child_id, word_en="legacy", word_pt="legado",
                attempt_count=0, correct_count=6, error_count=4,
            ))
            session.commit()
        self.assertEqual(self._count(child_id), (10, 6))

    def _count(self, child_id: int) -> tuple[int, int]:
        with Session(main.engine) as session:
            return main.count_child_answered_questions(session=session, child_id=child_id)


class ManualLevelTests(unittest.TestCase):
    """The child can pin the level, and the automatic ladder must respect it."""

    @classmethod
    def setUpClass(cls) -> None:
        main.on_startup()

    def _make_child(self, name: str, **kwargs) -> int:
        with Session(main.engine) as session:
            child = ChildProfile(name=name, age_group="7-9", target_language="English", **kwargs)
            session.add(child)
            session.commit()
            session.refresh(child)
            return child.id or 0

    def test_pinned_level_wins_over_the_automatic_ladder(self) -> None:
        child_id = self._make_child("pinned", current_level=1, level_override=8)
        with Session(main.engine) as session:
            # Plenty of answers that would otherwise put the child at level 2.
            session.add(ReviewItem(
                child_id=child_id, word_en="x", word_pt="y",
                attempt_count=25, correct_count=20, error_count=5,
            ))
            session.commit()
            child = session.get(ChildProfile, child_id)
            self.assertEqual(main.compute_and_update_child_level(session=session, child=child), 8)

    def test_pinned_level_is_clamped_to_the_supported_range(self) -> None:
        for override, expected in ((99, main.MAX_CHILD_LEVEL), (-5, main.MIN_CHILD_LEVEL)):
            child_id = self._make_child(f"clamp-{override}", current_level=1, level_override=override)
            with Session(main.engine) as session:
                child = session.get(ChildProfile, child_id)
                self.assertEqual(main.compute_and_update_child_level(session=session, child=child), expected)

    def test_clearing_the_pin_returns_to_the_automatic_ladder(self) -> None:
        child_id = self._make_child("unpinned", current_level=1, level_override=10)
        with Session(main.engine) as session:
            session.add(ReviewItem(
                child_id=child_id, word_en="a", word_pt="b",
                attempt_count=60, correct_count=42, error_count=18,
            ))
            session.commit()
            child = session.get(ChildProfile, child_id)
            self.assertEqual(main.compute_and_update_child_level(session=session, child=child), 10)

            child.level_override = None
            session.add(child)
            session.commit()
            session.refresh(child)
            # 60 answers at 70% -> ladder level 3, no nudge.
            self.assertEqual(main.compute_and_update_child_level(session=session, child=child), 3)

    def test_pinned_level_is_persisted_onto_current_level(self) -> None:
        child_id = self._make_child("persisted", current_level=1, level_override=6)
        with Session(main.engine) as session:
            child = session.get(ChildProfile, child_id)
            main.compute_and_update_child_level(session=session, child=child)
        with Session(main.engine) as session:
            self.assertEqual(session.get(ChildProfile, child_id).current_level, 6)


class LevelEndpointTests(unittest.TestCase):
    """HTTP surface: PUT /api/child/level pins and unpins the level."""

    @classmethod
    def setUpClass(cls) -> None:
        main.on_startup()

    def test_put_level_pins_and_clears_the_manual_level(self) -> None:
        asyncio.run(self._run())

    async def _run(self) -> None:
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            registered = await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Nivel",
                    "email": "level@example.com",
                    "cpf": "52998224725",
                    "password": "Secret@123",
                    "child_name": "Lia",
                },
            )
            self.assertEqual(registered.status_code, 201, registered.text)
            login = await client.post(
                "/api/auth/login",
                json={"email": "level@example.com", "password": "Secret@123"},
            )
            self.assertEqual(login.status_code, 200, login.text)

            initial = await client.get("/api/child/level")
            self.assertEqual(initial.status_code, 200, initial.text)
            body = initial.json()
            self.assertFalse(body["is_manual_level"])
            self.assertEqual(body["level"], 1)
            self.assertEqual(body["questions_answered"], 0)
            self.assertEqual(body["min_level"], main.MIN_CHILD_LEVEL)
            self.assertEqual(body["max_level"], main.MAX_CHILD_LEVEL)
            self.assertEqual(len(body["level_labels"]), main.MAX_CHILD_LEVEL)

            pinned = await client.put("/api/child/level", json={"level": 7})
            self.assertEqual(pinned.status_code, 200, pinned.text)
            pinned_body = pinned.json()
            self.assertEqual(pinned_body["level"], 7)
            self.assertTrue(pinned_body["is_manual_level"])

            # The pin must survive a plain read.
            reread = await client.get("/api/child/level")
            self.assertEqual(reread.json()["level"], 7)
            self.assertTrue(reread.json()["is_manual_level"])

            out_of_range = await client.put("/api/child/level", json={"level": 99})
            self.assertEqual(out_of_range.status_code, 400, out_of_range.text)

            cleared = await client.put("/api/child/level", json={"level": None})
            self.assertEqual(cleared.status_code, 200, cleared.text)
            cleared_body = cleared.json()
            self.assertFalse(cleared_body["is_manual_level"])
            self.assertEqual(cleared_body["level"], 1, "back to the automatic ladder with no answers yet")


if __name__ == "__main__":
    unittest.main()
