from datetime import date, datetime
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator

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


class LessonQuestionSchema(FromAttributesModel):
    id: int
    lesson_id: int
    target_language: str
    question_type: str
    front: str
    back: str
    supporting_example: Optional[str] = None
    created_at: datetime

class LessonSchema(BaseModel):
    id: int
    title: str
    theme: str
    objective: str
    content: Dict[str, Any]
    items: List[LessonItemSchema] = Field(default_factory=list)
    questions: List[LessonQuestionSchema] = Field(default_factory=list)
    is_completed: bool = False


class LessonSummarySchema(BaseModel):
    id: int
    title: str
    theme: str
    objective: str
    is_completed: bool = False
    completed_at: Optional[datetime] = None


class GenerateLessonQuestionsSchema(BaseModel):
    context: Optional[str] = Field(default=None, max_length=1000)


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


class GeneratedLessonQuestionSchema(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2000)
    question_type: Literal[
        "vocabulary",
        "translation",
        "sentence_completion",
        "grammar",
        "comprehension",
        "contextual_usage",
    ]
    supporting_example: Optional[str] = Field(default=None, max_length=1000)


class GeneratedLessonDraftSchema(BaseModel):
    phrases: List[GeneratedPhraseSchema] = Field(default_factory=list, min_length=3, max_length=3)
    questions: List[GeneratedLessonQuestionSchema] = Field(
        default_factory=list, min_length=5, max_length=5
    )

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

class VocabularyReviewCardSchema(BaseModel):
    card_type: Literal["vocabulary"] = "vocabulary"
    review_item_id: int
    word_en: str
    word_pt: str
    prompt: str
    answer: str
    options: List[str] = Field(default_factory=list)
    difficulty_score: float
    error_count: int


class LessonQuestionReviewCardSchema(BaseModel):
    card_type: Literal["lesson_question"] = "lesson_question"
    lesson_question_id: int
    lesson_id: int
    prompt: str
    answer: str
    question_type: str
    supporting_example: Optional[str] = None
    difficulty_score: float
    error_count: int


ReviewCardSchema = Annotated[
    Union[VocabularyReviewCardSchema, LessonQuestionReviewCardSchema],
    Field(discriminator="card_type"),
]


class ReviewSessionSchema(BaseModel):
    total_due: int
    items: List[ReviewCardSchema] = Field(default_factory=list)


class ReviewAttemptSchema(BaseModel):
    card_type: Literal["vocabulary", "lesson_question"] = "vocabulary"
    review_item_id: Optional[int] = Field(default=None, gt=0)
    lesson_question_id: Optional[int] = Field(default=None, gt=0)
    word_en: Optional[str] = None
    word_pt: Optional[str] = None
    correct: bool

    @model_validator(mode="after")
    def validate_card_identifier(self) -> "ReviewAttemptSchema":
        if self.card_type == "lesson_question":
            if self.lesson_question_id is None:
                raise ValueError("lesson_question_id is required for lesson_question attempts")
            if self.review_item_id is not None:
                raise ValueError("review_item_id is not valid for lesson_question attempts")
            return self

        if self.lesson_question_id is not None:
            raise ValueError("lesson_question_id is not valid for vocabulary attempts")
        if self.review_item_id is None and not (
            (self.word_en or "").strip() and (self.word_pt or "").strip()
        ):
            raise ValueError(
                "review_item_id or both word_en and word_pt are required for vocabulary attempts"
            )
        return self


class ReviewResultSchema(BaseModel):
    card_type: Literal["vocabulary", "lesson_question"]
    card_id: int
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
    topic_ids: List[str] = Field(default_factory=list, max_length=50)
    created_at: Optional[str] = Field(default=None, max_length=40)


class DiverseSubjectSchema(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=60)
    topics: List["CodingTopicSchema"] = Field(default_factory=list, max_length=1550)
    lessons: List[DiverseLessonBlockSchema] = Field(default_factory=list, max_length=30)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_lesson_questions(cls, value: Any) -> Any:
        """Convert embedded legacy copies before lesson schemas discard extra fields."""
        if not isinstance(value, dict):
            return value
        from services.diverse_question_service import normalize_subject

        prepared = {
            **value,
            "topics": [
                topic.model_dump(mode="python") if isinstance(topic, BaseModel) else topic
                for topic in (value.get("topics") or [])
            ],
            "lessons": [
                lesson.model_dump(mode="python") if isinstance(lesson, BaseModel) else lesson
                for lesson in (value.get("lessons") or [])
            ],
        }
        return normalize_subject(prepared)


class DiverseDaySchema(BaseModel):
    id: Optional[int] = None
    study_date: date
    custom_subjects: List[DiverseSubjectSchema] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_subject_identities(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        from services.diverse_question_service import normalize_subjects

        raw_subjects = [
            subject.model_dump(mode="python") if isinstance(subject, BaseModel) else subject
            for subject in (value.get("custom_subjects") or [])
        ]
        return {**value, "custom_subjects": normalize_subjects(raw_subjects)}


class DiverseDayUpdateSchema(BaseModel):
    custom_subjects: List[DiverseSubjectSchema]
    _original_identity_metadata: dict = PrivateAttr(default_factory=lambda: {"subjects": []})

    @property
    def original_identity_metadata(self) -> dict:
        return self._original_identity_metadata

    @model_validator(mode="wrap")
    @classmethod
    def capture_original_identities(cls, value: Any, handler: Any) -> "DiverseDayUpdateSchema":
        from services.diverse_question_service import capture_original_identity_metadata

        raw_subjects = []
        if isinstance(value, dict):
            raw_subjects = [
                subject.model_dump(mode="python") if isinstance(subject, BaseModel) else subject
                for subject in (value.get("custom_subjects") or [])
            ]
        metadata = capture_original_identity_metadata(raw_subjects)
        model = handler(value)
        model._original_identity_metadata = metadata
        return model

    @model_validator(mode="before")
    @classmethod
    def normalize_subject_identities(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        from services.diverse_question_service import normalize_subjects

        raw_subjects = [
            subject.model_dump(mode="python") if isinstance(subject, BaseModel) else subject
            for subject in (value.get("custom_subjects") or [])
        ]
        return {**value, "custom_subjects": normalize_subjects(raw_subjects)}


class GenerateDiverseQuestionsSchema(BaseModel):
    study_date: date
    subject_index: int = Field(ge=0)
    lesson_id: str = Field(min_length=1, max_length=80)
    context: Optional[str] = Field(default=None, max_length=1000)


class CodingTopicSchema(BaseModel):
    id: str = Field(default="", max_length=80)
    topic: str = Field(min_length=1, max_length=120)
    done: bool = False
    answer: Optional[str] = Field(default=None, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)
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
    num_pages: int = Field(default=5, ge=1, le=5)
    theme: str = Field(min_length=1, max_length=300)


class GenerateBookOutlineRequestSchema(BaseModel):
    level: int = Field(default=0, ge=0, le=10)
    num_pages: int = Field(default=5, ge=1, le=5)
    theme: str = Field(min_length=1, max_length=300)


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
    num_pages: int = Field(default=5, ge=1, le=5)
    target_language: str = Field(default="English", max_length=40)


class StartBookFromOutlineRequestSchema(BaseModel):
    title: str = Field(max_length=200)
    theme: str = Field(max_length=80)
    level: int = Field(ge=1, le=10)
    num_pages: int = Field(ge=1, le=5)
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
    page_number: int = Field(ge=1, le=5)
    context_pages: list[GeneratedBookPageDraftSchema] = Field(default_factory=list, max_length=5)


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
    title: Optional[str] = None
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


class GenerateProgrammingTopicContentSchema(BaseModel):
    context: Optional[str] = Field(default=None, max_length=1000)


class GenerateAdditionalFlashcardsSchema(BaseModel):
    context: Optional[str] = Field(default=None, max_length=1000)


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
    language: str = "TypeScript"
    explanation: str
    code_example: str
    example_output: str
    complexity_time: Optional[str] = None
    complexity_space: Optional[str] = None
    order_index: int
    created_at: datetime


class GenerateLeetCodeMethodRequestSchema(BaseModel):
    hint: str = Field(default="", max_length=120)
    language: str = Field(default="TypeScript", max_length=40)


class CodingReviewResultSchema(BaseModel):
    review_item_id: int
    difficulty_score: float
    next_review: datetime
    error_count: int
    correct_count: int


# ── Flashcard deck (Anki-style) ────────────────────────────────────────────────

class DeckConfigSchema(FromAttributesModel):
    new_per_day: int = 20
    max_reviews_per_day: int = 200
    learning_steps: str = "1 10"
    relearning_steps: str = "10"
    graduating_interval: int = 1
    easy_interval: int = 4
    desired_retention: float = 0.9
    maximum_interval: int = 36500
    insertion_order: str = "sequential"
    new_cards_ignore_review_limit: bool = False
    leech_threshold: int = 8
    leech_action: str = "tag"
    fsrs_parameters: str = ""


class UpdateDeckConfigSchema(BaseModel):
    new_per_day: Optional[int] = Field(default=None, ge=0, le=9999)
    max_reviews_per_day: Optional[int] = Field(default=None, ge=0, le=99999)
    learning_steps: Optional[str] = Field(default=None, max_length=120)
    relearning_steps: Optional[str] = Field(default=None, max_length=120)
    graduating_interval: Optional[int] = Field(default=None, ge=1, le=36500)
    easy_interval: Optional[int] = Field(default=None, ge=1, le=36500)
    desired_retention: Optional[float] = Field(default=None, ge=0.7, le=0.99)
    maximum_interval: Optional[int] = Field(default=None, ge=1, le=36500)
    insertion_order: Optional[Literal["sequential", "random"]] = None
    new_cards_ignore_review_limit: Optional[bool] = None
    leech_threshold: Optional[int] = Field(default=None, ge=0, le=99)
    leech_action: Optional[Literal["tag", "suspend"]] = None


# ─────────────────────────────────────────────────────────────────────────────
# Daily Activity Tracking
# ─────────────────────────────────────────────────────────────────────────────

class DailyActivitySchema(FromAttributesModel):
    id: int
    child_id: int
    activity_date: date
    activity_type: str  # lesson | review | quiz | coding
    activity_title: str
    activity_id: Optional[int] = None
    result_score: Optional[float] = None
    result_details: Optional[Dict[str, Any]] = None
    duration_seconds: Optional[int] = None
    created_at: datetime


class DailyActivityCreateSchema(BaseModel):
    activity_type: str  # lesson | review | quiz | coding
    activity_title: str
    activity_id: Optional[int] = None
    result_score: Optional[float] = None
    result_details: Optional[Dict[str, Any]] = None
    duration_seconds: Optional[int] = None


class DailyActivitySummarySchema(BaseModel):
    activity_date: date
    total_activities: int
    activities_by_type: Dict[str, int]  # ex: {"lesson": 1, "review": 3, "quiz": 1}
    activities: List[DailyActivitySchema] = Field(default_factory=list)
    fsrs_parameters: Optional[str] = Field(default=None, max_length=400)


class DeckStatsSchema(BaseModel):
    total: int = 0
    new: int = 0
    learning: int = 0
    review_due: int = 0
    new_left_today: int = 0
    reviews_left_today: int = 0


class DeckCardSchema(BaseModel):
    review_item_id: int
    flashcard_id: int
    topic_id: int
    topic_title: str
    front: str
    back: str
    code_example: Optional[str] = None
    state: str
    due: datetime
    interval_label: str
    reps: int
    lapses: int
    suspended: bool = False
    is_leech: bool = False


class DeckOverviewSchema(BaseModel):
    subject_id: int
    subject_name: str
    config: DeckConfigSchema
    stats: DeckStatsSchema
    cards: List[DeckCardSchema]


class DeckStudyCardSchema(BaseModel):
    review_item_id: int
    flashcard_id: int
    topic_title: str
    front: str
    back: str
    code_example: Optional[str] = None
    state: str
    previews: Dict[str, str]


class DeckStudySessionSchema(BaseModel):
    stats: DeckStatsSchema
    items: List[DeckStudyCardSchema]


class DeckAttemptSchema(BaseModel):
    review_item_id: int
    rating: Literal["again", "hard", "good", "easy"]


class DeckAttemptResultSchema(BaseModel):
    review_item_id: int
    state: str
    next_review: datetime
    interval_label: str
    stats: DeckStatsSchema


class CreateDeckCardSchema(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)
    topic_id: Optional[int] = None

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
    avoid_topics: List[str] = Field(default_factory=list, max_length=100)
    context: Optional[str] = Field(default=None, max_length=1000)
    api_key: Optional[str] = Field(default=None, max_length=500)
    provider: str = Field(default="gemini", max_length=40)
    generation_mode: Literal["discovery", "topic", "lesson"] = "discovery"


class GeneratedFlashcardSchema(BaseModel):
    topic: str
    answer: str
    code_example: Optional[str] = Field(default=None, max_length=3000)


class GenerateFlashcardsResponseSchema(BaseModel):
    subject: str
    flashcards: list[GeneratedFlashcardSchema]
