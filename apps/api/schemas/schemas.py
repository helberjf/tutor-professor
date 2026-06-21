from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

class FromAttributesModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ChildProfileSchema(FromAttributesModel):
    id: int
    user_id: Optional[int] = None
    name: str
    age_group: str
    base_language: str = "Portuguese"
    current_level: int = 1
    streak_count: int = 0
    last_activity: Optional[datetime] = None
    voice_preference: str = "af_bella"
    auto_audio: bool = True
    target_language: str = "English"

class LessonItemSchema(FromAttributesModel):
    word_en: str
    word_pt: str
    example_sentence_en: str
    example_sentence_pt: str

class LessonSchema(BaseModel):
    id: int
    title: str
    theme: str
    objective: str
    content: Dict[str, Any]
    items: List[LessonItemSchema] = Field(default_factory=list)
    is_completed: bool = False


class LessonSummarySchema(BaseModel):
    id: int
    title: str
    theme: str
    objective: str
    is_completed: bool = False
    completed_at: Optional[datetime] = None


class WordByWordPairSchema(BaseModel):
    en: str = Field(min_length=1, max_length=80)
    pt: str = Field(min_length=1, max_length=120)


class PhraseBreakdownSchema(BaseModel):
    phrase_en: str = Field(min_length=1, max_length=120)
    phrase_pt: str = Field(min_length=1, max_length=160)
    word_by_word: List[WordByWordPairSchema] = Field(default_factory=list)


class GeneratedPhraseSchema(BaseModel):
    phrase_en: str = Field(min_length=1, max_length=120)
    phrase_pt: str = Field(min_length=1, max_length=160)
    example_sentence_en: str = Field(min_length=1, max_length=220)
    example_sentence_pt: str = Field(min_length=1, max_length=220)
    word_by_word: List[WordByWordPairSchema] = Field(default_factory=list)


class GeneratedLessonDraftSchema(BaseModel):
    phrases: List[GeneratedPhraseSchema] = Field(default_factory=list, min_length=3, max_length=3)

class QuizQuestionSchema(BaseModel):
    id: int
    question: str
    options: List[str]
    correct_option: str
    explanation: str

class QuizSchema(BaseModel):
    id: int
    lesson_id: int
    questions: List[QuizQuestionSchema] = Field(default_factory=list)

class QuizSubmitSchema(BaseModel):
    lesson_id: int
    score: int
    total_questions: int

class QuizSubmitResponseSchema(BaseModel):
    status: str
    encouragement: str


class ReviewSchema(FromAttributesModel):
    word_en: str
    word_pt: str
    difficulty_score: float

class ReviewCardSchema(BaseModel):
    review_item_id: int
    word_en: str
    word_pt: str
    prompt: str
    options: List[str] = Field(default_factory=list)
    difficulty_score: float
    error_count: int


class ReviewSessionSchema(BaseModel):
    total_due: int
    items: List[ReviewCardSchema] = Field(default_factory=list)


class ReviewAttemptSchema(BaseModel):
    review_item_id: Optional[int] = None
    word_en: str
    word_pt: str
    correct: bool


class ReviewResultSchema(BaseModel):
    review_item_id: int
    difficulty_score: float
    next_review: datetime
    error_count: int
    correct_count: int

class ProgressSchema(BaseModel):
    themes_completed: int
    streak_count: int
    vocabulary_learned: int
    last_activity: Optional[datetime]
    current_level: int
    difficult_words: List[str]


class StudyDayUpdateSchema(BaseModel):
    plan_text: Optional[str] = Field(default=None, max_length=2000)
    studied_text: Optional[str] = Field(default=None, max_length=3000)
    distractions: Optional[List[str]] = Field(default=None, max_length=20)
    pomodoro_count: Optional[int] = Field(default=None, ge=0, le=9999)


class StudyDaySchema(BaseModel):
    id: Optional[int] = None
    study_date: date
    plan_text: str = ""
    studied_text: str = ""
    distractions: List[str] = Field(default_factory=list)
    is_study_day: bool = False
    pomodoro_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class StudyDashboardSchema(BaseModel):
    today: StudyDaySchema
    recent_days: List[StudyDaySchema] = Field(default_factory=list)
    study_streak_count: int = 0
    last_study_date: Optional[date] = None


class DiverseLessonBlockSchema(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=80)
    topics: List["CodingTopicSchema"] = Field(default_factory=list, max_length=50)
    created_at: Optional[str] = Field(default=None, max_length=40)


class DiverseSubjectSchema(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    topics: List["CodingTopicSchema"] = Field(default_factory=list, max_length=50)
    lessons: List[DiverseLessonBlockSchema] = Field(default_factory=list, max_length=30)


class DiverseDaySchema(BaseModel):
    id: Optional[int] = None
    study_date: date
    custom_subjects: List[DiverseSubjectSchema] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DiverseDayUpdateSchema(BaseModel):
    custom_subjects: List[DiverseSubjectSchema]


class CodingTopicSchema(BaseModel):
    topic: str = Field(min_length=1, max_length=120)
    done: bool = False
    answer: Optional[str] = Field(default=None, max_length=300)
    # Spaced-repetition state (used by the "Diverso" study mode)
    last_rating: Optional[str] = Field(default=None, max_length=10)  # 'knew' | 'partial' | 'unknown'
    review_count: int = Field(default=0, ge=0)
    last_reviewed: Optional[str] = Field(default=None, max_length=40)  # ISO timestamp


class CodingDaySchema(BaseModel):
    id: Optional[int] = None
    study_date: date
    subjects: Dict[str, List[CodingTopicSchema]] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CodingDayUpdateSchema(BaseModel):
    subjects: Dict[str, List[CodingTopicSchema]]


class LevelAnalysisSchema(BaseModel):
    level: int
    label: str
    vocabulary_learned: int
    quiz_accuracy: float
    avg_review_difficulty: float
    next_level_at: int  # vocabulary needed to reach next level
    target_language: str = "English"


# ── Book schemas ───────────────────────────────────────────────────────────────

class BookPageSchema(BaseModel):
    id: int
    page_number: int
    text_en: str
    text_pt: str
    vocabulary: list[str]


class BookSchema(BaseModel):
    id: int
    title: str
    theme: str
    level: int
    num_pages: int
    created_at: str
    pages: list[BookPageSchema]


class BookSummarySchema(BaseModel):
    id: int
    title: str
    theme: str
    level: int
    num_pages: int
    created_at: str


class GenerateBookRequestSchema(BaseModel):
    level: int = Field(default=0, ge=0, le=10)   # 0 = usa nivel atual da criança
    num_pages: int = Field(default=5, ge=3, le=10)
    theme: str = Field(default="", max_length=80)


class GenerateBookOutlineRequestSchema(BaseModel):
    level: int = Field(default=0, ge=0, le=10)
    num_pages: int = Field(default=5, ge=3, le=10)
    theme: str = Field(default="", max_length=80)


class BookOutlinePageSchema(BaseModel):
    page_number: int
    scene: str = Field(max_length=400)
    key_vocabulary: list[str] = Field(default_factory=list, max_length=5)


class BookOutlineSchema(BaseModel):
    title: str = Field(max_length=200)
    theme: str = Field(max_length=80)
    synopsis: str = Field(max_length=600)
    characters: list[str] = Field(default_factory=list, max_length=6)
    page_outlines: list[BookOutlinePageSchema]
    level: int = Field(default=1, ge=1, le=10)
    num_pages: int = Field(default=5, ge=3, le=10)
    target_language: str = Field(default="English", max_length=40)


class StartBookFromOutlineRequestSchema(BaseModel):
    title: str = Field(max_length=200)
    theme: str = Field(max_length=80)
    level: int = Field(ge=1, le=10)
    num_pages: int = Field(ge=3, le=10)
    target_language: str = Field(default="English", max_length=40)


# ── Generated book draft (internal, returned by BookGenerationService) ────────

class GeneratedBookPageDraftSchema(BaseModel):
    page_number: int
    text_en: str
    text_pt: str
    vocabulary: list[str]


class GeneratedBookDraftSchema(BaseModel):
    title: str
    theme: str
    pages: list[GeneratedBookPageDraftSchema]


class GenerateBookPageRequestSchema(BaseModel):
    outline: BookOutlineSchema
    page_number: int = Field(ge=1, le=10)
    context_pages: list[GeneratedBookPageDraftSchema] = Field(default_factory=list, max_length=10)


class ChildProgressSummarySchema(BaseModel):
    child: ChildProfileSchema
    progress: ProgressSchema
    child: ChildProfileSchema
    progress: ProgressSchema

class ChatMessageSchema(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=300)


class ChatRequestSchema(BaseModel):
    message: str = Field(min_length=1, max_length=300)
    history: List[ChatMessageSchema] = Field(default_factory=list)

class ChatResponseSchema(BaseModel):
    response: str
    audio_url: Optional[str] = None

class SpeakRequestSchema(BaseModel):
    text: str
    voice: Optional[str] = None

class SpeakResponseSchema(BaseModel):
    audio_url: Optional[str] = None
    fallback_text: Optional[str] = None


# ── Coding Curriculum ─────────────────────────────────────────────────────────

class AISectionSchema(BaseModel):
    title: str
    body: str
    code_example: Optional[str] = None


class AIQuizQuestionSchema(BaseModel):
    id: int
    question: str
    options: List[str]
    correct_option: str
    explanation: str


class AIFlashcardDraftSchema(BaseModel):
    front: str
    back: str
    code_example: Optional[str] = None


class TopicAIContentSchema(BaseModel):
    sections: List[AISectionSchema] = Field(default_factory=list)
    quiz: List[AIQuizQuestionSchema] = Field(default_factory=list)
    flashcards: List[AIFlashcardDraftSchema] = Field(default_factory=list)


class ProgrammingSubjectSchema(FromAttributesModel):
    id: int
    child_id: int
    name: str
    description: Optional[str] = None
    icon_emoji: Optional[str] = None
    created_at: datetime
    topic_count: int = 0
    studied_count: int = 0
    due_review_count: int = 0


class CreateProgrammingSubjectSchema(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_emoji: Optional[str] = Field(default=None, max_length=10)


class UpdateProgrammingSubjectSchema(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_emoji: Optional[str] = Field(default=None, max_length=10)


class ProgrammingTopicSchema(FromAttributesModel):
    id: int
    subject_id: int
    title: str
    order_index: int
    status: Literal["not_started", "studied", "mastered"]
    ai_content: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    flashcard_count: int = 0


class CreateProgrammingTopicSchema(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    order_index: Optional[int] = None
    generate_ai: bool = False


class UpdateProgrammingTopicSchema(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    order_index: Optional[int] = None
    status: Optional[Literal["not_started", "studied", "mastered"]] = None
    notes: Optional[str] = Field(default=None, max_length=5000)
    ai_content: Optional[Dict[str, Any]] = None


class ProgrammingFlashcardSchema(FromAttributesModel):
    id: int
    topic_id: int
    subject_id: int
    front: str
    back: str
    code_example: Optional[str] = None
    created_at: datetime


class CreateProgrammingFlashcardSchema(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)


class UpdateProgrammingFlashcardSchema(BaseModel):
    front: Optional[str] = Field(default=None, min_length=1, max_length=500)
    back: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)


class CodingReviewCardSchema(BaseModel):
    review_item_id: int
    flashcard_id: int
    subject_id: int
    front: str
    back: str
    code_example: Optional[str] = None
    difficulty_score: float
    error_count: int


class CodingReviewSessionSchema(BaseModel):
    total_due: int
    items: List[CodingReviewCardSchema]


class CodingReviewAttemptSchema(BaseModel):
    review_item_id: int
    # rating: knew (sabia) | partial (parcial/duvida) | unknown (nao sabia).
    # correct mantido para compatibilidade com clientes antigos.
    rating: Optional[Literal["knew", "partial", "unknown"]] = None
    correct: Optional[bool] = None


class LeetCodeMethodSchema(FromAttributesModel):
    id: int
    name: str
    category: Optional[str] = None
    language: str = "Python"
    explanation: str
    code_example: str
    example_output: str
    complexity_time: Optional[str] = None
    complexity_space: Optional[str] = None
    order_index: int
    created_at: datetime


class GenerateLeetCodeMethodRequestSchema(BaseModel):
    hint: str = Field(default="", max_length=120)
    language: str = Field(default="Python", max_length=40)


class CodingReviewResultSchema(BaseModel):
    review_item_id: int
    difficulty_score: float
    next_review: datetime
    error_count: int
    correct_count: int

class ParentLoginSchema(BaseModel):
    password: str


class UserRegisterSchema(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=254)
    cpf: str = Field(min_length=11, max_length=18)
    password: str = Field(min_length=6, max_length=128)
    child_name: Optional[str] = Field(default=None, max_length=80)
    target_language: Optional[str] = Field(default=None, max_length=40)
    ai_provider: Optional[str] = Field(default=None, max_length=40)
    ai_api_key: Optional[str] = Field(default=None, max_length=500)
    ai_model: Optional[str] = Field(default=None, max_length=120)
    ai_base_url: Optional[str] = Field(default=None, max_length=300)


class UserLoginSchema(BaseModel):
    email: str
    password: str


class UserResponseSchema(FromAttributesModel):
    id: int
    first_name: str
    last_name: str
    email: str
    created_at: datetime


class AIProviderSchema(BaseModel):
    id: str
    label: str
    default_model: str
    requires_base_url: bool = False
    is_default: bool = False


class UserAISettingsSchema(BaseModel):
    provider: str = "gemini"
    model: str = "gemini-2.5-flash"
    base_url: Optional[str] = None
    has_api_key: bool = False
    api_key_preview: Optional[str] = None


class UserAISettingsUpdateSchema(BaseModel):
    provider: str = Field(default="gemini", max_length=40)
    api_key: Optional[str] = Field(default=None, max_length=500)
    model: Optional[str] = Field(default=None, max_length=120)
    base_url: Optional[str] = Field(default=None, max_length=300)

class ParentSettingsUpdateSchema(BaseModel):
    child_name: Optional[str] = None
    age_group: Optional[str] = None
    voice_preference: Optional[str] = None
    auto_audio: Optional[bool] = None
    rhythm: Optional[str] = None
    target_language: Optional[str] = Field(default=None, max_length=40)


class CreateChildProfileSchema(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    age_group: str = Field(min_length=1, max_length=20)
    voice_preference: Optional[str] = Field(default=None, max_length=40)
    auto_audio: Optional[bool] = None
    target_language: Optional[str] = Field(default=None, max_length=40)


class GenerateLessonRequestSchema(BaseModel):
    topic: Optional[str] = Field(default=None, max_length=80)
    quantity: int = Field(default=1, ge=1, le=10)


class GenerateLessonResponseSchema(BaseModel):
    status: str
    lesson: LessonSchema  # last generated (kept for backward compat)
    lessons: list[LessonSchema]
    message: str


class GenerateFlashcardsRequestSchema(BaseModel):
    subject: str = Field(default="", max_length=80)
    count: int = Field(default=5, ge=1, le=10)
    suggest_subject: bool = False
    avoid_topics: List[str] = Field(default_factory=list, max_length=80)
    context: Optional[str] = Field(default=None, max_length=1000)
    api_key: Optional[str] = Field(default=None, max_length=500)
    provider: str = Field(default="gemini", max_length=40)


class GeneratedFlashcardSchema(BaseModel):
    topic: str
    answer: str


class GenerateFlashcardsResponseSchema(BaseModel):
    subject: str
    flashcards: list[GeneratedFlashcardSchema]
