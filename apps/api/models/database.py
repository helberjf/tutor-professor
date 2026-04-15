from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, JSON, Column

class ChildProfile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    age_group: str  # e.g., "4-6", "7-9", "10-12"
    base_language: str = "Portuguese"
    current_level: int = 1
    streak_count: int = 0
    last_activity: Optional[datetime] = None
    voice_preference: str = "af_heart"
    auto_audio: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Lesson(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    theme: str
    objective: str
    content: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    child_id: Optional[int] = Field(default=None, foreign_key="childprofile.id")

class LessonItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    word_en: str
    word_pt: str
    example_sentence_en: str
    example_sentence_pt: str
    lesson_id: Optional[int] = Field(default=None, foreign_key="lesson.id")

class ReviewItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    word_en: str
    word_pt: str
    difficulty_score: float = 0.5  # 0.0 to 1.0
    attempt_count: int = 0
    correct_count: int = 0
    error_count: int = 0
    streak: int = 0
    last_reviewed: datetime = Field(default_factory=datetime.utcnow)
    next_review: datetime = Field(default_factory=datetime.utcnow)
    child_id: Optional[int] = Field(default=None, foreign_key="childprofile.id")

class ChildLessonProgress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    lesson_id: int = Field(foreign_key="lesson.id", index=True)
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class QuizAttempt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lesson_id: Optional[int] = Field(default=None, foreign_key="lesson.id")
    score: int
    total_questions: int
    attempted_at: datetime = Field(default_factory=datetime.utcnow)
    child_id: Optional[int] = Field(default=None, foreign_key="childprofile.id")

class AudioCache(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    text_hash: str = Field(index=True)
    voice: str
    file_path: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ParentSettings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    password_hash: str
    session_token: Optional[str] = None
