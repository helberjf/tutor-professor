"""Write the curated English core pack into apps/api/content/lessons.

    python scripts/build_english_core_pack.py            # write the files
    python scripts/build_english_core_pack.py --check    # fail if they are stale

The lesson data lives in `english_core_pack_data.py`; this only turns it into the
JSON shape `scripts/init_db.py` seeds. Generating rather than hand-writing thirty
files is what keeps the word-by-word breakdowns consistent: they are built from
one glossary instead of being retyped per lesson.

No file carries an `id`. Ids belong to the database, which assigns the next free
one, and a seed file claiming an id is how a lesson gets overwritten by accident.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from english_core_pack_data import GLOSSARY, LESSONS  # noqa: E402

LESSONS_DIR = REPO_ROOT / "apps" / "api" / "content" / "lessons"
PUNCTUATION = "!?.,:;\"'()"


def glossary_lookup(word: str) -> str | None:
    return GLOSSARY.get(word.strip(PUNCTUATION).casefold())


def word_by_word(phrase_en: str) -> list[dict[str, str]] | None:
    """Word-level meanings, or None when the glossary does not cover the phrase.

    None rather than a half-filled list: a breakdown missing a word teaches the
    child something wrong about where the meaning sits.
    """

    pairs: list[dict[str, str]] = []
    for token in phrase_en.split():
        cleaned = token.strip(PUNCTUATION)
        if not cleaned:
            continue
        meaning = glossary_lookup(cleaned)
        if meaning is None:
            return None
        pairs.append({"en": cleaned, "pt": meaning})
    return pairs or None


def build_lesson(entry: dict) -> dict:
    breakdowns = []
    for phrase_en, phrase_pt, _example_en, _example_pt in entry["items"]:
        pairs = word_by_word(phrase_en)
        if pairs is None:
            continue
        breakdowns.append({"phrase_en": phrase_en, "phrase_pt": phrase_pt, "word_by_word": pairs})

    return {
        "title": entry["title"],
        "theme": entry["theme"],
        "objective": entry["objective"],
        "level": entry["level"],
        "target_language": "English",
        "content": {
            "daily_goal": f"{len(entry['items'])} frases para praticar",
            "phrase_breakdowns": breakdowns,
        },
        "items": [
            {
                "word_en": phrase_en,
                "word_pt": phrase_pt,
                "example_sentence_en": example_en,
                "example_sentence_pt": example_pt,
            }
            for phrase_en, phrase_pt, example_en, example_pt in entry["items"]
        ],
    }


def render(entry: dict) -> str:
    return json.dumps(build_lesson(entry), ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the curated English core pack.")
    parser.add_argument("--check", action="store_true", help="Only report whether the files are current.")
    args = parser.parse_args()

    stale: list[str] = []
    phrases = 0
    with_breakdown = 0

    for entry in LESSONS:
        path = LESSONS_DIR / f"{entry['slug']}.json"
        payload = render(entry)
        phrases += len(entry["items"])
        with_breakdown += len(json.loads(payload)["content"]["phrase_breakdowns"])

        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current == payload:
            continue
        stale.append(path.name)
        if not args.check:
            path.write_text(payload, encoding="utf-8")

    coverage = round(100 * with_breakdown / phrases) if phrases else 0
    print(f"{len(LESSONS)} lessons, {phrases} phrases, word-by-word on {coverage}% of them.")

    if args.check and stale:
        print(f"Out of date: {', '.join(stale)}. Run python scripts/build_english_core_pack.py")
        return 1
    if stale:
        print(f"Wrote {len(stale)} file(s).")
    else:
        print("Everything already up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
