"""Seed-content and level/language gating checks for apps/api/content/lessons/*.json.

Covers two things:
  1. The static JSON files themselves: valid structure, unique ids, and CEFR
     coverage (A1..C2) for every supported language.
  2. The real DB + list_accessible_lessons / get_current_lesson behaviour once
     that content is seeded: a lesson tagged with a level+language must only be
     visible to a child on that exact language and level, while the untagged
     English "day 1..5" intro pack stays visible to everyone (unchanged
     behaviour, preserved for backward compatibility).
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-lesson-seed-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'lessons.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "lesson-seed-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "lessonseed@example.com"

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from sqlmodel import Session  # noqa: E402

import main  # noqa: E402
from models.database import ChildProfile, Lesson, LessonItem  # noqa: E402

LESSONS_DIR = API_DIR / "content" / "lessons"

# CEFR levels this project seeds statically, mapped to the internal 1-10
# gamified level used by ChildProfile.current_level (see main.py's
# _LEVEL_LABELS / compute_and_update_child_level).
CEFR_TO_INTERNAL_LEVEL = {"A1": 1, "A2": 3, "B1": 5, "B2": 7, "C1": 9, "C2": 10}

# These 5 languages have a full, explicitly level-tagged A1..C2 ladder.
# English's "A1 slot" is instead covered by the older, untagged day-1..5
# intro pack (level=None -> visible to every level), so it's asserted
# separately rather than through CEFR_TO_INTERNAL_LEVEL.
FULL_LADDER_LANGUAGES = ["French", "Spanish", "German", "Italian", "Russian"]
ALL_TARGET_LANGUAGES = ["English", *FULL_LADDER_LANGUAGES]


def _load_seed_lessons() -> dict[Path, dict]:
    return {
        lesson_file: json.loads(lesson_file.read_text(encoding="utf-8"))
        for lesson_file in sorted(LESSONS_DIR.glob("*.json"))
    }


def _seed_all_lessons(session: Session, lessons_by_file: dict[Path, dict]) -> None:
    """Mirror scripts/init_db.py's create path against a fresh, empty database."""
    for data in lessons_by_file.values():
        lesson = Lesson(
            id=data.get("id"),
            title=data["title"],
            theme=data["theme"],
            objective=data["objective"],
            content=data.get("content", {}),
            child_id=None,
            level=data.get("level"),
            target_language=data.get("target_language", "English"),
        )
        session.add(lesson)
        session.commit()
        session.refresh(lesson)
        for item_data in data.get("items", []):
            session.add(LessonItem(
                word_en=item_data["word_en"],
                word_pt=item_data["word_pt"],
                example_sentence_en=item_data["example_sentence_en"],
                example_sentence_pt=item_data["example_sentence_pt"],
                lesson_id=lesson.id,
            ))
        session.commit()


class LessonSeedContentTests(unittest.TestCase):
    """File-level checks — no database involved."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.lessons_by_file = _load_seed_lessons()

    def test_every_lesson_file_is_valid_json_with_required_fields(self) -> None:
        required_top_level = {"id", "title", "theme", "objective", "content", "items"}
        for file, data in self.lessons_by_file.items():
            missing = required_top_level - data.keys()
            self.assertFalse(missing, f"{file.name} is missing keys: {missing}")

    def test_lesson_ids_are_unique(self) -> None:
        ids = [data["id"] for data in self.lessons_by_file.values()]
        self.assertEqual(len(ids), len(set(ids)), "duplicate lesson ids found in content/lessons/")

    def test_items_and_phrase_breakdowns_are_populated_and_aligned(self) -> None:
        for file, data in self.lessons_by_file.items():
            items = data.get("items", [])
            breakdowns = (data.get("content") or {}).get("phrase_breakdowns", [])
            self.assertTrue(items, f"{file.name} has no lesson items")
            self.assertEqual(
                len(items), len(breakdowns),
                f"{file.name}: items ({len(items)}) vs phrase_breakdowns ({len(breakdowns)}) count mismatch",
            )
            for item in items:
                for key in ("word_en", "word_pt", "example_sentence_en", "example_sentence_pt"):
                    self.assertTrue((item.get(key) or "").strip(), f"{file.name}: item missing {key}")

    def test_every_supported_language_has_seed_content(self) -> None:
        languages_present = {data.get("target_language", "English") for data in self.lessons_by_file.values()}
        for language in ALL_TARGET_LANGUAGES:
            self.assertIn(language, languages_present, f"no seed lesson found for target_language={language!r}")

    def test_full_ladder_languages_cover_every_cefr_anchor_level(self) -> None:
        expected_levels = set(CEFR_TO_INTERNAL_LEVEL.values())
        for language in FULL_LADDER_LANGUAGES:
            levels_for_language = {
                data.get("level")
                for data in self.lessons_by_file.values()
                if data.get("target_language") == language
            }
            self.assertEqual(
                levels_for_language, expected_levels,
                f"{language} should have one lesson per CEFR level {sorted(expected_levels)}, "
                f"found levels {sorted(levels_for_language)}",
            )


class LessonLevelLanguageGatingTests(unittest.TestCase):
    """End-to-end checks against the real DB models and main.list_accessible_lessons."""

    @classmethod
    def setUpClass(cls) -> None:
        main.on_startup()
        cls.lessons_by_file = _load_seed_lessons()
        with Session(main.engine) as session:
            _seed_all_lessons(session, cls.lessons_by_file)
        # (language, level) -> lesson id, derived straight from the seed content
        # so this test never hardcodes ids that could drift from content/lessons/.
        cls.lesson_id_by_language_level: dict[tuple[str, int], int] = {
            (data.get("target_language", "English"), data["level"]): data["id"]
            for data in cls.lessons_by_file.values()
            if data.get("level") is not None
        }

    def _make_child(self, *, target_language: str, current_level: int) -> ChildProfile:
        with Session(main.engine) as session:
            child = ChildProfile(
                name=f"Test-{target_language}-{current_level}",
                age_group="7-9",
                target_language=target_language,
                current_level=current_level,
            )
            session.add(child)
            session.commit()
            session.refresh(child)
            return child

    def test_full_ladder_language_get_current_lesson_matches_level(self) -> None:
        for language in FULL_LADDER_LANGUAGES:
            for cefr, level in CEFR_TO_INTERNAL_LEVEL.items():
                expected_id = self.lesson_id_by_language_level[(language, level)]
                child = self._make_child(target_language=language, current_level=level)
                with Session(main.engine) as session:
                    lesson = main.get_current_lesson(
                        session=session,
                        child_id=child.id or 0,
                        child_level=child.current_level,
                        target_language=child.target_language,
                    )
                self.assertIsNotNone(lesson, f"no lesson resolved for {language} at level {level} ({cefr})")
                self.assertEqual(
                    lesson.id, expected_id,
                    f"{language} level {level} ({cefr}) should resolve to lesson {expected_id}, got {lesson.id}",
                )

    def test_languages_never_leak_into_each_other(self) -> None:
        child = self._make_child(target_language="French", current_level=5)
        with Session(main.engine) as session:
            accessible = main.list_accessible_lessons(
                session=session, child_id=child.id or 0, child_level=child.current_level, target_language="French",
            )
        self.assertTrue(accessible, "expected at least one accessible French lesson")
        for lesson in accessible:
            self.assertEqual(lesson.target_language, "French", f"non-French lesson leaked in: {lesson.title}")

    def test_levels_never_leak_into_each_other_for_tagged_lessons(self) -> None:
        # A German learner at level 3 (A2) must not see the German B1/B2/C1/C2 lessons.
        child = self._make_child(target_language="German", current_level=3)
        with Session(main.engine) as session:
            accessible = main.list_accessible_lessons(
                session=session, child_id=child.id or 0, child_level=child.current_level, target_language="German",
            )
        levels_seen = {lesson.level for lesson in accessible if lesson.level is not None}
        self.assertEqual(levels_seen, {3}, f"expected only level-3 German content, saw levels {levels_seen}")

    def test_english_intro_pack_stays_visible_to_every_level(self) -> None:
        # The untagged "day 1..5" English lessons (level=None) must stay visible
        # to every level, exactly like before static lessons could carry a level.
        intro_ids = {
            data["id"] for data in self.lessons_by_file.values()
            if data.get("target_language", "English") == "English" and data.get("level") is None
        }
        self.assertEqual(intro_ids, {1, 2, 3, 4, 5}, "unexpected set of untagged English intro lessons")
        for level in (1, 2, 3, 5, 10):
            child = self._make_child(target_language="English", current_level=level)
            with Session(main.engine) as session:
                accessible = main.list_accessible_lessons(
                    session=session, child_id=child.id or 0, child_level=child.current_level, target_language="English",
                )
            visible_intro_ids = {lesson.id for lesson in accessible if lesson.id in intro_ids}
            self.assertEqual(visible_intro_ids, intro_ids, f"expected all 5 intro lessons visible at level {level}")

    def test_english_cefr_lessons_only_appear_at_their_own_level(self) -> None:
        # English's A2..C2 static seed (added alongside the day-1..5 pack) must
        # only surface for a child at the matching level.
        for cefr, level in CEFR_TO_INTERNAL_LEVEL.items():
            if cefr == "A1":
                continue  # English's A1 slot is the untagged day-pack, not a tagged lesson.
            expected_id = self.lesson_id_by_language_level[("English", level)]
            child = self._make_child(target_language="English", current_level=level)
            with Session(main.engine) as session:
                accessible_ids = {
                    lesson.id
                    for lesson in main.list_accessible_lessons(
                        session=session, child_id=child.id or 0, child_level=level, target_language="English",
                    )
                }
            self.assertIn(expected_id, accessible_ids, f"English {cefr} lesson should be visible at level {level}")

            other_level = next(v for k, v in CEFR_TO_INTERNAL_LEVEL.items() if k != cefr and v != 1)
            other_id = self.lesson_id_by_language_level[("English", other_level)]
            self.assertNotIn(
                other_id, accessible_ids,
                f"English lesson for level {other_level} should not leak into level {level}",
            )


if __name__ == "__main__":
    unittest.main()
