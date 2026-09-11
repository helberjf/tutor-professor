"""Seed the static lesson content from apps/api/content/lessons into a database.

    python scripts/init_db.py             # migrate the schema, then seed
    python scripts/init_db.py --dry-run   # report what would change, write nothing

Safe to run against a database that is already in use. The app generates
lessons at runtime and picks their ids itself (max(id) + 1, see
main.get_next_lesson_day), so a seed file must never claim an id on its own.
Only the original day-1..5 intro pack carries ids, and a file whose id already
belongs to a lesson with a different title is refused rather than overwritten.
Every other lesson is matched by title and, when new, takes the next free id
the same way the app assigns them. Everything is staged in one transaction, so
a refusal leaves the database exactly as it was.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import func
from sqlmodel import Session, select

REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from models.database import ChildProfile, Lesson, LessonItem  # noqa: E402

load_dotenv(API_DIR / ".env")
os.environ.setdefault("DATABASE_URL", "sqlite:///./apps/api/kids_tutor.sqlite")

# Imported after the environment is loaded: main reads DATABASE_URL and its
# settings at import time. Seeding reuses its engine so the rows land in the
# same database its startup migrates.
import main  # noqa: E402

engine = main.engine
LESSONS_DIR = API_DIR / "content" / "lessons"


class SeedCollisionError(RuntimeError):
    """A seed file claims a lesson id that already belongs to a different lesson."""


def _items_payload(items) -> list[dict[str, str]]:
    return [
        {
            "word_en": item.word_en,
            "word_pt": item.word_pt,
            "example_sentence_en": item.example_sentence_en,
            "example_sentence_pt": item.example_sentence_pt,
        }
        for item in items
    ]


def _replace_items(session: Session, lesson_id: int, items: list[dict]) -> None:
    for existing in session.exec(select(LessonItem).where(LessonItem.lesson_id == lesson_id)).all():
        session.delete(existing)
    for item in items:
        session.add(
            LessonItem(
                lesson_id=lesson_id,
                word_en=item["word_en"],
                word_pt=item["word_pt"],
                example_sentence_en=item["example_sentence_en"],
                example_sentence_pt=item["example_sentence_pt"],
            )
        )
    session.flush()


def seed_lessons(
    session: Session,
    lessons_dir: Path = LESSONS_DIR,
    *,
    dry_run: bool = False,
    log=print,
) -> dict[str, list[tuple[int, str]]]:
    """Stage every seed lesson in `session`; the caller commits or rolls back.

    Returns {"added": [...], "updated": [...], "unchanged": [...]} as
    (lesson id, title) pairs. With dry_run nothing is staged at all, but the
    report — including the ids new lessons would get — is the same.
    """
    report: dict[str, list[tuple[int, str]]] = {"added": [], "updated": [], "unchanged": []}
    next_id = (session.exec(select(func.max(Lesson.id))).one() or 0) + 1

    for path in sorted(lessons_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        title = data["title"]
        file_id = data.get("id")

        lesson = None
        if file_id is not None:
            lesson = session.get(Lesson, file_id)
            if lesson is not None and lesson.title != title:
                raise SeedCollisionError(
                    f"{path.name} claims lesson id {file_id}, but that id already holds "
                    f"{lesson.title!r}. Refusing to overwrite it — remove the id from the file."
                )
        if lesson is None:
            # Shared lessons only: a child's private lesson is never adopted by title.
            lesson = session.exec(
                select(Lesson).where(Lesson.title == title, Lesson.child_id == None)  # noqa: E711
            ).first()

        fields = {
            "title": title,
            "theme": data["theme"],
            "objective": data["objective"],
            "content": data.get("content", {}),
            "level": data.get("level"),
            "target_language": data.get("target_language", "English"),
        }
        incoming_items = data.get("items", [])

        if lesson is None:
            lesson_id = file_id if file_id is not None else next_id
            next_id = max(next_id, lesson_id + 1)
            if not dry_run:
                session.add(Lesson(id=lesson_id, child_id=None, **fields))
                session.flush()
                _replace_items(session, lesson_id, incoming_items)
            report["added"].append((lesson_id, title))
            log(f"{'Would add' if dry_run else 'Added'} lesson {lesson_id}: {title}")
            continue

        current_items = session.exec(
            select(LessonItem).where(LessonItem.lesson_id == lesson.id).order_by(LessonItem.id)
        ).all()
        fields_changed = any(
            ((getattr(lesson, name) or {}) if name == "content" else getattr(lesson, name)) != value
            for name, value in fields.items()
        )
        items_changed = _items_payload(current_items) != incoming_items

        if not fields_changed and not items_changed:
            report["unchanged"].append((lesson.id, title))
            log(f"Unchanged lesson {lesson.id}: {title}")
            continue

        if not dry_run:
            for name, value in fields.items():
                setattr(lesson, name, value)
            if fields_changed:
                lesson.is_completed = False
                lesson.completed_at = None
            session.add(lesson)
            session.flush()
            if items_changed:
                _replace_items(session, lesson.id, incoming_items)
        report["updated"].append((lesson.id, title))
        log(f"{'Would update' if dry_run else 'Updated'} lesson {lesson.id}: {title}")

    return report


def ensure_default_child(session: Session, *, dry_run: bool = False, log=print) -> None:
    # Select only the id: before migration 0022 the child table lacks
    # level_override, and a dry run must work against that database too.
    if session.exec(select(ChildProfile.id).where(ChildProfile.id == 1)).first() is not None:
        return
    if dry_run:
        log("Would create the default child profile.")
        return
    session.add(ChildProfile(name="Student", age_group="7-9"))
    session.flush()
    log("Created the default child profile.")


def init_db(dry_run: bool = False) -> dict[str, list[tuple[int, str]]]:
    if dry_run:
        print("Dry run: the schema is left alone and nothing is committed.")
    else:
        # Build the schema through the API's own startup rather than a copy of
        # it: several columns exist only as ALTER TABLE statements in
        # main._run_schema_migrations, and create_all never alters an existing
        # table, so anything less leaves a fresh database missing them.
        print("Preparing schema...")
        main.on_startup()

    with Session(engine) as session:
        try:
            ensure_default_child(session, dry_run=dry_run)
            report = seed_lessons(session, dry_run=dry_run)
        except Exception:
            session.rollback()
            raise
        if dry_run:
            session.rollback()
        else:
            session.commit()

    verb = "would be" if dry_run else "were"
    print(
        f"{len(report['added'])} lessons {verb} added, "
        f"{len(report['updated'])} {verb} updated, "
        f"{len(report['unchanged'])} already up to date."
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the static lesson content.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would change without migrating or writing anything",
    )
    arguments = parser.parse_args()
    init_db(dry_run=arguments.dry_run)
    print("Dry run complete, nothing was written." if arguments.dry_run else "Database initialization complete!")
