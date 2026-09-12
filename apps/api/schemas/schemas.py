from datetime import date, datetime
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator

class FromAttributesModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ChildProfileSchema(FromAttributesModel):
    id: int
    user_id: Optional[int] = None
    name: str
    # Derived from birth_date when the profile has one; see services/audience.py.
    age_group: str
    birth_date: Optional[date] = None
    age: Optional[int] = None
    # True when this profile belongs to a minor, so the client can show the
    # supervision clause the terms of use state — the text comes with it.
    requires_adult_supervision: bool = False
    supervision_notice: Optional[str] = None
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
    front_translation: Optional[str] = None
    supporting_example_translation: Optional[str] = None
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
    front_translation: Optional[str] = Field(default=None, max_length=500)
    supporting_example_translation: Optional[str] = Field(default=None, max_length=1000)


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


class QuizAnswerSchema(BaseModel):
    """One answer sent when a quiz is finished, for the activity timeline."""

    question_number: int = Field(ge=1, le=200)
    question: str = Field(min_length=1, max_length=1000)
    selected_option: str = Field(min_length=1, max_length=500)
    correct: bool


class QuizSubmitSchema(BaseModel):
    lesson_id: int
    score: int
    total_questions: int
    answers: List[QuizAnswerSchema] = Field(default_factory=list, max_length=200)

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
    prompt_translation: Optional[str] = None
    supporting_example_translation: Optional[str] = None
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
    # True when the day closed by studying (a finished session or logged
    # activity) rather than by somebody typing a note about it.
    closed_by_activity: bool = False
    activity_count: int = 0
    pomodoro_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class StudyQueueItemSchema(BaseModel):
    """One card of the study queue.

    Deliberately loose: four card kinds share it, and the session stores exactly
    what it hands back, so a card built last night still renders tomorrow.
    """

    kind: Literal["lesson_item", "vocabulary", "lesson_question", "study_question"]
    ref_id: int
    source_label: str = ""
    topic_title: str = ""
    prompt: str = ""
    answer: str = ""
    options: List[str] = Field(default_factory=list)
    correct_option: Optional[str] = None
    explanation: Optional[str] = None
    example: Optional[str] = None
    example_translation: Optional[str] = None
    supporting_example: Optional[str] = None
    prompt_translation: Optional[str] = None
    audio_text: Optional[str] = None
    lesson_id: Optional[int] = None
    # The review endpoint identifies a vocabulary card by its word pair.
    word_en: Optional[str] = None
    word_pt: Optional[str] = None


class StudySessionSchema(BaseModel):
    id: int
    status: str
    session_date: date
    position: int = 0
    total: int = 0
    answered_count: int = 0
    correct_count: int = 0
    items: List[StudyQueueItemSchema] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class StudySessionStateSchema(BaseModel):
    """What the home screen needs to decide between starting and continuing."""

    has_session: bool = False
    session_id: Optional[int] = None
    position: int = 0
    total: int = 0
    remaining: int = 0
    answered_count: int = 0
    correct_count: int = 0
    session_date: Optional[date] = None
    updated_at: Optional[datetime] = None
    next_label: str = ""
    due_review: int = 0
    pending_questions: int = 0
    lesson_pending: bool = False


class StudySessionProgressSchema(BaseModel):
    position: int = Field(ge=0, le=500)
    answered_count: Optional[int] = Field(default=None, ge=0, le=500)
    correct_count: Optional[int] = Field(default=None, ge=0, le=500)


class StudySessionFinishSchema(BaseModel):
    answered_count: Optional[int] = Field(default=None, ge=0, le=500)
    correct_count: Optional[int] = Field(default=None, ge=0, le=500)


class StudySessionFinishResultSchema(BaseModel):
    session_id: int
    answered_count: int
    correct_count: int
    day_closed: bool
    study_date: date


class PlacementQuestionSchema(BaseModel):
    level: int
    question: str
    options: List[str] = Field(default_factory=list)
    correct_option: str


class OnboardingStateSchema(BaseModel):
    completed: bool = False
    child_count: int = 0
    child_name: str = ""
    birth_date: Optional[date] = None
    target_language: str = "English"
    placement_available: bool = False


class CompleteOnboardingSchema(BaseModel):
    child_name: str = Field(min_length=1, max_length=80)
    age_group: str = Field(default="18+", min_length=1, max_length=20)
    birth_date: Optional[date] = None
    target_language: str = Field(default="English", min_length=1, max_length=40)
    # Levels of the placement questions the child answered correctly. Empty is a
    # valid answer: it means "start at the beginning".
    correct_levels: List[int] = Field(default_factory=list, max_length=20)
    skipped_placement: bool = False


class OnboardingResultSchema(BaseModel):
    child_id: int
    child_name: str
    level: int
    level_pinned: bool
    target_language: str
    age_group: str = "18+"
    requires_adult_supervision: bool = False


class QuestionSubjectMetricsSchema(BaseModel):
    subject_id: int
    subject_name: str
    resolved_count: int = 0
    correct_count: int = 0
    error_count: int = 0
    accuracy_percent: int = 0


class StudyDashboardSchema(BaseModel):
    today: StudyDaySchema
    recent_days: List[StudyDaySchema] = Field(default_factory=list)
    study_streak_count: int = 0
    last_study_date: Optional[date] = None
    question_metrics: List[QuestionSubjectMetricsSchema] = Field(default_factory=list)


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


class LevelLabelSchema(BaseModel):
    level: int
    label: str


class LevelAnalysisSchema(BaseModel):
    level: int
    label: str
    vocabulary_learned: int
    quiz_accuracy: float
    avg_review_difficulty: float
    next_level_at: int  # questions answered needed to reach the next level
    target_language: str = "English"
    questions_answered: int = 0
    is_manual_level: bool = False
    min_level: int = 1
    max_level: int = 10
    level_labels: list[LevelLabelSchema] = Field(default_factory=list)


class SetChildLevelSchema(BaseModel):
    # None hands the level back to the automatic, questions-answered ladder.
    level: Optional[int] = None


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
    level: int = Field(default=0, ge=0, le=10)   # 0 = usa o nivel atual do estudante
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


class GeneratedProgrammingQuestionSchema(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    options: List[str] = Field(min_length=4, max_length=4)
    correct_option: str = Field(min_length=1, max_length=500)
    explanation: str = Field(min_length=1, max_length=2000)


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
    context: Optional[str] = None
    icon_emoji: Optional[str] = None
    created_at: datetime
    topic_count: int = 0
    studied_count: int = 0
    due_review_count: int = 0


class CreateProgrammingSubjectSchema(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    context: Optional[str] = Field(default=None, max_length=2000)
    icon_emoji: Optional[str] = Field(default=None, max_length=10)


class UpdateProgrammingSubjectSchema(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    context: Optional[str] = Field(default=None, max_length=2000)
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
    has_summary: bool = False


class CreateProgrammingTopicSchema(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    order_index: Optional[int] = None
    generate_ai: bool = False
    context: Optional[str] = Field(default=None, max_length=1000)


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


class GenerateProgrammingQuestionsSchema(BaseModel):
    context: Optional[str] = Field(default=None, max_length=1000)


class ProgrammingQuestionAttemptSchema(BaseModel):
    selected_option: str = Field(min_length=1, max_length=500)


class ProgrammingQuestionAttemptResultSchema(BaseModel):
    question_id: int
    correct: bool
    attempt_count: int
    correct_count: int
    error_count: int
    last_selected_option: str
    last_answered_at: datetime


# ── Exam simulado ─────────────────────────────────────────────────────────────

class ExamDomainSchema(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    weight: float = Field(gt=0, le=1)


class ExamSchema(FromAttributesModel):
    id: int
    code: str
    name: str
    subject_id: Optional[int] = None
    question_count: int
    duration_minutes: int
    passing_percent: int
    domains: List[ExamDomainSchema] = Field(default_factory=list)
    created_at: datetime


class ExamPoolDomainSchema(BaseModel):
    name: str
    weight: float
    available: int
    target: int


class ExamOverviewSchema(BaseModel):
    exam: ExamSchema
    pool_size: int
    pool_by_domain: List[ExamPoolDomainSchema] = Field(default_factory=list)
    best_score_percent: Optional[int] = None
    attempts_count: int = 0
    # Set while a sitting is open, so the list offers to continue it.
    active_attempt_id: Optional[int] = None
    active_seconds_remaining: Optional[int] = None


class ExamQuestionSchema(FromAttributesModel):
    """Full question, answer key included. Only ever returned after a sitting ends."""

    id: int
    exam_id: int
    domain: str
    question: str
    options: List[str] = Field(default_factory=list)
    correct_options: List[str] = Field(default_factory=list)
    response_type: str
    explanation: str
    reference_url: Optional[str] = None
    difficulty: str
    created_at: datetime


class ExamAttemptQuestionSchema(BaseModel):
    """What the client may see while the sitting is open.

    Deliberately carries no answer key and no explanation: sending either during
    an attempt would hand over the exam.
    """

    id: int
    order_index: int
    domain: str
    question: str
    options: List[str] = Field(default_factory=list)
    response_type: str


class ExamAttemptSchema(FromAttributesModel):
    id: int
    exam_id: int
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    question_count: int
    correct_count: int
    score_percent: Optional[int] = None
    passed: Optional[bool] = None
    domain_breakdown: Dict[str, Dict[str, int]] = Field(default_factory=dict)


class ExamAttemptAnswerStateSchema(BaseModel):
    """What was already marked, so a resumed sitting comes back filled in."""

    exam_question_id: int
    selected_options: List[str] = Field(default_factory=list)


class ExamAttemptStartSchema(BaseModel):
    attempt: ExamAttemptSchema
    exam: ExamSchema
    questions: List[ExamAttemptQuestionSchema] = Field(default_factory=list)
    answers: List[ExamAttemptAnswerStateSchema] = Field(default_factory=list)
    # Counted from the attempt's start, not from when this screen opened.
    seconds_remaining: int = 0
    resumed: bool = False


class ExamAnswerSchema(BaseModel):
    exam_question_id: int
    selected_options: List[str] = Field(default_factory=list, max_length=6)


class ExamAttemptReviewItemSchema(BaseModel):
    question: ExamQuestionSchema
    selected_options: List[str] = Field(default_factory=list)
    correct: bool


class ExamAttemptResultSchema(BaseModel):
    attempt: ExamAttemptSchema
    exam: ExamSchema
    review: List[ExamAttemptReviewItemSchema] = Field(default_factory=list)


class CreateExamSchema(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(default="", max_length=40)
    subject_id: Optional[int] = None
    question_count: int = Field(default=20, ge=1, le=300)
    passing_percent: int = Field(default=70, ge=1, le=100)
    # Empty means a general simulado: no per-domain blueprint, just the pool.
    domains: List[ExamDomainSchema] = Field(default_factory=list, max_length=12)


ExamSourceArea = Literal["coding", "diverse", "english"]


class ExamSourceSchema(BaseModel):
    """A subject that already has multiple-choice questions a simulado can use."""

    area: ExamSourceArea
    # Programming subjects only; the other areas are identified by name.
    subject_id: Optional[int] = None
    subject_name: str
    question_count: int
    # The simulado already built from this subject, if any.
    exam_id: Optional[int] = None


class CreateExamFromSubjectSchema(BaseModel):
    area: ExamSourceArea
    subject_id: Optional[int] = None
    subject_name: str = Field(default="", max_length=120)
    question_count: int = Field(default=20, ge=1, le=300)
    passing_percent: int = Field(default=70, ge=1, le=100)


class ExamFromSubjectResultSchema(BaseModel):
    exam: ExamSchema
    imported: int
    skipped: int
    pool_size: int


# ── Study questions (diverse subjects and English) ────────────────────────────

StudyQuestionArea = Literal["diverse", "english"]


class StudyQuestionSchema(FromAttributesModel):
    id: int
    area: StudyQuestionArea
    subject_name: str
    topic_key: str
    topic_title: str
    question: str
    options: List[str] = Field(default_factory=list)
    correct_option: str
    explanation: str
    attempt_count: int = 0
    correct_count: int = 0
    error_count: int = 0
    last_selected_option: Optional[str] = None
    last_answered_at: Optional[datetime] = None
    created_at: datetime


class GenerateStudyQuestionsSchema(BaseModel):
    area: StudyQuestionArea
    subject_name: str = Field(min_length=1, max_length=120)
    topic_key: str = Field(min_length=1, max_length=120)
    topic_title: str = Field(min_length=1, max_length=300)
    context: Optional[str] = Field(default=None, max_length=1000)


class EnsureStudyQuestionsSchema(BaseModel):
    """Ask for the free, lesson-derived question bank for one topic."""

    area: StudyQuestionArea
    subject_name: str = Field(min_length=1, max_length=120)
    topic_key: str = Field(min_length=1, max_length=120)
    topic_title: str = Field(min_length=1, max_length=300)


class PrefetchStudyQuestionsSchema(EnsureStudyQuestionsSchema):
    """Top the topic up in the background so nobody waits for the provider."""

    threshold: int = Field(default=3, ge=1, le=20)


class PrefetchStudyQuestionsResultSchema(BaseModel):
    scheduled: bool
    pending: int
    reason: str = ""


class StudyQuestionAttemptSchema(BaseModel):
    selected_option: str = Field(min_length=1, max_length=500)


class StudyQuestionAttemptResultSchema(BaseModel):
    question_id: int
    correct: bool
    attempt_count: int
    correct_count: int
    error_count: int
    last_selected_option: str
    last_answered_at: datetime


class DeepenCodingReadingRequestSchema(BaseModel):
    step_type: Literal["section", "quiz"]
    title: Optional[str] = Field(default=None, max_length=300)
    body: Optional[str] = Field(default=None, max_length=5000)
    code_example: Optional[str] = Field(default=None, max_length=3000)
    question: Optional[str] = Field(default=None, max_length=1000)
    options: List[str] = Field(default_factory=list, max_length=8)
    correct_option: Optional[str] = Field(default=None, max_length=500)
    explanation: Optional[str] = Field(default=None, max_length=2000)
    user_question: Optional[str] = Field(default=None, max_length=1000)


class DeepenCodingReadingResponseSchema(BaseModel):
    content: str


class TopicSummarySchema(BaseModel):
    """The revision sheet of a single topic, stored without its heading."""

    topic_id: int
    title: str
    content: str
    # When the stored sheet was last written. The reader sees this so a reused
    # sheet is visibly reused instead of looking like a fresh generation.
    updated_at: Optional[datetime] = None


class UpdateTopicSummarySchema(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class PendingSummaryTopicSchema(BaseModel):
    """A topic whose sheet still has to be generated before the join."""

    topic_id: int
    title: str


class SubjectSummaryResponseSchema(BaseModel):
    """Every topic sheet of a subject, joined in study order."""

    content: str
    topic_count: int
    summarized_count: int
    pending: List[PendingSummaryTopicSchema] = Field(default_factory=list)
    # Number of AI calls needed to complete the sheet right now. Existing
    # topic summaries are reused and therefore do not consume credits.
    estimated_credits: int = 0


class ProgrammingFlashcardSchema(FromAttributesModel):
    id: int
    topic_id: int
    subject_id: int
    front: str
    back: str
    code_example: Optional[str] = None
    created_at: datetime


class ProgrammingQuestionSchema(FromAttributesModel):
    id: int
    topic_id: int
    subject_id: int
    question: str
    options: List[str] = Field(default_factory=list)
    correct_option: str
    explanation: str
    attempt_count: int = 0
    correct_count: int = 0
    error_count: int = 0
    last_selected_option: Optional[str] = None
    last_answered_at: Optional[datetime] = None
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
    activity_type: str  # read API: lesson | question | review | exam | coding | leetcode
    activity_title: str
    activity_id: Optional[int] = None
    result_score: Optional[float] = None
    result_details: Optional[Dict[str, Any]] = None
    duration_seconds: Optional[int] = None
    created_at: datetime


class DailyActivityCreateSchema(BaseModel):
    activity_type: str  # raw storage type; read endpoints normalize it for the dashboard
    activity_title: str
    activity_id: Optional[int] = None
    result_score: Optional[float] = None
    result_details: Optional[Dict[str, Any]] = None
    duration_seconds: Optional[int] = None


class DailyActivitySummarySchema(BaseModel):
    activity_date: date
    total_activities: int
    activities_by_type: Dict[str, int]  # ex: {"lesson": 1, "question": 3, "review": 1}
    activities: List[DailyActivitySchema] = Field(default_factory=list)
    fsrs_parameters: Optional[str] = Field(default=None, max_length=400)
    total_duration_seconds: int = 0
    average_score: Optional[float] = None
    first_activity_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    questions_answered: int = 0
    topics_studied: int = 0
    subjects_studied: int = 0
    subject_names: List[str] = Field(default_factory=list)
    topic_names: List[str] = Field(default_factory=list)


class ActivityPeriodSummarySchema(BaseModel):
    """Aggregated activity for a selectable calendar period."""

    period: Literal["day", "month", "year", "all"]
    start_date: Optional[date] = None
    end_date: date
    total_activities: int = 0
    questions_answered: int = 0
    topics_studied: int = 0
    subjects_studied: int = 0
    subject_names: List[str] = Field(default_factory=list)
    topic_names: List[str] = Field(default_factory=list)
    activities_by_type: Dict[str, int] = Field(default_factory=dict)
    total_duration_seconds: int = 0


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
    # The real rule lives in services/password_policy.py so that the message can
    # name what is missing; this bound only keeps absurd input out of hashing.
    password: str = Field(min_length=8, max_length=128)
    child_name: Optional[str] = Field(default=None, max_length=80)
    # Asked for at signup: it decides whether this is a minor's profile, and with
    # it whether the supervision clause in the terms applies.
    birth_date: Optional[date] = None
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
    # "pending" until the administrator approves the account; the administrator
    # themselves is always reported as approved.
    status: str = "pending"
    is_admin: bool = False
    # Which optional modules this account switched on. The frontend hides the
    # navigation for anything switched off.
    modules: dict[str, bool] = {}


class PlanSchema(BaseModel):
    code: str
    name: str
    description: str
    price_cents: int
    currency: str
    interval: str
    # -1 means unlimited, in both fields.
    max_children: int
    monthly_ai_generations: int
    trial_days: int


class SubscriptionSchema(BaseModel):
    plan: PlanSchema
    status: str
    trial_ends_at: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    children_used: int = 0
    generations_used: int = 0
    generations_remaining: int = 0
    # What the account has cost so far this month, in the platform's currency.
    month_cost_cents: int = 0
    provider: str = "none"


class CheckoutRequestSchema(BaseModel):
    plan_code: str


class CheckoutResponseSchema(BaseModel):
    checkout_url: Optional[str] = None
    detail: str


class RuntimeTtsBackendSchema(BaseModel):
    """Where Kokoro is reachable, published by the machine hosting the tunnel."""

    base_url: str


class EmailRequestSchema(BaseModel):
    email: str


class VerifyEmailSchema(BaseModel):
    token: str


class PasswordResetRequestSchema(BaseModel):
    token: str
    password: str


class PasswordChangeSchema(BaseModel):
    current_password: str
    new_password: str


class AccountDeleteSchema(BaseModel):
    password: str


class ModuleSchema(BaseModel):
    id: str
    label: str
    description: str
    enabled: bool
    locked: bool = False


class ModuleSettingsSchema(BaseModel):
    modules: list[ModuleSchema]


class ModuleSettingsUpdateSchema(BaseModel):
    # Only the switches being changed need to be sent.
    modules: dict[str, bool]


class AdminUserReviewSchema(BaseModel):
    note: Optional[str] = Field(default=None, max_length=300)


class AdminAICreditsSchema(BaseModel):
    """Either set the balance outright or add to it, and/or flip unlimited."""

    credits: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    add: Optional[int] = Field(default=None, ge=-1_000_000, le=1_000_000)
    daily_limit: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    unlimited: Optional[bool] = None


class AIProviderSchema(BaseModel):
    id: str
    label: str
    default_model: str
    requires_base_url: bool = False
    is_default: bool = False


class UserAISettingsSchema(BaseModel):
    provider: str = "gemini"
    model: str = "gemini-3.1-flash-lite"
    base_url: Optional[str] = None
    has_api_key: bool = False
    api_key_preview: Optional[str] = None
    use_global_key: bool = False


class UserAISettingsUpdateSchema(BaseModel):
    provider: str = Field(default="gemini", max_length=40)
    api_key: Optional[str] = Field(default=None, max_length=500)
    model: Optional[str] = Field(default=None, max_length=120)
    base_url: Optional[str] = Field(default=None, max_length=300)
    use_global_key: Optional[bool] = None

class ParentSettingsUpdateSchema(BaseModel):
    child_name: Optional[str] = None
    age_group: Optional[str] = None
    birth_date: Optional[date] = None
    voice_preference: Optional[str] = None
    auto_audio: Optional[bool] = None
    rhythm: Optional[str] = None
    target_language: Optional[str] = Field(default=None, max_length=40)


class CreateChildProfileSchema(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    # Optional now that the birth date decides the band; kept for callers that
    # still send it, and used as the fallback when no date is given.
    age_group: str = Field(default="18+", min_length=1, max_length=20)
    birth_date: Optional[date] = None
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
