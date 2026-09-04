from datetime import date, datetime
from enum import Enum as PyEnum
from typing import Optional, Dict, Any
from sqlalchemy import Index, Text, UniqueConstraint
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
    # A new signup waits for the administrator: only "approved" reaches the app.
    status: str = Field(
        default="pending",
        max_length=20,
        index=True,
        sa_column_kwargs={"server_default": "pending"},
    )
    reviewed_at: Optional[datetime] = Field(default=None)
    reviewed_by_user_id: Optional[int] = Field(default=None)
    review_note: Optional[str] = Field(default=None, max_length=300)
    # AI credits meter the administrator's own key: one credit per successful
    # generation. They are ignored for an account using its own API key, which
    # costs the administrator nothing.
    ai_credits: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    ai_credits_used: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    ai_unlimited: bool = Field(default=False, sa_column_kwargs={"server_default": "false"})
    # "YYYY-MM" the plan allowance was last credited for, so a paid plan tops
    # the balance up once a period instead of on every generation.
    ai_credits_period: Optional[str] = Field(default=None, max_length=7)
    # Brute-force brake. The lock is short and self-healing on purpose: a
    # permanent one would let anybody lock a real person out just by guessing
    # their e-mail and failing on purpose.
    failed_login_attempts: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    locked_until: Optional[datetime] = Field(default=None)
    # Optional product modules the account switched on or off. Empty means "use
    # the defaults", which keeps the programming side out of the way until
    # somebody asks for it. See services/modules.py.
    enabled_modules: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    # Set once the person proves they own the address. Self-service signup uses
    # this instead of the administrator's queue as the anti-spam barrier.
    email_verified_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuthToken(SQLModel, table=True):
    """One-time token for e-mail verification and password reset.

    Stored as a hash for the same reason session tokens are: a leaked database
    should not hand over working links. A token is spent the moment it is used,
    and every other token of the same purpose for that account is spent with it.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    purpose: str = Field(max_length=40, index=True)
    token_hash: str = Field(unique=True, index=True)
    expires_at: datetime
    used_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Subscription(SQLModel, table=True):
    """What an account is entitled to, and who is paying for it.

    One row per account. An account with no row is on the free plan: the
    absence of a subscription is a valid state, not a missing one, so nothing
    has to be created at signup for the app to work.
    """

    __table_args__ = (UniqueConstraint("user_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    plan_code: str = Field(max_length=40, index=True)
    # trialing | active | past_due | canceled
    status: str = Field(default="active", max_length=20, index=True)
    # "none" while the gateway is not configured: the plan still applies, it is
    # simply not being charged for yet.
    provider: str = Field(default="none", max_length=40)
    provider_customer_id: Optional[str] = Field(default=None, max_length=120, index=True)
    provider_subscription_id: Optional[str] = Field(default=None, max_length=120, index=True)
    trial_ends_at: Optional[datetime] = Field(default=None)
    current_period_start: Optional[datetime] = Field(default=None)
    current_period_end: Optional[datetime] = Field(default=None)
    cancel_at_period_end: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UsageRecord(SQLModel, table=True):
    """One line per billable thing an account did.

    Without this there is no answer to "what did this account cost us", which is
    the number that decides whether a plan price is a business or a donation.
    Kept as raw lines rather than a running total so a wrong price or a bad
    month can be recomputed instead of argued about.
    """

    __table_args__ = (
        Index("ix_usagerecord_user_period", "user_id", "period_key"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # ai_generation | tts
    kind: str = Field(max_length=40, index=True)
    provider: str = Field(default="", max_length=40)
    model: str = Field(default="", max_length=120)
    tokens_in: int = Field(default=0)
    tokens_out: int = Field(default=0)
    # Millionths of a currency unit: an AI call can cost less than a cent, and
    # rounding each one to a cent turns a real bill into zero.
    cost_micros: int = Field(default=0)
    # "YYYY-MM" of the account's billing period, so a month's usage is one index
    # lookup rather than a date range scan.
    period_key: str = Field(max_length=7, index=True)
    occurred_at: datetime = Field(default_factory=datetime.utcnow)


class AppConfig(SQLModel, table=True):
    """Small pieces of configuration that change while the app is running.

    Environment variables are fixed for the life of a deployment, which is fine
    for almost everything and wrong for one thing: the address of a tunnel that
    rotates every time it is restarted. That value has to be writable by the
    machine hosting the tunnel and readable by the server, so it lives here.
    """

    key: str = Field(primary_key=True, max_length=64)
    value: str = Field(max_length=1000)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RateLimitCounter(SQLModel, table=True):
    """One row per (rule, subject, time bucket) so the limit is shared.

    The bucket start is an epoch integer rather than a timestamp: it keeps the
    arithmetic in Python, makes the composite key cheap, and sidesteps every
    timezone question. See services/rate_limit.py for how two adjacent buckets
    are weighted into a sliding window.
    """

    __table_args__ = (Index("ix_ratelimitcounter_expires_at", "expires_at"),)

    rule: str = Field(primary_key=True, max_length=40)
    subject: str = Field(primary_key=True, max_length=200)
    window_start: int = Field(primary_key=True)
    hits: int = Field(default=0)
    expires_at: datetime = Field(default_factory=datetime.utcnow)


class BillingEvent(SQLModel, table=True):
    """Gateway webhooks already handled.

    Gateways retry, and a retried "subscription canceled" that runs twice is
    harmless while a retried "payment succeeded" that extends the period twice
    is not. The unique id is what makes handling idempotent.
    """

    __table_args__ = (UniqueConstraint("provider", "provider_event_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    provider: str = Field(max_length=40)
    provider_event_id: str = Field(max_length=200, index=True)
    event_type: str = Field(max_length=80)
    received_at: datetime = Field(default_factory=datetime.utcnow)


class UserAISettings(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    provider: str = Field(default="gemini", max_length=40)
    api_key_encrypted: str
    use_global_key: bool = Field(default=False)
    model: str = Field(default="gemini-3.1-flash-lite", max_length=120)
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


class LessonQuestion(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "child_id",
            "lesson_id",
            "front_key",
            name="uq_lessonquestion_child_lesson_front_key",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    lesson_id: int = Field(foreign_key="lesson.id", index=True)
    target_language: str = Field(max_length=40)
    question_type: str = Field(max_length=40)
    front: str = Field(max_length=500)
    front_key: str = Field(max_length=64)
    back: str = Field(max_length=2000)
    supporting_example: Optional[str] = Field(default=None, max_length=1000)
    difficulty_score: float = Field(default=0.45)
    attempt_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    error_count: int = Field(default=0)
    streak: int = Field(default=0)
    last_reviewed: Optional[datetime] = Field(default=None)
    next_review: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
    pomodoro_count: int = Field(default=0)
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
    context: Optional[str] = Field(default=None, max_length=2000)
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
    # Revision sheet for this topic. The subject sheet is the join of these, so
    # it is generated once and reread instead of costing an AI call per visit.
    summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    summary_updated_at: Optional[datetime] = Field(default=None)
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


class ProgrammingQuestion(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("topic_id", "question_key"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    topic_id: int = Field(foreign_key="programmingtopic.id", index=True)
    subject_id: int = Field(foreign_key="programmingsubject.id", index=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    question: str = Field(min_length=1, max_length=1000)
    question_key: str = Field(min_length=1, max_length=64)
    options: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    correct_option: str = Field(min_length=1, max_length=500)
    explanation: str = Field(min_length=1, max_length=2000)
    attempt_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    error_count: int = Field(default=0)
    last_selected_option: Optional[str] = Field(default=None, max_length=500)
    last_answered_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Exam(SQLModel, table=True):
    """A certification blueprint: how many questions a sitting draws, and from where.

    Distinct from ProgrammingTopic on purpose. A topic is a theme you study; an
    exam is a rehearsal you sit, scored once per attempt against a pass mark.
    """

    __table_args__ = (UniqueConstraint("child_id", "name", name="uq_exam_child_name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    subject_id: Optional[int] = Field(default=None, foreign_key="programmingsubject.id", index=True)
    code: str = Field(min_length=1, max_length=40)  # DVA-C02
    name: str = Field(min_length=1, max_length=200)
    question_count: int = Field(default=65)
    duration_minutes: int = Field(default=130)
    passing_percent: int = Field(default=72)
    # [{"name": "Security", "weight": 0.26}, ...]
    domains: list = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ExamQuestion(SQLModel, table=True):
    """Exam-style question: 4-6 options and one *or more* correct answers.

    ProgrammingQuestion holds a single correct_option, which cannot express the
    "choose TWO" items the real certification exams ask.
    """

    __table_args__ = (UniqueConstraint("exam_id", "question_key", name="uq_examquestion_identity"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    exam_id: int = Field(foreign_key="exam.id", index=True)
    domain: str = Field(min_length=1, max_length=120, index=True)
    question: str = Field(min_length=1, max_length=1000)
    question_key: str = Field(min_length=1, max_length=64)
    options: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    correct_options: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    response_type: str = Field(default="single", max_length=20)  # single | multiple
    explanation: str = Field(min_length=1, max_length=2000)
    reference_url: Optional[str] = Field(default=None, max_length=500)
    difficulty: str = Field(default="medium", max_length=20)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExamAttempt(SQLModel, table=True):
    """One sitting. This is what the questions mode cannot represent."""

    id: Optional[int] = Field(default=None, primary_key=True)
    exam_id: int = Field(foreign_key="exam.id", index=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    status: str = Field(default="in_progress", max_length=20)  # in_progress | finished | expired
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = Field(default=None)
    duration_seconds: Optional[int] = Field(default=None)
    question_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    score_percent: Optional[int] = Field(default=None)
    passed: Optional[bool] = Field(default=None)
    # {"Security": {"total": 17, "correct": 12}}
    domain_breakdown: dict = Field(default_factory=dict, sa_column=Column(JSON))


class ExamAttemptAnswer(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("attempt_id", "exam_question_id", name="uq_examattemptanswer_identity"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_id: int = Field(foreign_key="examattempt.id", index=True)
    exam_question_id: int = Field(foreign_key="examquestion.id", index=True)
    # Position in the drawn sitting, so the questions can be replayed in order.
    order_index: int = Field(default=0)
    selected_options: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    correct: bool = Field(default=False)
    answered_at: Optional[datetime] = Field(default=None)


class StudyQuestion(SQLModel, table=True):
    """Multiple-choice question for study areas outside the programming curriculum.

    ProgrammingQuestion hangs off ProgrammingTopic, but the "diverse" and English
    areas have no relational subject entity: a diverse subject is a name inside a
    per-day JSON blob and an English topic is a Lesson. So questions here are keyed
    by the natural identifiers those areas already use, which is also what keeps a
    subject's questions alive across days.
    """

    __table_args__ = (
        UniqueConstraint(
            "child_id",
            "area",
            "subject_name",
            "topic_key",
            "question_key",
            name="uq_studyquestion_identity",
        ),
        Index("ix_studyquestion_child_area_subject", "child_id", "area", "subject_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    # diverse | english
    area: str = Field(max_length=20)
    subject_name: str = Field(min_length=1, max_length=120)
    topic_key: str = Field(min_length=1, max_length=120)
    topic_title: str = Field(min_length=1, max_length=300)
    question: str = Field(min_length=1, max_length=1000)
    question_key: str = Field(min_length=1, max_length=64)
    options: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    correct_option: str = Field(min_length=1, max_length=500)
    explanation: str = Field(min_length=1, max_length=2000)
    attempt_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    error_count: int = Field(default=0)
    last_selected_option: Optional[str] = Field(default=None, max_length=500)
    last_answered_at: Optional[datetime] = Field(default=None)
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
    # ── FSRS (Anki-style) scheduling state ──────────────────────────────────
    # state: new | learning | review | relearning
    fsrs_state: str = Field(default="new", max_length=12)
    stability: float = Field(default=0.0)
    fsrs_difficulty: float = Field(default=0.0)  # FSRS difficulty 1..10
    reps: int = Field(default=0)
    lapses: int = Field(default=0)
    learning_step: int = Field(default=0)
    scheduled_days: int = Field(default=0)
    last_rating: Optional[str] = Field(default=None, max_length=8)
    suspended: bool = Field(default=False)
    is_leech: bool = Field(default=False)


class CodingDeckConfig(SQLModel, table=True):
    """Per-subject Anki-style flashcard deck options (one per child + subject)."""

    __table_args__ = (UniqueConstraint("child_id", "subject_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    subject_id: int = Field(foreign_key="programmingsubject.id", index=True)
    new_per_day: int = Field(default=20)
    max_reviews_per_day: int = Field(default=200)
    # learning/relearning steps in minutes, space-separated (Anki format)
    learning_steps: str = Field(default="1 10", max_length=120)
    relearning_steps: str = Field(default="10", max_length=120)
    graduating_interval: int = Field(default=1)  # days
    easy_interval: int = Field(default=4)         # days
    desired_retention: float = Field(default=0.9)
    maximum_interval: int = Field(default=36500)  # days
    # new card insertion order: sequential | random
    insertion_order: str = Field(default="sequential", max_length=12)
    new_cards_ignore_review_limit: bool = Field(default=False)
    leech_threshold: int = Field(default=8)
    leech_action: str = Field(default="tag", max_length=12)  # tag | suspend
    # FSRS weights override (empty = use defaults); 19 comma/space separated values
    fsrs_parameters: str = Field(default="", max_length=400)
    # Daily counters (reset when counter_date != today)
    counter_date: Optional[date] = Field(default=None)
    new_done_today: int = Field(default=0)
    reviews_done_today: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DailyActivity(SQLModel, table=True):
    """Registra cada atividade estudada no dia (aulas, reviews, quizzes, codificação)."""
    __table_args__ = (Index("ix_daily_activity_child_id_activity_date", "child_id", "activity_date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    activity_date: date = Field(index=True)  # data da atividade
    activity_type: str = Field(max_length=40, index=True)  # lesson | review | quiz | coding
    activity_title: str = Field(max_length=200)  # ex: "Lesson 1: Colors", "Quiz: Day 5"
    activity_id: Optional[int] = Field(default=None)  # ID da lição/quiz/item relacionado
    result_score: Optional[float] = Field(default=None)  # pontuação (0-100) ou tempo gasto
    result_details: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))  # dados adicionais
    duration_seconds: Optional[int] = Field(default=None)  # tempo gasto em segundos
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LeetCodeMethod(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    name: str = Field(max_length=200)
    category: Optional[str] = Field(default=None, max_length=80)
    language: str = Field(default="TypeScript", max_length=40)
    explanation: str = ""
    code_example: str = ""
    example_output: str = ""
    complexity_time: Optional[str] = Field(default=None, max_length=60)
    complexity_space: Optional[str] = Field(default=None, max_length=60)
    order_index: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
