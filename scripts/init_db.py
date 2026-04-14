import os
import sys
import json
from pathlib import Path
from sqlmodel import Session, create_engine, SQLModel, select

# Add apps/api to path
sys.path.append(str(Path(__file__).parent.parent / "apps" / "api"))

from models.database import ChildProfile, Lesson, LessonItem

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./apps/api/kids_tutor.sqlite")
engine = create_engine(DATABASE_URL)

def init_db():
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
                
                # Check if lesson exists
                statement = select(Lesson).where(Lesson.title == data['title'])
                existing_lesson = session.exec(statement).first()
                if not existing_lesson:
                    lesson = Lesson(
                        title=data['title'],
                        theme=data['theme'],
                        objective=data['objective'],
                        content=data.get('content', {}),
                        child_id=child.id
                    )
                    session.add(lesson)
                    session.commit()
                    session.refresh(lesson)
                    
                    for item_data in data['items']:
                        item = LessonItem(
                            word_en=item_data['word_en'],
                            word_pt=item_data['word_pt'],
                            example_sentence_en=item_data['example_sentence_en'],
                            example_sentence_pt=item_data['example_sentence_pt'],
                            lesson_id=lesson.id
                        )
                        session.add(item)
                    session.commit()
                    print(f"Added lesson: {lesson.title}")
                else:
                    print(f"Lesson '{data['title']}' already exists.")

if __name__ == "__main__":
    init_db()
    print("Database initialization complete!")
