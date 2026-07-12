import json
import os
import sys
from pathlib import Path

from sqlmodel import SQLModel, Session, create_engine, select

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.models.database import ChildProfile, Lesson, LessonItem
from apps.api.database_bootstrap import bootstrap_database

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./apps/api/kids_tutor.sqlite")
engine = create_engine(DATABASE_URL)

def init_db():
    bootstrap_database(DATABASE_URL)
    print("Creating tables...")
    SQLModel.metadata.create_all(engine)
    
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
        lessons_dir = Path(__file__).parent.parent / "content" / "lessons"
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
                        or (lesson.content or {}) != data.get('content', {})
                    )
                    lesson.title = data['title']
                    lesson.theme = data['theme']
                    lesson.objective = data['objective']
                    lesson.content = data.get('content', {})
                    lesson.child_id = None
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
