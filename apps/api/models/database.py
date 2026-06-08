from datetime import date, datetime
from enum import Enum as PyEnum
from typing import Optional, Dict, Any
from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field, JSON, Column


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: str = Field(unique=True, index=True, max_length=254)
    cpf_hash: str = Field(unique=True, index=True)
    password_hash: str
    google_sub: Optional[str] = Field(default=None, unique=True, index=True)
    auth_provider: str = Field(default="password", max_length=40)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserAISettings(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    provider: str = Field(default="gemini", max_length=40)
    api_key_encrypted: str
    model: str = Field(default="gemini-2.5-flash", max_length=120)
    base_url: Optional[str] = Field(default=None, max_length=300)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_token_hash: str = Field(unique=True, index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime


class ChildProfile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    name: str
    age_group: str  # e.g., "4-6", "7-9", "10-12"
    base_language: str = "Portuguese"
    current_level: int = 1
    streak_count: int = 0
    last_activity: Optional[datetime] = None
    voice_preference: str = "af_bella"
    auto_audio: bool = True
    target_language: str = "English"
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
    level: Optional[int] = Field(default=None, index=True)  # nivel para licoes compartilhadas
    target_language: str = Field(default="English")

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

class StudyDay(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("child_id", "study_date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    study_date: date = Field(index=True)
    plan_text: str = ""
    studied_text: str = ""
    distractions: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

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


class Book(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: Optional[int] = Field(default=None, foreign_key="childprofile.id", index=True)  # None = livro compartilhado
    title: str
    theme: str
    level: int = 1
    num_pages: int = 5
    target_language: str = "English"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BookPage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    page_number: int
    text_en: str = Field(sa_column=Column(JSON))          # stored as str, long text
    text_pt: str = Field(sa_column=Column(JSON))
    vocabulary_json: str = Field(default="[]")            # JSON array of key words


class DiverseDay(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("child_id", "study_date"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    study_date: date = Field(index=True)
    custom_subjects: list = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CodingDay(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("child_id", "study_date"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    study_date: date = Field(index=True)
    subjects: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AdminFlashcard(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    front: str = Field(max_length=300)       # term / question
    back: str = Field(max_length=1000)       # definition / answer
    category: str = Field(default="general", max_length=40)  # react | typescript | general
    code_example: Optional[str] = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TopicStatus(str, PyEnum):
    not_started = "not_started"
    studied = "studied"
    mastered = "mastered"


class ProgrammingSubject(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_emoji: Optional[str] = Field(default=None, max_length=10)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProgrammingTopic(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    subject_id: int = Field(foreign_key="programmingsubject.id", index=True)
    title: str = Field(min_length=1, max_length=200)
    order_index: int = Field(default=0)
    status: TopicStatus = Field(default=TopicStatus.not_started)
    ai_content: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    notes: Optional[str] = Field(default=None, max_length=5000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProgrammingFlashcard(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    topic_id: int = Field(foreign_key="programmingtopic.id", index=True)
    subject_id: int = Field(foreign_key="programmingsubject.id", index=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CodingReviewItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    flashcard_id: int = Field(foreign_key="programmingflashcard.id", index=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    difficulty_score: float = Field(default=0.5)
    attempt_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    error_count: int = Field(default=0)
    streak: int = Field(default=0)
    last_reviewed: Optional[datetime] = Field(default=None)
    next_review: datetime = Field(default_factory=datetime.utcnow)
