"""The curated English pack has to be real content, not thirty filler files.

The pack is what the app falls back on when there is no AI key, no credit left,
or no provider answering, so these checks are about it being usable on its own:

  - the committed JSON matches the generator (a hand-edited file would be
    silently overwritten the next time anybody runs the builder);
  - every lesson carries eight complete phrases, with the word-by-word breakdown
    the lesson screen shows;
  - no phrase is repeated across the pack, because review items are keyed by the
    phrase and a duplicate would quietly merge two lessons' progress;
  - no file claims a lesson id, which is how a seed overwrites a real lesson;
  - each lesson yields a full offline question bank, which is the whole point of
    shipping curated content in the first place.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
LESSONS_DIR = API_DIR / "content" / "lessons"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from english_core_pack_data import LESSONS  # noqa: E402
from services.offline_question_service import (  # noqa: E402
    build_offline_choice_questions,
    build_offline_lesson_questions,
)

EXPECTED_LESSONS = 30
PHRASES_PER_LESSON = 8
EXPECTED_LEVELS = {1, 2, 3, 4}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load(slug: str) -> dict:
    path = LESSONS_DIR / f"{slug}.json"
    require(path.exists(), f"{path.name} is missing — run python scripts/build_english_core_pack.py")
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_files_match_the_generator() -> None:
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "build_english_core_pack.py"), "--check"],
        capture_output=True,
        text=True,
    )
    require(
        result.returncode == 0,
        f"the committed pack is out of date with its source: {result.stdout.strip()}",
    )


def test_pack_shape() -> None:
    require(len(LESSONS) == EXPECTED_LESSONS, f"expected {EXPECTED_LESSONS} lessons, found {len(LESSONS)}")
    levels = {entry["level"] for entry in LESSONS}
    require(levels == EXPECTED_LEVELS, f"levels should span {EXPECTED_LEVELS}, found {levels}")

    titles = Counter(entry["title"] for entry in LESSONS)
    duplicates = [title for title, count in titles.items() if count > 1]
    require(not duplicates, f"duplicate lesson titles: {duplicates}")

    # Enough at every level that a child is not pushed up the ladder by running
    # out of things to read.
    per_level = Counter(entry["level"] for entry in LESSONS)
    for level, count in sorted(per_level.items()):
        require(count >= 5, f"level {level} only has {count} lessons")


def test_every_phrase_is_complete_and_unique() -> None:
    seen: dict[str, str] = {}
    for entry in LESSONS:
        data = load(entry["slug"])
        require(
            "id" not in data,
            f"{entry['slug']} claims a lesson id; ids belong to the database",
        )
        require(data["level"] == entry["level"], f"{entry['slug']} level mismatch")
        require(data["target_language"] == "English", f"{entry['slug']} must be an English lesson")

        items = data["items"]
        require(
            len(items) == PHRASES_PER_LESSON,
            f"{entry['slug']} has {len(items)} phrases, expected {PHRASES_PER_LESSON}",
        )
        for item in items:
            for field in ("word_en", "word_pt", "example_sentence_en", "example_sentence_pt"):
                require(bool(item.get(field, "").strip()), f"{entry['slug']}: empty {field}")
            require(
                item["example_sentence_en"] != item["word_en"],
                f"{entry['slug']}: the example just repeats the phrase {item['word_en']!r}",
            )
            key = item["word_en"].casefold()
            require(
                key not in seen,
                f"{item['word_en']!r} appears in both {seen.get(key)} and {entry['slug']}",
            )
            seen[key] = entry["slug"]

        breakdowns = data["content"]["phrase_breakdowns"]
        require(
            len(breakdowns) == PHRASES_PER_LESSON,
            f"{entry['slug']} explains {len(breakdowns)} of {PHRASES_PER_LESSON} phrases word by word",
        )
        for breakdown in breakdowns:
            require(bool(breakdown["word_by_word"]), f"{entry['slug']}: empty word_by_word")
            for pair in breakdown["word_by_word"]:
                require(bool(pair["en"].strip()) and bool(pair["pt"].strip()), "empty word pair")


def test_each_lesson_fills_an_offline_question_bank() -> None:
    """No provider, no credit: the pack has to be able to ask its own questions."""

    for entry in LESSONS:
        items = load(entry["slug"])["items"]

        review = build_offline_lesson_questions(items)
        require(len(review) >= 8, f"{entry['slug']} only yields {len(review)} review questions")
        fronts = {question.front for question in review}
        require(len(fronts) == len(review), f"{entry['slug']} repeats a review question")

        choice = build_offline_choice_questions(items)
        require(len(choice) >= 8, f"{entry['slug']} only yields {len(choice)} multiple-choice questions")
        for question in choice:
            require(len(question.options) == 4, f"{entry['slug']}: {question.question} lacks four options")
            require(
                len(set(question.options)) == 4,
                f"{entry['slug']}: {question.question} repeats an option",
            )
            require(
                question.correct_option in question.options,
                f"{entry['slug']}: the right answer is missing from the options",
            )
            require(bool(question.explanation.strip()), f"{entry['slug']}: empty explanation")


def run() -> None:
    test_committed_files_match_the_generator()
    test_pack_shape()
    test_every_phrase_is_complete_and_unique()
    test_each_lesson_fills_an_offline_question_bank()
    print("english core pack: all checks passed")


if __name__ == "__main__":
    run()
