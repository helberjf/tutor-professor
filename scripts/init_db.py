import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import SQLModel, Session, create_engine, select

REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from models.database import ChildProfile, Lesson, LessonItem

# Database setup
load_dotenv(API_DIR / ".env")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./apps/api/kids_tutor.sqlite")

# Imported after the environment is loaded: main reads DATABASE_URL and its
# settings at import time. Seeding reuses its engine so the rows land in the
# same database its startup just migrated.
import main  # noqa: E402

engine = main.engine

def init_db():
    # Build the schema through the API's own startup rather than a copy of it.
    #
    # Several columns (childprofile.target_language and level_override,
    # lesson.level, book.target_language, ...) exist only as ALTER TABLE
    # statements in main._run_schema_migrations, not as Alembic revisions.
    # Running bootstrap_database + create_all alone therefore left a fresh
    # database missing them — create_all only creates absent tables, it never
    # alters an existing one — and seeding then died on the first ChildProfile
    # query. Calling on_startup keeps the seeded schema identical to the running
    # API's by construction, instead of a second list that has to be kept in step.
    print("Preparing schema...")
    main.on_startup()

    with Session(engine) as session:
        # Check if child profile exists
        statement = select(ChildProfile).where(ChildProfile.id == 1)
        child = session.exec(statement).first()
        if not child:
            print("Creating default child profile...")
            child = ChildProfile(name="Student", age_group="7-9")
            session.add(child)
            session.commit()
            session.refresh(child)
            print(f"Created child profile with ID: {child.id}")

        # Seed lessons from content/lessons
        lessons_dir = Path(__file__).parent.parent / "apps" / "api" / "content" / "lessons"
        for lesson_file in lessons_dir.glob("*.json"):
            print(f"Processing lesson: {lesson_file.name}")
            with open(lesson_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                lesson = None
                file_lesson_id = data.get('id')
                if file_lesson_id is not None:
                    lesson = session.get(Lesson, file_lesson_id)

                if lesson is None:
                    statement = select(Lesson).where(Lesson.title == data['title'])
                    lesson = session.exec(statement).first()

                content_changed = False
                if lesson is None:
                    lesson = Lesson(
                        id=file_lesson_id,
                        title=data['title'],
                        theme=data['theme'],
                        objective=data['objective'],
                        content=data.get('content', {}),
                        child_id=None,
                        level=data.get('level'),
                        target_language=data.get('target_language', 'English'),
                    )
                    session.add(lesson)
                    session.commit()
                    session.refresh(lesson)
                    content_changed = True
                    print(f"Added lesson: {lesson.title}")
                else:
                    content_changed = (
                        lesson.title != data['title']
                        or lesson.theme != data['theme']
                        or lesson.objective != data['objective']
                        or lesson.level != data.get('level')
                        or (lesson.content or {}) != data.get('content', {})
                    )
                    lesson.title = data['title']
                    lesson.theme = data['theme']
                    lesson.objective = data['objective']
                    lesson.content = data.get('content', {})
                    lesson.child_id = None
                    lesson.level = data.get('level')
                    lesson.target_language = data.get('target_language', 'English')
                    if content_changed:
                        lesson.is_completed = False
                        lesson.completed_at = None
                    session.add(lesson)
                    session.commit()
                    session.refresh(lesson)
                    print(f"Updated lesson: {lesson.title}")

                existing_items = session.exec(
                    select(LessonItem).where(LessonItem.lesson_id == lesson.id)
                ).all()
                incoming_items = data.get('items', [])

                existing_payload = [
                    {
                        "word_en": item.word_en,
                        "word_pt": item.word_pt,
                        "example_sentence_en": item.example_sentence_en,
                        "example_sentence_pt": item.example_sentence_pt,
                    }
                    for item in existing_items
                ]

                if content_changed or existing_payload != incoming_items:
                    for item in existing_items:
                        session.delete(item)
                    session.commit()

                    for item_data in incoming_items:
                        item = LessonItem(
                            word_en=item_data['word_en'],
                            word_pt=item_data['word_pt'],
                            example_sentence_en=item_data['example_sentence_en'],
                            example_sentence_pt=item_data['example_sentence_pt'],
                            lesson_id=lesson.id
                        )
                        session.add(item)
                    session.commit()
                    print(f"Synced {len(incoming_items)} lesson items for: {lesson.title}")
                else:
                    print(f"Lesson items for '{lesson.title}' are already up to date.")

if __name__ == "__main__":
    init_db()
    print("Database initialization complete!")
