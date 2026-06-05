from datetime import datetime
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


class UserLoginSchema(BaseModel):
    email: str
    password: str


class UserResponseSchema(FromAttributesModel):
    id: int
    first_name: str
    last_name: str
    email: str
    created_at: datetime

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
