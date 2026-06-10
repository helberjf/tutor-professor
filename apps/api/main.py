import base64
import hashlib
import json
import os
import re
import secrets
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import requests
from cryptography.fernet import Fernet, InvalidToken

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from models.database import AdminFlashcard, Book, BookPage, ChildLessonProgress, ChildProfile, CodingDay, CodingReviewItem, DiverseDay, Lesson, LessonItem, ProgrammingFlashcard, ProgrammingSubject, ProgrammingTopic, QuizAttempt, ReviewItem, StudyDay, User, UserAISettings, UserSession
from schemas.schemas import (
    AIProviderSchema,
    BookPageSchema,
    BookSchema,
    BookSummarySchema,
    ChatRequestSchema,
    ChatResponseSchema,
    ChildProgressSummarySchema,
    ChildProfileSchema,
    CreateChildProfileSchema,
    GenerateBookRequestSchema,
    GenerateFlashcardsRequestSchema,
    GenerateFlashcardsResponseSchema,
    GeneratedFlashcardSchema,
    GenerateLessonRequestSchema,
    GenerateLessonResponseSchema,
    LevelAnalysisSchema,
    LessonItemSchema,
    LessonSchema,
    LessonSummarySchema,
    ParentLoginSchema,
    ParentSettingsUpdateSchema,
    UserAISettingsSchema,
    UserAISettingsUpdateSchema,
    UserLoginSchema,
    UserRegisterSchema,
    UserResponseSchema,
    ProgressSchema,
    QuizQuestionSchema,
    QuizSchema,
    QuizSubmitResponseSchema,
    QuizSubmitSchema,
    ReviewAttemptSchema,
    ReviewResultSchema,
    ReviewSessionSchema,
    SpeakRequestSchema,
    SpeakResponseSchema,
    CodingDaySchema,
    CodingDayUpdateSchema,
    CodingTopicSchema,
    CodingReviewAttemptSchema,
    CodingReviewCardSchema,
    CodingReviewResultSchema,
    CodingReviewSessionSchema,
    CreateProgrammingFlashcardSchema,
    CreateProgrammingSubjectSchema,
    CreateProgrammingTopicSchema,
    ProgrammingFlashcardSchema,
    ProgrammingSubjectSchema,
    ProgrammingTopicSchema,
    DiverseLessonBlockSchema,
    TopicAIContentSchema,
    UpdateProgrammingFlashcardSchema,
    UpdateProgrammingSubjectSchema,
    UpdateProgrammingTopicSchema,
    DiverseDaySchema,
    DiverseDayUpdateSchema,
    DiverseSubjectSchema,
    StudyDashboardSchema,
    StudyDaySchema,
    StudyDayUpdateSchema,
)
from services.book_service import BookGenerationService
from services.content_service import ContentService
from services.phrase_generator_service import AIProviderConfig, AI_PROVIDER_DEFAULT_MODELS, PhraseGenerationService
from services.coding_service import (
    build_coding_review_cards,
    count_due_coding_items,
    generate_topic_ai_content,
    register_coding_review_attempt,
    seed_coding_review_item,
    VALID_TOPIC_STATUSES,
)
from services.review_service import (
    build_review_cards,
    compute_review_priority,
    count_due_review_items,
    register_review_attempt,
    seed_review_items_for_lesson,
)
from services.tts_service import TTSService
from services.tutor_service import TutorService

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./kids_tutor.sqlite")
SESSION_SECRET = os.getenv("SESSION_SECRET", "development-session-secret")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
PARENT_COOKIE_SECURE = os.getenv("PARENT_COOKIE_SECURE", "false").lower() == "true"
PARENT_COOKIE_SAMESITE = os.getenv("PARENT_COOKIE_SAMESITE", "lax").lower()
PARENT_COOKIE_DOMAIN = os.getenv("PARENT_COOKIE_DOMAIN") or None
PARENT_COOKIE_MAX_AGE = int(os.getenv("PARENT_COOKIE_MAX_AGE", str(60 * 60 * 24 * 7)))
PARENT_SESSION_COOKIE_NAME = "parent_session"
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
GOOGLE_OAUTH_STATE_COOKIE_NAME = "google_oauth_state"
GOOGLE_OAUTH_NEXT_COOKIE_NAME = "google_oauth_next"

AI_PROVIDER_OPTIONS: list[dict[str, str | bool]] = [
    {"id": "gemini", "label": "Gemini", "default_model": AI_PROVIDER_DEFAULT_MODELS["gemini"], "requires_base_url": False, "is_default": True},
    {"id": "openai", "label": "OpenAI", "default_model": AI_PROVIDER_DEFAULT_MODELS["openai"], "requires_base_url": False, "is_default": False},
    {"id": "anthropic", "label": "Anthropic", "default_model": AI_PROVIDER_DEFAULT_MODELS["anthropic"], "requires_base_url": False, "is_default": False},
    {"id": "openrouter", "label": "OpenRouter", "default_model": AI_PROVIDER_DEFAULT_MODELS["openrouter"], "requires_base_url": False, "is_default": False},
    {"id": "groq", "label": "Groq", "default_model": AI_PROVIDER_DEFAULT_MODELS["groq"], "requires_base_url": False, "is_default": False},
    {"id": "mistral", "label": "Mistral", "default_model": AI_PROVIDER_DEFAULT_MODELS["mistral"], "requires_base_url": False, "is_default": False},
]
AI_PROVIDER_IDS = {str(provider["id"]) for provider in AI_PROVIDER_OPTIONS}

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
app = FastAPI(title="English Kids Tutor API", version="1.0.0")

raw_origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

# Local development often flips between localhost and 127.0.0.1, so allow both.
if "http://localhost:3000" in origins and "http://127.0.0.1:3000" not in origins:
    origins.append("http://127.0.0.1:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

audio_cache_dir = Path(os.getenv("AUDIO_CACHE_DIR", "./audio_cache"))
audio_cache_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/audio/file", StaticFiles(directory=str(audio_cache_dir)), name="audio")

tts_service = TTSService(
    provider=os.getenv("TTS_PROVIDER", "kokoro"),
    default_voice=os.getenv("KOKORO_DEFAULT_VOICE", "af_bella"),
    cache_dir=str(audio_cache_dir),
)
content_service = ContentService(PROJECT_ROOT / "content" / "quizzes")
tutor_service = TutorService(BASE_DIR / "prompts" / "tutor_system_prompt.txt")
phrase_generation_service = PhraseGenerationService()
book_generation_service = BookGenerationService()


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def _run_schema_migrations() -> None:
    """Apply schema changes that SQLModel.create_all cannot handle (add columns, relax constraints)."""
    with engine.connect() as conn:
        # Make book.child_id nullable so books can be shared across all users
        try:
            conn.execute(text("ALTER TABLE book ALTER COLUMN child_id DROP NOT NULL"))
        except Exception:
            pass
        # Add lesson.level column for shared-pool lookup
        try:
            conn.execute(text("ALTER TABLE lesson ADD COLUMN IF NOT EXISTS level INTEGER"))
        except Exception:
            try:
                conn.execute(text("ALTER TABLE lesson ADD COLUMN level INTEGER"))
            except Exception:
                pass
        # Add target_language column to childprofile
        try:
            conn.execute(text("ALTER TABLE childprofile ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'English'"))
        except Exception:
            try:
                conn.execute(text("ALTER TABLE childprofile ADD COLUMN target_language TEXT NOT NULL DEFAULT 'English'"))
            except Exception:
                pass
        # Add target_language column to book
        try:
            conn.execute(text("ALTER TABLE book ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'English'"))
        except Exception:
            try:
                conn.execute(text("ALTER TABLE book ADD COLUMN target_language TEXT NOT NULL DEFAULT 'English'"))
            except Exception:
                pass
        # Add target_language column to lesson
        try:
            conn.execute(text("ALTER TABLE lesson ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'English'"))
        except Exception:
            try:
                conn.execute(text("ALTER TABLE lesson ADD COLUMN target_language TEXT NOT NULL DEFAULT 'English'"))
            except Exception:
                pass
        # Add Google OAuth fields to user records
        try:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS google_sub TEXT'))
        except Exception:
            try:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN google_sub TEXT'))
            except Exception:
                pass
        try:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT \'password\''))
        except Exception:
            try:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN auth_provider TEXT NOT NULL DEFAULT \'password\''))
            except Exception:
                pass
        try:
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ix_user_google_sub_unique ON "user" (google_sub)'))
        except Exception:
            pass
        # Add pomodoro_count to studyday
        try:
            conn.execute(text("ALTER TABLE studyday ADD COLUMN IF NOT EXISTS pomodoro_count INTEGER NOT NULL DEFAULT 0"))
        except Exception:
            try:
                conn.execute(text("ALTER TABLE studyday ADD COLUMN pomodoro_count INTEGER NOT NULL DEFAULT 0"))
            except Exception:
                pass
        # admin_flashcard table: created by SQLModel.create_all on first run
        conn.commit()


def get_session():
    with Session(engine) as session:
        yield session


def normalize_child_voice_preference(child: ChildProfile, session: Session | None = None) -> ChildProfile:
    normalized_voice = tts_service.normalize_voice(child.voice_preference)
    if child.voice_preference == normalized_voice:
        return child

    child.voice_preference = normalized_voice
    if session is not None:
        session.add(child)
        session.commit()
        session.refresh(child)
    return child


def normalize_existing_child_profiles() -> None:
    with Session(engine) as session:
        children = session.exec(select(ChildProfile)).all()
        updated = False
        for child in children:
            normalized_voice = tts_service.normalize_voice(child.voice_preference)
            if child.voice_preference == normalized_voice:
                continue

            child.voice_preference = normalized_voice
            session.add(child)
            updated = True

        if updated:
            session.commit()


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    _run_schema_migrations()
    normalize_existing_child_profiles()


def hash_session_token(token: str) -> str:
    return hashlib.sha256(f"{SESSION_SECRET}:{token}".encode("utf-8")).hexdigest()


def get_request_user_session(request: Request | None, session: Session) -> UserSession | None:
    if request is None:
        return None

    token = request.cookies.get(PARENT_SESSION_COOKIE_NAME)
    if not token:
        return None

    session_record = session.exec(
        select(UserSession).where(UserSession.session_token_hash == hash_session_token(token))
    ).first()
    if session_record is None:
        return None

    if session_record.expires_at <= datetime.utcnow():
        session.delete(session_record)
        session.commit()
        return None

    session_record.last_seen_at = datetime.utcnow()
    session.add(session_record)
    return session_record


def get_default_child(session: Session, user_id: int | None = None) -> ChildProfile:
    statement = select(ChildProfile).order_by(ChildProfile.id)
    if user_id is None:
        statement = statement.where(ChildProfile.user_id == None)
    else:
        statement = statement.where(ChildProfile.user_id == user_id)

    child = session.exec(statement).first()
    if child is None:
        child = ChildProfile(name="Kid", age_group="7-9", user_id=user_id)
        session.add(child)
        session.commit()
        session.refresh(child)
    return normalize_child_voice_preference(child, session=session)


def get_requested_child(request: Request | None, session: Session) -> ChildProfile:
    parent_session = get_request_user_session(request=request, session=session)
    logged_user_id = parent_session.user_id if parent_session is not None else None

    if request is not None:
        raw_child_id = request.headers.get("x-child-id", "").strip()
        if raw_child_id.isdigit():
            selected_child = session.get(ChildProfile, int(raw_child_id))
            if selected_child is not None and (
                (parent_session is not None and logged_user_id is None)
                or selected_child.user_id == logged_user_id
                or (parent_session is None and selected_child.user_id is None)
            ):
                return normalize_child_voice_preference(selected_child, session=session)

    return get_default_child(session=session, user_id=logged_user_id)


def is_generated_lesson(lesson: Lesson) -> bool:
    content = lesson.content or {}
    return content.get("generated_by") == "gemini"


def list_accessible_lessons(session: Session, child_id: int, child_level: int | None = None, target_language: str = "English") -> list[Lesson]:
    """Return all lessons accessible to child_id.

    - Static (non-generated) lessons are visible only when their target_language matches.
    - Shared generated lessons (child_id=None) are visible when level and target_language match.
    - Legacy private generated lessons (child_id==child_id) remain visible to that child.
    """
    lessons = session.exec(select(Lesson).order_by(Lesson.id)).all()
    result: list[Lesson] = []
    for lesson in lessons:
        if not is_generated_lesson(lesson):
            # Static content: only show to children learning the same language
            if lesson.target_language == target_language:
                result.append(lesson)
        elif lesson.child_id == child_id:
            result.append(lesson)  # legacy private lesson for this child
        elif lesson.child_id is None:
            # shared pool: include if language and level match
            if lesson.target_language != target_language:
                continue
            if child_level is None:
                result.append(lesson)
            else:
                lesson_level = lesson.level or (lesson.content or {}).get("generated_level")
                if lesson_level == child_level:
                    result.append(lesson)
    return result


def get_child_completed_lesson_map(session: Session, child_id: int) -> dict[int, ChildLessonProgress]:
    progress_items = session.exec(
        select(ChildLessonProgress).where(ChildLessonProgress.child_id == child_id)
    ).all()
    return {
        progress.lesson_id: progress
        for progress in progress_items
        if progress.lesson_id is not None
    }


def get_current_lesson(session: Session, child_id: int, child_level: int | None = None, target_language: str = "English") -> Lesson | None:
    lessons = list_accessible_lessons(session=session, child_id=child_id, child_level=child_level, target_language=target_language)
    progress_map = get_child_completed_lesson_map(session=session, child_id=child_id)

    return next(
        (
            item
            for item in lessons
            if not (progress_map.get(item.id or 0).is_completed if progress_map.get(item.id or 0) else False)
        ),
        None,
    )


def get_lesson_items(session: Session, lesson_id: int) -> list[LessonItem]:
    return session.exec(
        select(LessonItem).where(LessonItem.lesson_id == lesson_id).order_by(LessonItem.id)
    ).all()


def compute_and_update_child_level(session: Session, child: ChildProfile) -> int:
    """Gamificacao realista: cada nivel exige esforco consistente.

    Thresholds (vocab = frases aprendidas em licoes concluidas):
      1   < 15 vocab                    (sempre, sem quiz necessario)
      2   15+ vocab                     (acuracia irrelevante — ainda aprendendo)
      3   30+ vocab, quiz >= 55 %
      4   50+ vocab, quiz >= 60 %
      5   80+ vocab, quiz >= 65 %
      6  120+ vocab, quiz >= 70 %
      7  180+ vocab, quiz >= 75 %
      8  250+ vocab, quiz >= 80 %
      9  350+ vocab, quiz >= 85 %
     10  500+ vocab, quiz >= 90 %

    Com ~5-8 frases por licao:
      Nivel 2  requer ~2-3 licoes concluidas
      Nivel 3  requer ~4-6 licoes + bom desempenho no quiz
      Nivel 5  requer ~12-16 licoes + consistencia
      Nivel 10 requer ~65-100 licoes + excelencia
    """
    # -- vocabulary learned --------------------------------------------------
    completed_progress_items = [
        p for p in get_child_completed_lesson_map(session=session, child_id=child.id or 0).values()
        if p.is_completed
    ]
    vocab_count = 0
    for p in completed_progress_items:
        if p.lesson_id:
            vocab_count += len(get_lesson_items(session=session, lesson_id=p.lesson_id))

    # -- quiz accuracy -------------------------------------------------------
    quiz_attempts = session.exec(
        select(QuizAttempt).where(QuizAttempt.child_id == child.id)
    ).all()
    if quiz_attempts:
        total_score = sum(a.score for a in quiz_attempts)
        total_q = sum(a.total_questions for a in quiz_attempts if a.total_questions)
        quiz_accuracy = total_score / total_q if total_q else 0.0
    else:
        quiz_accuracy = 0.0

    # -- review difficulty ---------------------------------------------------
    review_items = session.exec(
        select(ReviewItem).where(ReviewItem.child_id == child.id)
    ).all()
    avg_difficulty = (
        sum(r.difficulty_score for r in review_items) / len(review_items)
        if review_items else 0.0
    )

    # -- level formula -------------------------------------------------------
    if vocab_count >= 500 and quiz_accuracy >= 0.90:
        level = 10
    elif vocab_count >= 350 and quiz_accuracy >= 0.85:
        level = 9
    elif vocab_count >= 250 and quiz_accuracy >= 0.80:
        level = 8
    elif vocab_count >= 180 and quiz_accuracy >= 0.75:
        level = 7
    elif vocab_count >= 120 and quiz_accuracy >= 0.70:
        level = 6
    elif vocab_count >= 80 and quiz_accuracy >= 0.65:
        level = 5
    elif vocab_count >= 50 and quiz_accuracy >= 0.60:
        level = 4
    elif vocab_count >= 30 and quiz_accuracy >= 0.55:
        level = 3
    elif vocab_count >= 15:
        level = 2
    else:
        level = 1

    if child.current_level != level:
        child.current_level = level
        session.add(child)
        session.commit()
        session.refresh(child)

    return level


def auto_generate_lesson_for_child(session: Session, child: ChildProfile) -> Lesson:
    """Return a shared generated lesson at the child's level, generating one if none exists."""
    level = compute_and_update_child_level(session=session, child=child)

    # ── Reuse from shared pool if a lesson at this level exists ─────────────
    progress_map = get_child_completed_lesson_map(session=session, child_id=child.id or 0)
    shared_at_level = session.exec(
        select(Lesson).where(
            Lesson.child_id == None,
            Lesson.level == level,
            Lesson.target_language == child.target_language,
        ).order_by(Lesson.id)
    ).all()
    for candidate in shared_at_level:
        if not is_generated_lesson(candidate):
            continue
        prog = progress_map.get(candidate.id or 0)
        if prog is None or not prog.is_completed:
            return candidate  # free reuse — no Gemini call needed

    # ── Generate a new shared lesson ─────────────────────────────────────────
    next_day = get_next_lesson_day(session=session)
    existing_phrases = [
        item.word_en
        for item in session.exec(select(LessonItem).order_by(LessonItem.id)).all()
    ]
    ai_config = _get_user_ai_config_for_user_id(child.user_id, session)
    if child.user_id is not None and ai_config is None:
        raise HTTPException(
            status_code=403,
            detail="Configure uma chave de API de IA na sua conta antes de gerar novas licoes.",
        )
    if not phrase_generation_service.is_configured(ai_config):
        raise HTTPException(
            status_code=503,
            detail=(
                "Nenhuma licao foi encontrada e uma chave de API de IA nao esta configurada. "
                "Configure a chave para gerar licoes automaticamente."
            ),
        )

    try:
        draft = phrase_generation_service.generate_lesson_draft(
            next_day=next_day,
            age_group=child.age_group,
            existing_phrases=existing_phrases,
            level=level,
            target_language=child.target_language,
            ai_config=ai_config,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Nao foi possivel gerar a licao com o Gemini. {exc}",
        ) from exc

    lesson = Lesson(
        id=next_day,
        title=f"{child.target_language} de hoje - Dia {next_day}",
        theme="Frases do dia",
        objective=f"Aprenda 3 frases uteis em {child.target_language.lower()} hoje.",
        content={
            "daily_goal": "3 frases para hoje",
            "phrase_breakdowns": [
                {
                    "phrase_en": phrase.phrase_en,
                    "phrase_pt": phrase.phrase_pt,
                    "word_by_word": [{"en": p.en, "pt": p.pt} for p in phrase.word_by_word],
                }
                for phrase in draft.phrases
            ],
            "generated_by": ai_config.provider if ai_config else "gemini",
            "generated_model": ai_config.model if ai_config else phrase_generation_service.model,
            "generated_level": level,
            "generated_at": datetime.utcnow().isoformat(),
        },
        child_id=None,  # shared — available to all children at this level
        level=level,
        target_language=child.target_language,
    )
    session.add(lesson)
    session.commit()
    session.refresh(lesson)

    created_items: list[LessonItem] = []
    for phrase in draft.phrases:
        lesson_item = LessonItem(
            word_en=phrase.phrase_en,
            word_pt=phrase.phrase_pt,
            example_sentence_en=phrase.example_sentence_en,
            example_sentence_pt=phrase.example_sentence_pt,
            lesson_id=lesson.id,
        )
        session.add(lesson_item)
        created_items.append(lesson_item)
    session.commit()

    quiz_questions = build_generated_quiz_questions(session=session, lesson_items=created_items, target_language=child.target_language)
    lesson.content = {
        **(lesson.content or {}),
        "quiz_questions": [q.model_dump() for q in quiz_questions],
    }
    session.add(lesson)
    session.commit()
    session.refresh(lesson)

    return lesson


def get_next_lesson_day(session: Session) -> int:
    latest_lesson = session.exec(select(Lesson).order_by(Lesson.id.desc())).first()
    if latest_lesson is None or latest_lesson.id is None:
        return 1
    return latest_lesson.id + 1


def build_lesson_response(session: Session, lesson: Lesson, child_id: int) -> LessonSchema:
    lesson_items = get_lesson_items(session=session, lesson_id=lesson.id or 0)
    progress_map = get_child_completed_lesson_map(session=session, child_id=child_id)
    lesson_progress = progress_map.get(lesson.id or 0)
    return LessonSchema(
        id=lesson.id or 0,
        title=lesson.title,
        theme=lesson.theme,
        objective=lesson.objective,
        content=lesson.content or {},
        items=[LessonItemSchema.model_validate(item) for item in lesson_items],
        is_completed=lesson_progress.is_completed if lesson_progress else False,
    )


def build_generated_quiz_questions(session: Session, lesson_items: list[LessonItem], target_language: str = "English") -> list[QuizQuestionSchema]:
    phrase_pool = [
        item.word_en
        for item in session.exec(select(LessonItem).order_by(LessonItem.id)).all()
        if item.word_en not in {lesson_item.word_en for lesson_item in lesson_items}
    ]
    generated_questions: list[QuizQuestionSchema] = []
    lang_lower = target_language.lower()

    for index, lesson_item in enumerate(lesson_items, start=1):
        options = [lesson_item.word_en]

        for sibling_item in lesson_items:
            if sibling_item.word_en == lesson_item.word_en or sibling_item.word_en in options:
                continue
            options.append(sibling_item.word_en)

        for candidate in phrase_pool:
            if candidate in options:
                continue
            options.append(candidate)
            if len(options) >= 4:
                break

        ordered_options = sorted(
            options,
            key=lambda option: ((len(option) + index) * (index + options.index(option) + 1)) % 17,
        )
        generated_questions.append(
            QuizQuestionSchema(
                id=index,
                question=f"Como se diz '{lesson_item.word_pt}' em {lang_lower}?",
                options=ordered_options,
                correct_option=lesson_item.word_en,
                explanation=f"{lesson_item.word_en} significa {lesson_item.word_pt}.",
            )
        )

    return generated_questions


def build_quiz_from_lesson_content(lesson: Lesson) -> QuizSchema | None:
    lesson_id = lesson.id or 0
    content = lesson.content or {}
    questions_payload = content.get("quiz_questions")
    if not isinstance(questions_payload, list) or not questions_payload:
        return None

    try:
        questions = [QuizQuestionSchema.model_validate(question) for question in questions_payload]
    except Exception:
        return None

    return QuizSchema(
        id=lesson_id,
        lesson_id=lesson_id,
        questions=questions,
    )


def update_streak(child: ChildProfile, now: datetime) -> None:
    if child.last_activity is None:
        child.streak_count = max(child.streak_count, 1)
    elif child.last_activity.date() == now.date():
        child.last_activity = now
        return
    elif child.last_activity.date() == (now.date() - timedelta(days=1)):
        child.streak_count += 1
    else:
        child.streak_count = 1

    child.last_activity = now


def build_quiz_encouragement(score: int, total_questions: int) -> str:
    if total_questions <= 0:
        return "Boa tentativa! Vamos continuar aprendendo juntos."

    accuracy = score / total_questions
    if accuracy == 1:
        return "Incrivel! Voce acertou tudo!"
    if accuracy >= 0.6:
        return "Muito bem! Voce esta ficando melhor a cada dia."
    return "Bom esforco! Vamos praticar um pouco mais e tentar de novo."


def build_parent_session_token() -> str:
    return secrets.token_urlsafe(48)


def create_parent_session(
    *,
    response: Response,
    session: Session,
    user_id: int | None,
) -> str:
    token = build_parent_session_token()
    now = datetime.utcnow()
    session_record = UserSession(
        session_token_hash=hash_session_token(token),
        user_id=user_id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(seconds=PARENT_COOKIE_MAX_AGE),
    )
    session.add(session_record)
    session.commit()

    response.set_cookie(
        key=PARENT_SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=PARENT_COOKIE_SECURE,
        samesite=PARENT_COOKIE_SAMESITE,
        domain=PARENT_COOKIE_DOMAIN,
        max_age=PARENT_COOKIE_MAX_AGE,
    )
    return token


def clear_parent_session(request: Request, response: Response, session: Session) -> None:
    token = request.cookies.get(PARENT_SESSION_COOKIE_NAME)
    if token:
        session_record = session.exec(
            select(UserSession).where(UserSession.session_token_hash == hash_session_token(token))
        ).first()
        if session_record is not None:
            session.delete(session_record)
            session.commit()

    response.delete_cookie(
        key=PARENT_SESSION_COOKIE_NAME,
        domain=PARENT_COOKIE_DOMAIN,
        secure=PARENT_COOKIE_SECURE,
        samesite=PARENT_COOKIE_SAMESITE,
    )


def require_parent_session(request: Request, session: Session) -> UserSession:
    session_record = get_request_user_session(request=request, session=session)
    if session_record is None:
        raise HTTPException(status_code=401, detail="Login da area de pais obrigatorio")
    return session_record


def get_or_create_lesson_progress(
    session: Session,
    *,
    child_id: int,
    lesson_id: int,
) -> ChildLessonProgress:
    progress = session.exec(
        select(ChildLessonProgress).where(
            ChildLessonProgress.child_id == child_id,
            ChildLessonProgress.lesson_id == lesson_id,
        )
    ).first()
    if progress is None:
        progress = ChildLessonProgress(
            child_id=child_id,
            lesson_id=lesson_id,
        )
        session.add(progress)
        session.flush()
    return progress


@app.get("/health")
def health_check() -> dict[str, datetime | str]:
    return {"status": "ok", "timestamp": datetime.utcnow()}


@app.get("/api/lessons", response_model=list[LessonSummarySchema])
def list_all_lessons(request: Request, session: Session = Depends(get_session)) -> list[LessonSummarySchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    lessons = list_accessible_lessons(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)
    progress_map = get_child_completed_lesson_map(session=session, child_id=child.id or 0)
    return [
        LessonSummarySchema(
            id=lesson.id or 0,
            title=lesson.title,
            theme=lesson.theme,
            objective=lesson.objective,
            is_completed=progress_map.get(lesson.id or 0).is_completed if progress_map.get(lesson.id or 0) else False,
            completed_at=progress_map.get(lesson.id or 0).completed_at if progress_map.get(lesson.id or 0) else None,
        )
        for lesson in lessons
    ]


@app.get("/api/lesson/next", response_model=LessonSchema)
def get_next_lesson(request: Request, session: Session = Depends(get_session)) -> LessonSchema:
    """Returns the next incomplete lesson without generating — 404 if all done."""
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    lesson = get_current_lesson(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Nenhuma licao pendente")
    return build_lesson_response(session=session, lesson=lesson, child_id=child.id or 0)


@app.get("/api/lesson/today", response_model=LessonSchema)
def get_today_lesson(request: Request, session: Session = Depends(get_session)) -> LessonSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    lesson = get_current_lesson(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)
    if lesson is None:
        lesson = auto_generate_lesson_for_child(session=session, child=child)
    return build_lesson_response(session=session, lesson=lesson, child_id=child.id or 0)


@app.get("/api/lesson/{lesson_id}", response_model=LessonSchema)
def get_lesson_by_id(lesson_id: int, request: Request, session: Session = Depends(get_session)) -> LessonSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    lesson = session.get(Lesson, lesson_id)
    accessible_lesson_ids = {item.id or 0 for item in list_accessible_lessons(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)}
    if lesson is None or (lesson.id or 0) not in accessible_lesson_ids:
        raise HTTPException(status_code=404, detail="Licao nao encontrada")
    return build_lesson_response(session=session, lesson=lesson, child_id=child.id or 0)


@app.post("/api/lesson/complete")
def complete_lesson(lesson_id: int, request: Request, session: Session = Depends(get_session)) -> dict[str, str]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    lesson = session.get(Lesson, lesson_id)
    accessible_lesson_ids = {item.id or 0 for item in list_accessible_lessons(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)}
    if lesson is None or (lesson.id or 0) not in accessible_lesson_ids:
        raise HTTPException(status_code=404, detail="Licao nao encontrada")

    lesson_items = get_lesson_items(session=session, lesson_id=lesson.id or 0)
    seed_review_items_for_lesson(session=session, child_id=child.id or 0, lesson_items=lesson_items)
    now = datetime.utcnow()
    lesson_progress = get_or_create_lesson_progress(
        session=session,
        child_id=child.id or 0,
        lesson_id=lesson.id or 0,
    )
    lesson_progress.is_completed = True
    lesson_progress.completed_at = now
    update_streak(child=child, now=now)

    session.add(child)
    session.add(lesson_progress)
    session.commit()
    return {"status": "success"}


@app.get("/api/quiz/today", response_model=QuizSchema)
def get_today_quiz(
    request: Request,
    lesson_id: int | None = None,
    session: Session = Depends(get_session),
) -> QuizSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    resolved_lesson_id = lesson_id
    lesson: Lesson | None = None
    if resolved_lesson_id is None:
        lesson = get_current_lesson(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)
        if lesson is None:
            raise HTTPException(status_code=404, detail="Nenhuma licao encontrada para o quiz")
        resolved_lesson_id = lesson.id
    elif resolved_lesson_id is not None:
        lesson = session.get(Lesson, resolved_lesson_id)
        accessible_lesson_ids = {item.id or 0 for item in list_accessible_lessons(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)}
        if lesson is None or (lesson.id or 0) not in accessible_lesson_ids:
            raise HTTPException(status_code=404, detail="Licao nao encontrada")

    if lesson is not None:
        generated_quiz = build_quiz_from_lesson_content(lesson)
        if generated_quiz is not None:
            return generated_quiz

    quiz = content_service.get_quiz_for_lesson(resolved_lesson_id)
    if quiz is None:
        raise HTTPException(status_code=404, detail="Nenhum quiz encontrado")
    return quiz


@app.post("/api/quiz/submit", response_model=QuizSubmitResponseSchema)
def submit_quiz(
    payload: QuizSubmitSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> QuizSubmitResponseSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    attempt = QuizAttempt(
        lesson_id=payload.lesson_id,
        score=payload.score,
        total_questions=payload.total_questions,
        child_id=child.id,
    )
    update_streak(child=child, now=datetime.utcnow())

    session.add(child)
    session.add(attempt)
    session.commit()

    return QuizSubmitResponseSchema(
        status="success",
        encouragement=build_quiz_encouragement(
            score=payload.score,
            total_questions=payload.total_questions,
        ),
    )


@app.get("/api/review", response_model=ReviewSessionSchema)
def get_review_session(
    request: Request,
    limit: int = 5,
    session: Session = Depends(get_session),
) -> ReviewSessionSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    return ReviewSessionSchema(
        total_due=count_due_review_items(session=session, child_id=child.id or 0),
        items=build_review_cards(session=session, child_id=child.id or 0, limit=limit),
    )


@app.post("/api/review/attempt", response_model=ReviewResultSchema)
def submit_review_attempt(
    payload: ReviewAttemptSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ReviewResultSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    review_item = register_review_attempt(
        session=session,
        child_id=child.id or 0,
        word_en=payload.word_en,
        word_pt=payload.word_pt,
        correct=payload.correct,
        review_item_id=payload.review_item_id,
    )
    child.last_activity = datetime.utcnow()

    session.add(child)
    session.add(review_item)
    session.commit()
    session.refresh(review_item)

    return ReviewResultSchema(
        review_item_id=review_item.id or 0,
        difficulty_score=review_item.difficulty_score,
        next_review=review_item.next_review,
        error_count=review_item.error_count,
        correct_count=review_item.correct_count,
    )


def build_progress_for_child(session: Session, child: ChildProfile) -> ProgressSchema:
    completed_progress_items = [
        progress
        for progress in get_child_completed_lesson_map(session=session, child_id=child.id or 0).values()
        if progress.is_completed
    ]
    accessible_lesson_ids = {lesson.id or 0 for lesson in list_accessible_lessons(session=session, child_id=child.id or 0, child_level=child.current_level, target_language=child.target_language)}
    completed_lesson_ids = [
        progress.lesson_id
        for progress in completed_progress_items
        if progress.lesson_id in accessible_lesson_ids
    ]

    vocabulary_learned = 0
    for lesson_id in completed_lesson_ids:
        vocabulary_learned += len(get_lesson_items(session=session, lesson_id=lesson_id))

    review_items = session.exec(
        select(ReviewItem).where(ReviewItem.child_id == child.id)
    ).all()
    difficult_words = [
        item.word_en
        for item in sorted(
            review_items,
            key=lambda review_item: compute_review_priority(review_item),
            reverse=True,
        )[:3]
    ]

    return ProgressSchema(
        themes_completed=len(completed_lesson_ids),
        streak_count=child.streak_count,
        vocabulary_learned=vocabulary_learned,
        last_activity=child.last_activity,
        current_level=child.current_level,
        difficult_words=difficult_words,
    )


def sanitize_study_text(value: str | None, max_length: int) -> str:
    return (value or "").strip()[:max_length]


def sanitize_distractions(items: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items or []:
        label = item.strip()[:80]
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(label)
        if len(cleaned) >= 20:
            break
    return cleaned


def get_study_day_record(session: Session, child_id: int, target_date: date) -> StudyDay | None:
    return session.exec(
        select(StudyDay).where(
            StudyDay.child_id == child_id,
            StudyDay.study_date == target_date,
        )
    ).first()


def build_study_day_schema(record: StudyDay | None, target_date: date) -> StudyDaySchema:
    if record is None:
        return StudyDaySchema(
            study_date=target_date,
            is_study_day=False,
        )

    studied_text = record.studied_text or ""
    return StudyDaySchema(
        id=record.id,
        study_date=record.study_date,
        plan_text=record.plan_text or "",
        studied_text=studied_text,
        distractions=record.distractions or [],
        is_study_day=bool(studied_text.strip()),
        pomodoro_count=record.pomodoro_count or 0,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def compute_study_streak(session: Session, child_id: int) -> tuple[int, date | None]:
    records = session.exec(
        select(StudyDay)
        .where(StudyDay.child_id == child_id)
        .order_by(StudyDay.study_date.desc())
    ).all()
    study_dates = sorted(
        {record.study_date for record in records if (record.studied_text or "").strip()},
        reverse=True,
    )
    if not study_dates:
        return 0, None

    streak = 1
    expected_date = study_dates[0] - timedelta(days=1)
    for study_date in study_dates[1:]:
        if study_date == expected_date:
            streak += 1
            expected_date -= timedelta(days=1)
        elif study_date < expected_date:
            break

    return streak, study_dates[0]


@app.get("/api/progress", response_model=ProgressSchema)
def get_progress(request: Request, session: Session = Depends(get_session)) -> ProgressSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    return build_progress_for_child(session=session, child=child)


@app.get("/api/study/dashboard", response_model=StudyDashboardSchema)
def get_study_dashboard(request: Request, session: Session = Depends(get_session)) -> StudyDashboardSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    child_id = child.id or 0
    today = date.today()
    today_record = get_study_day_record(session=session, child_id=child_id, target_date=today)
    recent_records = session.exec(
        select(StudyDay)
        .where(StudyDay.child_id == child_id)
        .order_by(StudyDay.study_date.desc())
        .limit(30)
    ).all()
    streak_count, last_study_date = compute_study_streak(session=session, child_id=child_id)

    return StudyDashboardSchema(
        today=build_study_day_schema(today_record, today),
        recent_days=[build_study_day_schema(record, record.study_date) for record in recent_records],
        study_streak_count=streak_count,
        last_study_date=last_study_date,
    )


@app.get("/api/study/day/{study_date}", response_model=StudyDaySchema)
def get_study_day(
    study_date: date,
    request: Request,
    session: Session = Depends(get_session),
) -> StudyDaySchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    record = get_study_day_record(session=session, child_id=child.id or 0, target_date=study_date)
    return build_study_day_schema(record, study_date)


@app.put("/api/study/day/{study_date}", response_model=StudyDaySchema)
def upsert_study_day(
    study_date: date,
    payload: StudyDayUpdateSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> StudyDaySchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    child_id = child.id or 0
    now = datetime.utcnow()
    record = get_study_day_record(session=session, child_id=child_id, target_date=study_date)
    if record is None:
        record = StudyDay(
            child_id=child_id,
            study_date=study_date,
            created_at=now,
            updated_at=now,
        )

    if payload.plan_text is not None:
        record.plan_text = sanitize_study_text(payload.plan_text, 2000)
    if payload.studied_text is not None:
        record.studied_text = sanitize_study_text(payload.studied_text, 3000)
    if payload.distractions is not None:
        record.distractions = sanitize_distractions(payload.distractions)
    if payload.pomodoro_count is not None:
        record.pomodoro_count = max(record.pomodoro_count or 0, payload.pomodoro_count)

    record.updated_at = now
    session.add(record)
    session.commit()
    session.refresh(record)
    return build_study_day_schema(record, record.study_date)


_DEFAULT_CODING_SUBJECTS: dict[str, list[dict]] = {
    "react": [
        {"topic": "useState e useEffect", "done": False},
        {"topic": "Componentes e props", "done": False},
        {"topic": "Context API", "done": False},
    ],
    "leetcode": [
        {"topic": "Arrays e sliding window", "done": False},
        {"topic": "Strings e dois ponteiros", "done": False},
        {"topic": "Hash maps", "done": False},
    ],
    "typescript": [
        {"topic": "Types e interfaces", "done": False},
        {"topic": "Generics", "done": False},
        {"topic": "Utility types (Partial, Pick, Omit)", "done": False},
    ],
    "nextjs": [
        {"topic": "App Router e layouts", "done": False},
        {"topic": "Server Components", "done": False},
        {"topic": "Route handlers e API", "done": False},
    ],
}


def _build_coding_schema(record: CodingDay | None, study_date: date) -> CodingDaySchema:
    if record is None:
        return CodingDaySchema(
            study_date=study_date,
            subjects={k: [CodingTopicSchema(**t) for t in v] for k, v in _DEFAULT_CODING_SUBJECTS.items()},
        )
    return CodingDaySchema(
        id=record.id,
        study_date=record.study_date,
        subjects={k: [CodingTopicSchema(**t) for t in v] for k, v in (record.subjects or {}).items()},
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@app.get("/api/study/coding/{study_date}", response_model=CodingDaySchema)
def get_coding_day(
    study_date: date,
    request: Request,
    session: Session = Depends(get_session),
) -> CodingDaySchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    record = session.exec(
        select(CodingDay).where(CodingDay.child_id == child.id, CodingDay.study_date == study_date)
    ).first()
    return _build_coding_schema(record, study_date)


@app.put("/api/study/coding/{study_date}", response_model=CodingDaySchema)
def upsert_coding_day(
    study_date: date,
    payload: CodingDayUpdateSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> CodingDaySchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    child_id = child.id or 0
    now = datetime.utcnow()
    record = session.exec(
        select(CodingDay).where(CodingDay.child_id == child_id, CodingDay.study_date == study_date)
    ).first()
    subjects_data = {
        k: [{"topic": t.topic[:120], "done": t.done} for t in v]
        for k, v in payload.subjects.items()
    }
    if record is None:
        record = CodingDay(child_id=child_id, study_date=study_date, subjects=subjects_data, created_at=now, updated_at=now)
    else:
        record.subjects = subjects_data
        record.updated_at = now
    session.add(record)
    session.commit()
    session.refresh(record)
    return _build_coding_schema(record, record.study_date)


@app.get("/api/study/diverse/catalog")
def get_diverse_catalog(request: Request, session: Session = Depends(get_session)) -> list[dict]:
    """Returns all unique subjects ever created, most recent topics per name."""
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    records = session.exec(
        select(DiverseDay).where(DiverseDay.child_id == child.id).order_by(DiverseDay.study_date.desc()).limit(60)
    ).all()
    seen: dict[str, dict] = {}
    for record in records:
        for subject in (record.custom_subjects or []):
            if not isinstance(subject, dict):
                continue
            name = subject.get("name", "").strip()
            if name and name not in seen:
                seen[name] = {"name": name, "topics": subject.get("topics", [])}
    return list(seen.values())


_VALID_RATINGS = {"knew", "partial", "unknown"}


def _build_diverse_topic_schema(raw_topic: dict) -> CodingTopicSchema:
    raw_rating = str(raw_topic.get("last_rating") or "").strip().lower()
    last_rating = raw_rating if raw_rating in _VALID_RATINGS else None
    try:
        review_count = max(0, int(raw_topic.get("review_count", 0) or 0))
    except (TypeError, ValueError):
        review_count = 0
    last_reviewed = raw_topic.get("last_reviewed")
    return CodingTopicSchema(
        topic=str(raw_topic.get("topic", "")).strip()[:120] or "Topico",
        done=bool(raw_topic.get("done", False)),
        answer=str(raw_topic.get("answer") or "")[:300],
        last_rating=last_rating,
        review_count=review_count,
        last_reviewed=(str(last_reviewed)[:40] if last_reviewed else None),
    )


def _build_diverse_lesson_schema(raw_lesson: dict) -> DiverseLessonBlockSchema:
    return DiverseLessonBlockSchema(
        id=str(raw_lesson.get("id") or secrets.token_urlsafe(8))[:80],
        title=str(raw_lesson.get("title") or "Licao")[:80],
        topics=[_build_diverse_topic_schema(t) for t in raw_lesson.get("topics", []) if isinstance(t, dict)],
        created_at=(str(raw_lesson.get("created_at"))[:40] if raw_lesson.get("created_at") else None),
    )


def _build_diverse_subject_schema(raw_subject: dict) -> DiverseSubjectSchema:
    return DiverseSubjectSchema(
        name=str(raw_subject.get("name", "")).strip()[:60] or "Materia",
        topics=[_build_diverse_topic_schema(t) for t in raw_subject.get("topics", []) if isinstance(t, dict)],
        lessons=[
            _build_diverse_lesson_schema(lesson)
            for lesson in raw_subject.get("lessons", [])
            if isinstance(lesson, dict)
        ],
    )


def _topic_payload(topic: CodingTopicSchema) -> dict:
    return {
        "topic": topic.topic[:120],
        "done": topic.done,
        "answer": (topic.answer or "")[:300],
        "last_rating": topic.last_rating if topic.last_rating in _VALID_RATINGS else None,
        "review_count": max(0, int(topic.review_count or 0)),
        "last_reviewed": (topic.last_reviewed or None),
    }


def _lesson_payload(lesson: DiverseLessonBlockSchema) -> dict:
    return {
        "id": lesson.id[:80],
        "title": lesson.title[:80],
        "created_at": (lesson.created_at or "")[:40] or None,
        "topics": [_topic_payload(topic) for topic in lesson.topics],
    }


def _extract_json_object(raw_text: str) -> dict:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
    try:
        data = json.loads(cleaned.strip())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="IA retornou um formato invalido.") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="IA retornou um formato invalido.")
    return data


@app.get("/api/study/diverse/{study_date}", response_model=DiverseDaySchema)
def get_diverse_day(
    study_date: date,
    request: Request,
    session: Session = Depends(get_session),
) -> DiverseDaySchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    record = session.exec(
        select(DiverseDay).where(DiverseDay.child_id == child.id, DiverseDay.study_date == study_date)
    ).first()
    if record is None:
        return DiverseDaySchema(study_date=study_date, custom_subjects=[])
    return DiverseDaySchema(
        id=record.id,
        study_date=record.study_date,
        custom_subjects=[
            _build_diverse_subject_schema(s)
            for s in (record.custom_subjects or [])
            if isinstance(s, dict)
        ],
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@app.put("/api/study/diverse/{study_date}", response_model=DiverseDaySchema)
def upsert_diverse_day(
    study_date: date,
    payload: DiverseDayUpdateSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> DiverseDaySchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    child_id = child.id or 0
    now = datetime.utcnow()
    record = session.exec(
        select(DiverseDay).where(DiverseDay.child_id == child_id, DiverseDay.study_date == study_date)
    ).first()
    subjects_data = [
        {
            "name": s.name[:60],
            "topics": [_topic_payload(t) for t in s.topics],
            "lessons": [_lesson_payload(lesson) for lesson in s.lessons],
        }
        for s in payload.custom_subjects
    ]
    if record is None:
        record = DiverseDay(child_id=child_id, study_date=study_date, custom_subjects=subjects_data, created_at=now, updated_at=now)
    else:
        record.custom_subjects = subjects_data
        record.updated_at = now
    session.add(record)
    session.commit()
    session.refresh(record)
    return DiverseDaySchema(
        id=record.id,
        study_date=record.study_date,
        custom_subjects=[
            _build_diverse_subject_schema(s)
            for s in (record.custom_subjects or [])
            if isinstance(s, dict)
        ],
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


_LEVEL_LABELS = {
    1: "Iniciante",
    2: "Basico",
    3: "Basico+",
    4: "Elementar",
    5: "Elementar+",
    6: "Intermediario",
    7: "Intermediario+",
    8: "Avancado",
    9: "Avancado+",
    10: "Fluente",
}
_LEVEL_THRESHOLDS = {
    1: 15,   # 15 vocab para nivel 2
    2: 30,   # 30 vocab para nivel 3
    3: 50,   # 50 vocab para nivel 4
    4: 80,   # 80 vocab para nivel 5
    5: 120,  # 120 vocab para nivel 6
    6: 180,  # 180 vocab para nivel 7
    7: 250,  # 250 vocab para nivel 8
    8: 350,  # 350 vocab para nivel 9
    9: 500,  # 500 vocab para nivel 10
    10: 999,
}


@app.get("/api/child/level", response_model=LevelAnalysisSchema)
def get_child_level(request: Request, session: Session = Depends(get_session)) -> LevelAnalysisSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)

    # vocab
    completed = [
        p for p in get_child_completed_lesson_map(session=session, child_id=child.id or 0).values()
        if p.is_completed
    ]
    vocab = sum(len(get_lesson_items(session=session, lesson_id=p.lesson_id)) for p in completed if p.lesson_id)

    # quiz accuracy
    attempts = session.exec(select(QuizAttempt).where(QuizAttempt.child_id == child.id)).all()
    total_score = sum(a.score for a in attempts)
    total_q = sum(a.total_questions for a in attempts if a.total_questions)
    accuracy = round(total_score / total_q, 3) if total_q else 0.0

    # avg review difficulty
    review_items = session.exec(select(ReviewItem).where(ReviewItem.child_id == child.id)).all()
    avg_diff = round(sum(r.difficulty_score for r in review_items) / len(review_items), 2) if review_items else 0.0

    level = compute_and_update_child_level(session=session, child=child)
    next_at = _LEVEL_THRESHOLDS.get(level, 999)

    return LevelAnalysisSchema(
        level=level,
        label=_LEVEL_LABELS.get(level, "Desconhecido"),
        vocabulary_learned=vocab,
        quiz_accuracy=accuracy,
        avg_review_difficulty=avg_diff,
        next_level_at=next_at,
        target_language=child.target_language,
    )


@app.post("/api/chat", response_model=ChatResponseSchema)
async def chat_with_tutor(
    payload: ChatRequestSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ChatResponseSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    response_text = tutor_service.build_response(
        message=payload.message,
        history=payload.history,
        session=session,
    )
    audio_url = None
    if child.auto_audio:
        audio_file = await tts_service.generate_speech(
            response_text,
            child.voice_preference,
        )
        if audio_file:
            audio_url = tts_service.get_audio_url(audio_file)

    return ChatResponseSchema(response=response_text, audio_url=audio_url)


@app.post("/api/audio/speak", response_model=SpeakResponseSchema)
async def speak_text(
    payload: SpeakRequestSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> SpeakResponseSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    audio_file = await tts_service.generate_speech(
        payload.text,
        payload.voice or child.voice_preference,
    )
    if not audio_file:
        return SpeakResponseSchema(audio_url=None, fallback_text=payload.text)

    return SpeakResponseSchema(audio_url=tts_service.get_audio_url(audio_file))


@app.post("/api/parent/login")
def parent_login(
    request: ParentLoginSchema,
    response: Response,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    correct_password = os.getenv("PARENT_PASSWORD", "tutor123")
    if request.password != correct_password:
        raise HTTPException(status_code=401, detail="Senha incorreta")

    create_parent_session(response=response, session=session, user_id=None)
    return {"status": "success"}


@app.post("/api/parent/logout")
def parent_logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    clear_parent_session(request=request, response=response, session=session)
    return {"status": "success"}


# ── Auth helpers ──────────────────────────────────────────────────────────────

def validate_cpf(cpf: str) -> bool:
    digits = re.sub(r"\D", "", cpf)
    if len(digits) != 11:
        return False
    if len(set(digits)) == 1:
        return False
    total = sum(int(d) * (10 - i) for i, d in enumerate(digits[:9]))
    r = total % 11
    d1 = 0 if r < 2 else 11 - r
    if int(digits[9]) != d1:
        return False
    total = sum(int(d) * (11 - i) for i, d in enumerate(digits[:10]))
    r = total % 11
    d2 = 0 if r < 2 else 11 - r
    return int(digits[10]) == d2


def hash_cpf(cpf: str) -> str:
    digits = re.sub(r"\D", "", cpf)
    return hashlib.sha256(digits.encode()).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260000)
    return salt.hex() + ":" + dk.hex()


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt_hex, dk_hex = hashed.split(":", 1)
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260000)
        return secrets.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# ── API key encryption (Fernet symmetric, key derived from SESSION_SECRET) ───

def _derive_fernet_key() -> bytes:
    raw = hashlib.sha256(SESSION_SECRET.encode()).digest()
    return base64.urlsafe_b64encode(raw)


def encrypt_api_key(api_key: str) -> str:
    return Fernet(_derive_fernet_key()).encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    return Fernet(_derive_fernet_key()).decrypt(encrypted.encode()).decode()


def mask_api_key(api_key: str) -> str:
    clean = api_key.strip()
    if len(clean) >= 8:
        return f"{clean[:4]}...{clean[-4:]}"
    return "****"


def validate_ai_provider(provider: str | None) -> str:
    normalized = (provider or "gemini").strip().lower()
    if normalized not in AI_PROVIDER_IDS:
        raise HTTPException(status_code=422, detail="Provedor de IA nao suportado.")
    return normalized


def default_model_for_provider(provider: str) -> str:
    return AI_PROVIDER_DEFAULT_MODELS.get(provider, AI_PROVIDER_DEFAULT_MODELS["gemini"])


def build_ai_settings_schema(record: UserAISettings | None) -> UserAISettingsSchema:
    if record is None:
        return UserAISettingsSchema(
            provider="gemini",
            model=AI_PROVIDER_DEFAULT_MODELS["gemini"],
            has_api_key=False,
        )
    preview = "****"
    try:
        preview = mask_api_key(decrypt_api_key(record.api_key_encrypted))
    except InvalidToken:
        preview = "****"
    except Exception:
        preview = "****"
    return UserAISettingsSchema(
        provider=record.provider,
        model=record.model,
        base_url=record.base_url,
        has_api_key=True,
        api_key_preview=preview,
    )


def get_user_ai_settings_record(user_id: int, session: Session) -> UserAISettings | None:
    return session.exec(select(UserAISettings).where(UserAISettings.user_id == user_id)).first()


def save_ai_settings_for_user(
    *,
    user_id: int,
    payload: UserAISettingsUpdateSchema,
    session: Session,
) -> UserAISettings:
    provider = validate_ai_provider(payload.provider)
    model = (payload.model or "").strip() or default_model_for_provider(provider)
    api_key = (payload.api_key or "").strip()
    base_url = (payload.base_url or "").strip() or None
    now = datetime.utcnow()

    record = get_user_ai_settings_record(user_id, session)
    if record is None:
        if not api_key:
            raise HTTPException(status_code=422, detail="Chave de API obrigatoria para salvar as configuracoes.")
        record = UserAISettings(
            user_id=user_id,
            provider=provider,
            api_key_encrypted=encrypt_api_key(api_key),
            model=model,
            base_url=base_url,
            created_at=now,
            updated_at=now,
        )
    else:
        record.provider = provider
        if api_key:
            record.api_key_encrypted = encrypt_api_key(api_key)
        record.model = model
        record.base_url = base_url
        record.updated_at = now

    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def _get_user_ai_config_for_user_id(user_id: int | None, session: Session) -> AIProviderConfig | None:
    if user_id is None:
        return None
    record = get_user_ai_settings_record(user_id, session)
    if record is None:
        return None
    try:
        api_key = decrypt_api_key(record.api_key_encrypted)
    except Exception:
        return None
    return AIProviderConfig(
        provider=record.provider,
        api_key=api_key,
        model=record.model,
        base_url=record.base_url,
    )


def _get_user_ai_config(session_record: UserSession | None, session: Session) -> AIProviderConfig | None:
    """Return the stored AIProviderConfig for the current user, or None if not configured."""
    if session_record is None:
        return None
    return _get_user_ai_config_for_user_id(session_record.user_id, session)


# ── Coding Curriculum endpoints ───────────────────────────────────────────────

@app.get("/api/coding/subjects", response_model=list[ProgrammingSubjectSchema])
def list_coding_subjects(request: Request, session: Session = Depends(get_session)) -> list[ProgrammingSubjectSchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subjects = session.exec(select(ProgrammingSubject).where(ProgrammingSubject.child_id == child.id)).all()
    result = []
    for s in subjects:
        topics = session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == s.id)).all()
        result.append(ProgrammingSubjectSchema(
            id=s.id or 0, child_id=s.child_id, name=s.name,
            description=s.description, icon_emoji=s.icon_emoji,
            created_at=s.created_at,
            topic_count=len(topics),
            studied_count=sum(1 for t in topics if t.status in ("studied", "mastered")),
            due_review_count=count_due_coding_items(session, child.id or 0, subject_id=s.id),
        ))
    return result


@app.post("/api/coding/subjects", response_model=ProgrammingSubjectSchema, status_code=201)
def create_coding_subject(
    payload: CreateProgrammingSubjectSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingSubjectSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = ProgrammingSubject(
        child_id=child.id or 0,
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        icon_emoji=(payload.icon_emoji or "").strip() or None,
        created_at=datetime.utcnow(),
    )
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return ProgrammingSubjectSchema(
        id=subject.id or 0, child_id=subject.child_id, name=subject.name,
        description=subject.description, icon_emoji=subject.icon_emoji,
        created_at=subject.created_at,
        topic_count=0,
        studied_count=0,
        due_review_count=0,
    )


@app.put("/api/coding/subjects/{subject_id}", response_model=ProgrammingSubjectSchema)
def update_coding_subject(
    subject_id: int,
    payload: UpdateProgrammingSubjectSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingSubjectSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    if payload.name is not None:
        subject.name = payload.name.strip()
    if payload.description is not None:
        subject.description = payload.description.strip() or None
    if payload.icon_emoji is not None:
        subject.icon_emoji = payload.icon_emoji.strip() or None
    session.add(subject)
    session.commit()
    session.refresh(subject)
    topics = session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject.id)).all()
    return ProgrammingSubjectSchema(
        id=subject.id or 0, child_id=subject.child_id, name=subject.name,
        description=subject.description, icon_emoji=subject.icon_emoji,
        created_at=subject.created_at,
        topic_count=len(topics),
        studied_count=sum(1 for t in topics if t.status in ("studied", "mastered")),
        due_review_count=count_due_coding_items(session, child.id or 0, subject_id=subject.id),
    )


@app.delete("/api/coding/subjects/{subject_id}", status_code=204)
def delete_coding_subject(
    subject_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    topics = session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)).all()
    for topic in topics:
        flashcards = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all()
        for fc in flashcards:
            for ri in session.exec(select(CodingReviewItem).where(CodingReviewItem.flashcard_id == fc.id)).all():
                session.delete(ri)
            session.delete(fc)
        session.delete(topic)
    session.delete(subject)
    session.commit()


@app.get("/api/coding/subjects/{subject_id}/topics", response_model=list[ProgrammingTopicSchema])
def list_coding_topics(
    subject_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> list[ProgrammingTopicSchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    topics = sorted(
        session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)).all(),
        key=lambda t: t.order_index,
    )
    return [
        ProgrammingTopicSchema(
            id=t.id or 0, subject_id=t.subject_id, title=t.title,
            order_index=t.order_index, status=t.status,
            ai_content=t.ai_content, notes=t.notes,
            created_at=t.created_at, updated_at=t.updated_at,
            flashcard_count=len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == t.id)).all()),
        )
        for t in topics
    ]


@app.post("/api/coding/subjects/{subject_id}/topics/generate", response_model=ProgrammingTopicSchema, status_code=201)
def generate_coding_subject_topic(
    subject_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingTopicSchema:
    user_session = require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Materia nao encontrada.")

    ai_config = _get_user_ai_config(user_session, session)
    if ai_config is None:
        raise HTTPException(
            status_code=422,
            detail="Configuracao de IA nao encontrada. Configure sua chave de API em Configuracoes.",
        )

    existing_topics = sorted(
        session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)).all(),
        key=lambda t: t.order_index,
    )
    existing_titles = [topic.title for topic in existing_topics]
    existing_titles_text = ", ".join(existing_titles) if existing_titles else "nenhum"
    prompt = (
        "Sugira o proximo topico de estudo para uma materia de programacao.\n"
        f"Materia: {subject.name}\n"
        f"Topicos existentes: {existing_titles_text}\n"
        "Escolha algo pratico, especifico e progressivo para estudar agora.\n"
        "Evite repetir topicos existentes.\n"
        "Retorne apenas JSON valido neste formato:\n"
        '{ "title": "string" }\n'
    )
    try:
        response_text = phrase_generation_service.generate_json_text(
            system_text=(
                "Voce e um professor de programacao. "
                "Retorne somente JSON valido, sem markdown e sem comentarios."
            ),
            prompt=prompt,
            temperature=0.6,
            ai_config=ai_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = _extract_json_object(response_text)
    title = str(data.get("title") or data.get("topic") or "").strip()[:200]
    if not title:
        raise HTTPException(status_code=502, detail="IA nao sugeriu um topico valido.")

    existing_normalized = {item.lower().strip() for item in existing_titles}
    if title.lower().strip() in existing_normalized:
        title = f"{title} - pratica"[:200]

    try:
        content = generate_topic_ai_content(
            subject_name=subject.name,
            topic_title=title,
            ai_config=ai_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    now = datetime.utcnow()
    topic = ProgrammingTopic(
        subject_id=subject_id,
        title=title,
        order_index=len(existing_topics),
        status="not_started",
        ai_content=content.model_dump(),
        created_at=now,
        updated_at=now,
    )
    session.add(topic)
    session.flush()
    for fc_draft in content.flashcards:
        fc = ProgrammingFlashcard(
            topic_id=topic.id or 0,
            subject_id=subject_id,
            child_id=child.id or 0,
            front=fc_draft.front[:500],
            back=fc_draft.back[:2000],
            code_example=(fc_draft.code_example or "")[:3000] or None,
            created_at=now,
        )
        session.add(fc)
        session.flush()
        seed_coding_review_item(session, child.id or 0, fc.id or 0)
    session.commit()
    session.refresh(topic)
    fc_count = len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all())
    return ProgrammingTopicSchema(
        id=topic.id or 0, subject_id=topic.subject_id, title=topic.title,
        order_index=topic.order_index, status=topic.status,
        ai_content=topic.ai_content, notes=topic.notes,
        created_at=topic.created_at, updated_at=topic.updated_at,
        flashcard_count=fc_count,
    )


@app.post("/api/coding/subjects/{subject_id}/topics", response_model=ProgrammingTopicSchema, status_code=201)
def create_coding_topic(
    subject_id: int,
    payload: CreateProgrammingTopicSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingTopicSchema:
    user_session = require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    existing_count = len(session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)).all())
    order_index = payload.order_index if payload.order_index is not None else existing_count
    now = datetime.utcnow()
    topic = ProgrammingTopic(
        subject_id=subject_id,
        title=payload.title.strip(),
        order_index=order_index,
        status="not_started",
        created_at=now,
        updated_at=now,
    )
    session.add(topic)
    session.commit()
    session.refresh(topic)
    if payload.generate_ai:
        ai_config = _get_user_ai_config(user_session, session)
        if ai_config:
            try:
                content = generate_topic_ai_content(
                    subject_name=subject.name,
                    topic_title=topic.title,
                    ai_config=ai_config,
                )
                topic.ai_content = content.model_dump()
                for fc_draft in content.flashcards:
                    fc = ProgrammingFlashcard(
                        topic_id=topic.id or 0,
                        subject_id=subject_id,
                        child_id=child.id or 0,
                        front=fc_draft.front[:500],
                        back=fc_draft.back[:2000],
                        code_example=(fc_draft.code_example or "")[:3000] or None,
                        created_at=now,
                    )
                    session.add(fc)
                    session.flush()
                    seed_coding_review_item(session, child.id or 0, fc.id or 0)
                topic.updated_at = datetime.utcnow()
                session.add(topic)
                session.commit()
                session.refresh(topic)
            except Exception:
                session.rollback()
                session.refresh(topic)  # re-attach topic after rollback
    fc_count = len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all())
    return ProgrammingTopicSchema(
        id=topic.id or 0, subject_id=topic.subject_id, title=topic.title,
        order_index=topic.order_index, status=topic.status,
        ai_content=topic.ai_content, notes=topic.notes,
        created_at=topic.created_at, updated_at=topic.updated_at,
        flashcard_count=fc_count,
    )


@app.put("/api/coding/topics/{topic_id}", response_model=ProgrammingTopicSchema)
def update_coding_topic(
    topic_id: int,
    payload: UpdateProgrammingTopicSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingTopicSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    if payload.title is not None:
        topic.title = payload.title.strip()
    if payload.order_index is not None:
        topic.order_index = payload.order_index
    if payload.status is not None:
        if payload.status not in VALID_TOPIC_STATUSES:
            raise HTTPException(status_code=422, detail="Status inválido. Use: not_started, studied, mastered.")
        topic.status = payload.status
    if payload.notes is not None:
        topic.notes = payload.notes
    if payload.ai_content is not None:
        topic.ai_content = payload.ai_content
    topic.updated_at = datetime.utcnow()
    session.add(topic)
    session.commit()
    session.refresh(topic)
    fc_count = len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all())
    return ProgrammingTopicSchema(
        id=topic.id or 0, subject_id=topic.subject_id, title=topic.title,
        order_index=topic.order_index, status=topic.status,
        ai_content=topic.ai_content, notes=topic.notes,
        created_at=topic.created_at, updated_at=topic.updated_at,
        flashcard_count=fc_count,
    )


@app.delete("/api/coding/topics/{topic_id}", status_code=204)
def delete_coding_topic(
    topic_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    flashcards = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic_id)).all()
    for fc in flashcards:
        for ri in session.exec(select(CodingReviewItem).where(CodingReviewItem.flashcard_id == fc.id)).all():
            session.delete(ri)
        session.delete(fc)
    session.delete(topic)
    session.commit()


@app.post("/api/coding/topics/{topic_id}/generate", response_model=ProgrammingTopicSchema)
def generate_coding_topic_content(
    topic_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingTopicSchema:
    user_session = require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    ai_config = _get_user_ai_config(user_session, session)
    if ai_config is None:
        raise HTTPException(status_code=422, detail="Configuração de IA não encontrada. Configure sua chave de API em Configurações.")
    try:
        content = generate_topic_ai_content(
            subject_name=subject.name,
            topic_title=topic.title,
            ai_config=ai_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    topic.ai_content = content.model_dump()
    topic.updated_at = datetime.utcnow()
    session.add(topic)
    # Only seed flashcards if topic has none yet
    existing_fcs = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic_id)).all()
    if not existing_fcs:
        for fc_draft in content.flashcards:
            fc = ProgrammingFlashcard(
                topic_id=topic_id,
                subject_id=subject.id or 0,
                child_id=child.id or 0,
                front=fc_draft.front[:500],
                back=fc_draft.back[:2000],
                code_example=(fc_draft.code_example or "")[:3000] or None,
                created_at=datetime.utcnow(),
            )
            session.add(fc)
            session.flush()
            seed_coding_review_item(session, child.id or 0, fc.id or 0)
    session.commit()
    session.refresh(topic)
    fc_count = len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all())
    return ProgrammingTopicSchema(
        id=topic.id or 0, subject_id=topic.subject_id, title=topic.title,
        order_index=topic.order_index, status=topic.status,
        ai_content=topic.ai_content, notes=topic.notes,
        created_at=topic.created_at, updated_at=topic.updated_at,
        flashcard_count=fc_count,
    )


@app.get("/api/coding/topics/{topic_id}/flashcards", response_model=list[ProgrammingFlashcardSchema])
def list_topic_flashcards(
    topic_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> list[ProgrammingFlashcardSchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    flashcards = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic_id)).all()
    return [
        ProgrammingFlashcardSchema(
            id=fc.id or 0, topic_id=fc.topic_id, subject_id=fc.subject_id,
            front=fc.front, back=fc.back, code_example=fc.code_example,
            created_at=fc.created_at,
        )
        for fc in flashcards
    ]


@app.post("/api/coding/topics/{topic_id}/flashcards", response_model=ProgrammingFlashcardSchema, status_code=201)
def create_topic_flashcard(
    topic_id: int,
    payload: CreateProgrammingFlashcardSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingFlashcardSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    fc = ProgrammingFlashcard(
        topic_id=topic_id,
        subject_id=topic.subject_id,
        child_id=child.id or 0,
        front=payload.front.strip(),
        back=payload.back.strip(),
        code_example=(payload.code_example or "").strip() or None,
        created_at=datetime.utcnow(),
    )
    session.add(fc)
    session.flush()
    seed_coding_review_item(session, child.id or 0, fc.id or 0)
    session.commit()
    session.refresh(fc)
    return ProgrammingFlashcardSchema(
        id=fc.id or 0, topic_id=fc.topic_id, subject_id=fc.subject_id,
        front=fc.front, back=fc.back, code_example=fc.code_example,
        created_at=fc.created_at,
    )


@app.put("/api/coding/flashcards/{flashcard_id}", response_model=ProgrammingFlashcardSchema)
def update_coding_flashcard(
    flashcard_id: int,
    payload: UpdateProgrammingFlashcardSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingFlashcardSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    fc = session.get(ProgrammingFlashcard, flashcard_id)
    if fc is None or fc.child_id != child.id:
        raise HTTPException(status_code=404, detail="Flashcard não encontrado.")
    if payload.front is not None:
        fc.front = payload.front.strip()
    if payload.back is not None:
        fc.back = payload.back.strip()
    if payload.code_example is not None:
        fc.code_example = payload.code_example.strip() or None
    session.add(fc)
    session.commit()
    session.refresh(fc)
    return ProgrammingFlashcardSchema(
        id=fc.id or 0, topic_id=fc.topic_id, subject_id=fc.subject_id,
        front=fc.front, back=fc.back, code_example=fc.code_example,
        created_at=fc.created_at,
    )


@app.delete("/api/coding/flashcards/{flashcard_id}", status_code=204)
def delete_coding_flashcard(
    flashcard_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    fc = session.get(ProgrammingFlashcard, flashcard_id)
    if fc is None or fc.child_id != child.id:
        raise HTTPException(status_code=404, detail="Flashcard não encontrado.")
    for ri in session.exec(select(CodingReviewItem).where(CodingReviewItem.flashcard_id == flashcard_id)).all():
        session.delete(ri)
    session.delete(fc)
    session.commit()


@app.get("/api/coding/review", response_model=CodingReviewSessionSchema)
def get_coding_review(
    request: Request,
    subject_id: Optional[int] = None,
    limit: int = 20,
    session: Session = Depends(get_session),
) -> CodingReviewSessionSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    cards = build_coding_review_cards(session, child.id or 0, subject_id=subject_id, limit=limit)
    return CodingReviewSessionSchema(total_due=len(cards), items=cards)


@app.post("/api/coding/review/attempt", response_model=CodingReviewResultSchema)
def submit_coding_review_attempt(
    payload: CodingReviewAttemptSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> CodingReviewResultSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    try:
        item = register_coding_review_attempt(
            session=session,
            child_id=child.id or 0,
            review_item_id=payload.review_item_id,
            correct=payload.correct,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    session.commit()
    session.refresh(item)
    return CodingReviewResultSchema(
        review_item_id=item.id or 0,
        difficulty_score=item.difficulty_score,
        next_review=item.next_review,
        error_count=item.error_count,
        correct_count=item.correct_count,
    )


# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=UserResponseSchema, status_code=201)
def user_register(
    payload: UserRegisterSchema,
    session: Session = Depends(get_session),
) -> UserResponseSchema:
    if not validate_cpf(payload.cpf):
        raise HTTPException(status_code=422, detail="CPF inválido.")

    email = payload.email.lower().strip()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado.")

    cpf_hash = hash_cpf(payload.cpf)
    if session.exec(select(User).where(User.cpf_hash == cpf_hash)).first():
        raise HTTPException(status_code=409, detail="Este CPF já está cadastrado.")

    if payload.ai_api_key:
        validate_ai_provider(payload.ai_provider)

    user = User(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=email,
        cpf_hash=cpf_hash,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    child_name = (payload.child_name or payload.first_name).strip() or "Kid"
    child = ChildProfile(
        name=child_name,
        age_group="7-9",
        target_language=payload.target_language or "English",
        user_id=user.id,
    )
    session.add(child)
    session.commit()

    if payload.ai_api_key and user.id is not None:
        save_ai_settings_for_user(
            user_id=user.id,
            payload=UserAISettingsUpdateSchema(
                provider=payload.ai_provider or "gemini",
                api_key=payload.ai_api_key,
                model=payload.ai_model,
                base_url=payload.ai_base_url,
            ),
            session=session,
        )

    return UserResponseSchema.model_validate(user)


@app.post("/api/auth/login")
def user_login(
    payload: UserLoginSchema,
    response: Response,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    user = session.exec(select(User).where(User.email == payload.email.lower().strip())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    if not session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).first():
        session.add(ChildProfile(name=user.first_name, age_group="7-9", user_id=user.id))
        session.commit()

    create_parent_session(response=response, session=session, user_id=user.id)
    return {"status": "success", "name": user.first_name}


@app.get("/api/auth/me")
def user_me(
    request: Request,
    session: Session = Depends(get_session),
) -> UserResponseSchema:
    session_record = require_parent_session(request, session)
    user_id = session_record.user_id
    if user_id is None:
        raise HTTPException(status_code=404, detail="Sessão sem usuário vinculado.")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return UserResponseSchema.model_validate(user)


@app.post("/api/auth/logout")
def user_logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    clear_parent_session(request=request, response=response, session=session)
    return {"status": "success"}


def normalize_oauth_next(next_path: str | None) -> str:
    value = (next_path or "/parents").strip()
    if not value.startswith("/") or value.startswith("//"):
        return "/parents"
    return value


def google_oauth_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)


def build_frontend_redirect(next_path: str | None) -> str:
    return f"{FRONTEND_BASE_URL}{normalize_oauth_next(next_path)}"


def get_or_create_google_user(profile: dict, session: Session) -> User:
    google_sub = str(profile.get("sub") or "").strip()
    email = str(profile.get("email") or "").strip().lower()
    if not google_sub or not email:
        raise HTTPException(status_code=400, detail="Perfil do Google sem e-mail ou identificador.")

    user = session.exec(select(User).where(User.google_sub == google_sub)).first()
    if user is None:
        user = session.exec(select(User).where(User.email == email)).first()

    first_name = str(profile.get("given_name") or "").strip() or email.split("@")[0]
    last_name = str(profile.get("family_name") or "").strip() or "Google"
    if user is None:
        user = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            cpf_hash=f"google:{hashlib.sha256(google_sub.encode()).hexdigest()}",
            password_hash=hash_password(secrets.token_urlsafe(32)),
            google_sub=google_sub,
            auth_provider="google",
        )
    else:
        user.google_sub = google_sub
        user.auth_provider = "google" if user.auth_provider == "password" else user.auth_provider
        if not user.first_name:
            user.first_name = first_name
        if not user.last_name:
            user.last_name = last_name

    session.add(user)
    session.commit()
    session.refresh(user)

    if not session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).first():
        session.add(ChildProfile(name=user.first_name or "Kid", age_group="7-9", user_id=user.id))
        session.commit()

    return user


@app.get("/api/auth/google/start")
def google_auth_start(next: str = "/parents") -> RedirectResponse:
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="OAuth do Google nao esta configurado no backend.")

    state = secrets.token_urlsafe(32)
    redirect = RedirectResponse(
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode(
            {
                "client_id": GOOGLE_CLIENT_ID,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "prompt": "select_account",
            }
        )
    )
    redirect.set_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE_NAME,
        value=state,
        httponly=True,
        secure=PARENT_COOKIE_SECURE,
        samesite=PARENT_COOKIE_SAMESITE,
        domain=PARENT_COOKIE_DOMAIN,
        max_age=600,
    )
    redirect.set_cookie(
        key=GOOGLE_OAUTH_NEXT_COOKIE_NAME,
        value=normalize_oauth_next(next),
        httponly=True,
        secure=PARENT_COOKIE_SECURE,
        samesite=PARENT_COOKIE_SAMESITE,
        domain=PARENT_COOKIE_DOMAIN,
        max_age=600,
    )
    return redirect


@app.get("/api/auth/google/callback")
def google_auth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    session: Session = Depends(get_session),
) -> RedirectResponse:
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="OAuth do Google nao esta configurado no backend.")
    expected_state = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)
    if not state or not expected_state or state != expected_state:
        raise HTTPException(status_code=400, detail="State do Google invalido.")
    if not code:
        raise HTTPException(status_code=400, detail="Codigo do Google ausente.")

    try:
        token_response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": GOOGLE_REDIRECT_URI,
            },
            timeout=20,
        )
        token_response.raise_for_status()
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Google nao retornou access_token.")

        profile_response = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        profile_response.raise_for_status()
        profile = profile_response.json()
    except HTTPException:
        raise
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Falha no login com Google: {exc}") from exc

    if profile.get("email_verified") is False:
        raise HTTPException(status_code=403, detail="E-mail do Google nao verificado.")

    user = get_or_create_google_user(profile, session)
    next_path = request.cookies.get(GOOGLE_OAUTH_NEXT_COOKIE_NAME)
    redirect = RedirectResponse(build_frontend_redirect(next_path))
    create_parent_session(response=redirect, session=session, user_id=user.id)
    redirect.delete_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE_NAME,
        domain=PARENT_COOKIE_DOMAIN,
        secure=PARENT_COOKIE_SECURE,
        samesite=PARENT_COOKIE_SAMESITE,
    )
    redirect.delete_cookie(
        key=GOOGLE_OAUTH_NEXT_COOKIE_NAME,
        domain=PARENT_COOKIE_DOMAIN,
        secure=PARENT_COOKIE_SECURE,
        samesite=PARENT_COOKIE_SAMESITE,
    )
    return redirect


@app.get("/api/parent/settings", response_model=ChildProfileSchema)
def get_parent_settings(
    request: Request,
    session: Session = Depends(get_session),
) -> ChildProfileSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    return ChildProfileSchema.model_validate(child)


@app.get("/api/parent/children", response_model=list[ChildProfileSchema])
def list_parent_children(
    request: Request,
    session: Session = Depends(get_session),
) -> list[ChildProfileSchema]:
    session_record = require_parent_session(request, session)
    user_id = session_record.user_id
    if user_id is not None:
        children = session.exec(
            select(ChildProfile)
            .where(ChildProfile.user_id == user_id)
            .order_by(ChildProfile.created_at, ChildProfile.id)
        ).all()
    else:
        # Legacy password-only login: see all children (backwards compat)
        children = session.exec(select(ChildProfile).order_by(ChildProfile.created_at, ChildProfile.id)).all()
    return [ChildProfileSchema.model_validate(normalize_child_voice_preference(child, session=session)) for child in children]


@app.get("/api/parent/progress", response_model=list[ChildProgressSummarySchema])
def list_parent_progress(
    request: Request,
    session: Session = Depends(get_session),
) -> list[ChildProgressSummarySchema]:
    children = list_parent_children(request=request, session=session)
    summaries: list[ChildProgressSummarySchema] = []
    for child_schema in children:
        child = session.get(ChildProfile, child_schema.id)
        if child is None:
            continue
        normalized_child = normalize_child_voice_preference(child, session=session)
        summaries.append(
            ChildProgressSummarySchema(
                child=ChildProfileSchema.model_validate(normalized_child),
                progress=build_progress_for_child(session=session, child=normalized_child),
            )
        )
    return summaries


@app.post("/api/parent/children", response_model=ChildProfileSchema)
def create_parent_child(
    request: Request,
    payload: CreateChildProfileSchema,
    session: Session = Depends(get_session),
) -> ChildProfileSchema:
    session_record = require_parent_session(request, session)
    user_id = session_record.user_id
    child = ChildProfile(
        name=payload.name.strip(),
        age_group=payload.age_group.strip(),
        voice_preference=tts_service.normalize_voice(payload.voice_preference),
        auto_audio=True if payload.auto_audio is None else payload.auto_audio,
        target_language=payload.target_language or "English",
        user_id=user_id,
    )
    session.add(child)
    session.commit()
    session.refresh(child)
    return ChildProfileSchema.model_validate(child)

@app.post("/api/parent/settings", response_model=ChildProfileSchema)
def update_parent_settings(
    request: Request,
    payload: ParentSettingsUpdateSchema,
    session: Session = Depends(get_session),
) -> ChildProfileSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)

    if payload.child_name:
        child.name = payload.child_name
    if payload.age_group:
        child.age_group = payload.age_group
    if payload.voice_preference:
        child.voice_preference = tts_service.normalize_voice(payload.voice_preference)
    if payload.auto_audio is not None:
        child.auto_audio = payload.auto_audio
    if payload.target_language:
        child.target_language = payload.target_language

    session.add(child)
    session.commit()
    session.refresh(child)
    return ChildProfileSchema.model_validate(child)


@app.post("/api/parent/generate-lesson", response_model=GenerateLessonResponseSchema)
def generate_parent_lesson(
    request: Request,
    payload: GenerateLessonRequestSchema,
    session: Session = Depends(get_session),
) -> GenerateLessonResponseSchema:
    session_record = require_parent_session(request, session)
    ai_config = _get_user_ai_config(session_record, session)

    if session_record.user_id is not None and ai_config is None:
        raise HTTPException(
            status_code=403,
            detail="Configure uma chave de API de IA na sua conta antes de gerar licoes.",
        )
    if not phrase_generation_service.is_configured(ai_config):
        raise HTTPException(
            status_code=503,
            detail="Chave de API de IA nao esta configurada.",
        )

    child = get_requested_child(request=request, session=session)
    level = compute_and_update_child_level(session=session, child=child)
    quantity = max(1, min(10, payload.quantity or 1))

    generated_lessons: list[LessonSchema] = []

    for i in range(quantity):
        next_day = get_next_lesson_day(session=session)
        existing_phrases = [
            item.word_en
            for item in session.exec(select(LessonItem).order_by(LessonItem.id)).all()
        ]

        try:
            draft = phrase_generation_service.generate_lesson_draft(
                next_day=next_day,
                age_group=child.age_group,
                existing_phrases=existing_phrases,
                topic=payload.topic,
                level=level,
                target_language=child.target_language,
                ai_config=ai_config,
            )
        except Exception as exc:
            if i == 0:
                raise HTTPException(
                    status_code=502,
                    detail=f"Nao foi possivel gerar novas frases com o Gemini. {exc}",
                ) from exc
            break  # partial success — return what was already generated

        lesson = Lesson(
            id=next_day,
            title=f"{child.target_language} de hoje - Dia {next_day}",
            theme="Frases do dia",
            objective=f"Aprenda 3 frases uteis em {child.target_language.lower()} hoje.",
            content={
                "daily_goal": "3 frases para hoje",
                "phrase_breakdowns": [
                    {
                        "phrase_en": phrase.phrase_en,
                        "phrase_pt": phrase.phrase_pt,
                        "word_by_word": [
                            {"en": pair.en, "pt": pair.pt}
                            for pair in phrase.word_by_word
                        ],
                    }
                    for phrase in draft.phrases
                ],
                "generated_by": ai_config.provider if ai_config else "gemini",
                "generated_model": ai_config.model if ai_config else phrase_generation_service.model,
                "generated_level": level,
                "generated_topic": payload.topic.strip() if payload.topic else None,
                "generated_at": datetime.utcnow().isoformat(),
            },
            child_id=None,  # shared — available to all children at this level
            level=level,
            target_language=child.target_language,
        )
        session.add(lesson)
        session.commit()
        session.refresh(lesson)

        created_items: list[LessonItem] = []
        for phrase in draft.phrases:
            lesson_item = LessonItem(
                word_en=phrase.phrase_en,
                word_pt=phrase.phrase_pt,
                example_sentence_en=phrase.example_sentence_en,
                example_sentence_pt=phrase.example_sentence_pt,
                lesson_id=lesson.id,
            )
            session.add(lesson_item)
            created_items.append(lesson_item)

        session.commit()

        quiz_questions = build_generated_quiz_questions(session=session, lesson_items=created_items, target_language=child.target_language)
        lesson.content = {
            **(lesson.content or {}),
            "quiz_questions": [question.model_dump() for question in quiz_questions],
        }
        session.add(lesson)
        session.commit()
        session.refresh(lesson)

        generated_lessons.append(build_lesson_response(session=session, lesson=lesson, child_id=child.id or 0))

    count = len(generated_lessons)
    msg = (
        f"{count} {'licao foi gerada' if count == 1 else 'licoes foram geradas'} e salva{'s' if count > 1 else ''} no banco de dados."
    )
    return GenerateLessonResponseSchema(
        status="success",
        lesson=generated_lessons[-1],
        lessons=generated_lessons,
        message=msg,
    )


# ══════════════════════════════════════════════════════════════════════════════
# USER AI SETTINGS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/ai/providers", response_model=list[AIProviderSchema])
def list_ai_providers() -> list[AIProviderSchema]:
    return [AIProviderSchema(**provider) for provider in AI_PROVIDER_OPTIONS]


@app.get("/api/ai/settings", response_model=UserAISettingsSchema)
@app.get("/api/user/ai-settings", response_model=UserAISettingsSchema)
def get_user_ai_settings(
    request: Request,
    session: Session = Depends(get_session),
) -> UserAISettingsSchema:
    session_record = require_parent_session(request, session)
    if session_record.user_id is None:
        raise HTTPException(status_code=403, detail="Configuracoes de IA requerem login de usuario.")
    return build_ai_settings_schema(get_user_ai_settings_record(session_record.user_id, session))


@app.put("/api/ai/settings", response_model=UserAISettingsSchema)
@app.post("/api/user/ai-settings", response_model=UserAISettingsSchema)
def save_user_ai_settings(
    payload: UserAISettingsUpdateSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> UserAISettingsSchema:
    session_record = require_parent_session(request, session)
    if session_record.user_id is None:
        raise HTTPException(status_code=403, detail="Configuracoes de IA requerem login de usuario.")
    record = save_ai_settings_for_user(user_id=session_record.user_id, payload=payload, session=session)
    return build_ai_settings_schema(record)


# ══════════════════════════════════════════════════════════════════════════════
# AI FLASHCARD GENERATION (Diverse Tab)
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/study/diverse/generate-flashcards", response_model=GenerateFlashcardsResponseSchema)
def generate_diverse_flashcards(
    payload: GenerateFlashcardsRequestSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> GenerateFlashcardsResponseSchema:
    require_parent_session(request, session)
    session_record = get_request_user_session(request=request, session=session)

    # Inline api_key in payload takes priority; otherwise fall back to saved
    # user settings, then the server-wide GEMINI_API_KEY env var.
    if payload.api_key and payload.api_key.strip():
        from services.phrase_generator_service import AIProviderConfig  # noqa: PLC0415
        provider = getattr(payload, "provider", "gemini") or "gemini"
        ai_config = AIProviderConfig(
            provider=provider,
            api_key=payload.api_key.strip(),
            model=AI_PROVIDER_DEFAULT_MODELS.get(provider, "gemini-2.5-flash"),
        )
    else:
        ai_config = _get_user_ai_config(session_record, session)
        if session_record is not None and session_record.user_id is not None and ai_config is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Configure uma chave de API de IA na sua conta antes de criar aulas "
                    "para materias diversas."
                ),
            )

    if not phrase_generation_service.is_configured(ai_config):
        raise HTTPException(
            status_code=503,
            detail=(
                "Nenhuma chave de API de IA configurada. "
                "Informe sua chave Gemini no campo abaixo ou salve-a nas Configuracoes de IA."
            ),
        )

    subject = payload.subject.strip()
    suggest_subject = payload.suggest_subject
    if not subject and not suggest_subject:
        raise HTTPException(status_code=400, detail="Informe uma materia ou peca para a IA sugerir uma.")

    count = payload.count
    avoid_topics = [str(item).strip()[:120] for item in payload.avoid_topics if str(item).strip()]
    avoid_topics_text = "\n".join(f"- {item}" for item in avoid_topics[:60])
    avoid_instruction = (
        "Topicos ja criados nesta materia. Nao repita nem gere variacoes muito parecidas:\n"
        f"{avoid_topics_text}\n"
        if avoid_topics_text
        else ""
    )

    system_text = (
        "Voce cria flashcards educativos em formato JSON. "
        "Gere flashcards com perguntas claras e respostas concisas. "
        "Retorne apenas JSON valido, sem markdown ou comentarios extras."
    )
    if suggest_subject:
        subject_hint = f"Use esta ideia como pista se fizer sentido: '{subject}'." if subject else (
            "Escolha uma materia util para estudo hoje."
        )
        prompt = (
            f"Sugira uma materia de estudo e crie {count} flashcards iniciais para ela.\n"
            f"{subject_hint}\n"
            f"{avoid_instruction}"
            "Regras:\n"
            "- A materia deve ser curta, clara e adequada para uma aba de estudo.\n"
            "- Cada flashcard deve ter uma 'question' (pergunta ou conceito) e uma 'answer' (resposta ou definicao).\n"
            "- Cada flashcard deve ser novo em relacao aos topicos ja criados.\n"
            "- As perguntas devem ser claras, diretas e educativas.\n"
            "- As respostas devem ser concisas (ate 2 frases).\n"
            "- Escreva em portugues brasileiro.\n"
            "Retorne exatamente neste formato JSON:\n"
            "{\n"
            '  "subject": "string",\n'
            '  "flashcards": [\n'
            "    {\n"
            '      "question": "string",\n'
            '      "answer": "string"\n'
            "    }\n"
            "  ]\n"
            "}\n"
        )
    else:
        prompt = (
            f"Crie {count} flashcards de estudo sobre o assunto: '{subject}'.\n"
            f"{avoid_instruction}"
            "Regras:\n"
            "- Cada flashcard deve ter uma 'question' (pergunta ou conceito) e uma 'answer' (resposta ou definicao).\n"
            "- As perguntas devem ser claras, diretas e educativas.\n"
            "- As respostas devem ser concisas (ate 2 frases).\n"
            "- Cubra os conceitos mais importantes do assunto.\n"
            "- Nao repita topicos ja criados; avance para subtopicos novos, aplicacoes, exemplos ou erros comuns.\n"
            "- Escreva em portugues brasileiro.\n"
            "- Se o assunto for tecnico (ex: programacao, React, Python), use exemplos praticos curtos.\n"
            "Retorne exatamente neste formato JSON:\n"
            "{\n"
            f'  "subject": "{subject}",\n'
            '  "flashcards": [\n'
            "    {\n"
            '      "question": "string",\n'
            '      "answer": "string"\n'
            "    }\n"
            "  ]\n"
            "}\n"
        )

    try:
        response_text = phrase_generation_service.generate_json_text(
            system_text=system_text,
            prompt=prompt,
            temperature=0.7,
            ai_config=ai_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = _extract_json_object(response_text)

    raw_cards = data.get("flashcards") or []
    flashcards = [
        GeneratedFlashcardSchema(
            topic=str(card.get("question", "")).strip()[:120],
            answer=str(card.get("answer", "")).strip()[:300],
        )
        for card in raw_cards
        if isinstance(card, dict) and card.get("question") and card.get("answer")
    ]

    generated_subject = str(data.get("subject") or subject).strip()[:60]
    if not generated_subject:
        generated_subject = "Materia sugerida"

    if not flashcards:
        raise HTTPException(status_code=502, detail="IA nao gerou flashcards validos.")

    return GenerateFlashcardsResponseSchema(subject=generated_subject, flashcards=flashcards)


# ══════════════════════════════════════════════════════════════════════════════
# BOOKS
# ══════════════════════════════════════════════════════════════════════════════

def _build_book_page_schema(page: BookPage) -> BookPageSchema:
    try:
        vocabulary = json.loads(page.vocabulary_json) if page.vocabulary_json else []
    except Exception:
        vocabulary = []
    return BookPageSchema(
        id=page.id or 0,
        page_number=page.page_number,
        text_en=page.text_en,
        text_pt=page.text_pt,
        vocabulary=vocabulary,
    )


def _build_book_schema(book: Book, pages: list[BookPage]) -> BookSchema:
    sorted_pages = sorted(pages, key=lambda p: p.page_number)
    return BookSchema(
        id=book.id or 0,
        title=book.title,
        theme=book.theme,
        level=book.level,
        num_pages=book.num_pages,
        created_at=book.created_at.isoformat(),
        pages=[_build_book_page_schema(p) for p in sorted_pages],
    )


@app.get("/api/books", response_model=list[BookSummarySchema])
def list_books(
    request: Request,
    session: Session = Depends(get_session),
) -> list[BookSummarySchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    # Return shared books at the child's current level (visible to everyone at that level)
    books = session.exec(
        select(Book)
        .where(Book.child_id == None, Book.level == child.current_level)
        .order_by(Book.created_at.desc())
    ).all()
    return [
        BookSummarySchema(
            id=b.id or 0,
            title=b.title,
            theme=b.theme,
            level=b.level,
            num_pages=b.num_pages,
            created_at=b.created_at.isoformat(),
        )
        for b in books
    ]


@app.get("/api/books/{book_id}", response_model=BookSchema)
def get_book(
    book_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> BookSchema:
    require_parent_session(request, session)
    book = session.get(Book, book_id)
    # Shared books (child_id=None) are readable by any authenticated user
    if book is None:
        raise HTTPException(status_code=404, detail="Livro nao encontrado.")
    pages = session.exec(select(BookPage).where(BookPage.book_id == book_id)).all()
    return _build_book_schema(book, list(pages))


@app.post("/api/books/generate", response_model=BookSchema)
def generate_book(
    payload: GenerateBookRequestSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> BookSchema:
    session_record = require_parent_session(request, session)
    ai_config = _get_user_ai_config(session_record, session)
    if session_record.user_id is not None and ai_config is None:
        raise HTTPException(
            status_code=403,
            detail="Configure uma chave de API de IA na sua conta antes de gerar livros.",
        )
    if not book_generation_service.is_configured(ai_config):
        raise HTTPException(
            status_code=503,
            detail="Chave de API de IA nao esta configurada.",
        )

    child = get_requested_child(request=request, session=session)

    # Resolve level: 0 means use child's current level
    level = payload.level if payload.level > 0 else compute_and_update_child_level(
        session=session, child=child
    )

    # ── Check shared pool before generating ──────────────────────────────────
    theme_lower = (payload.theme or "").strip().lower()
    requested_pages = payload.num_pages
    shared_at_level = session.exec(
        select(Book)
        .where(
            Book.child_id == None,
            Book.level == level,
            Book.num_pages == requested_pages,
            Book.target_language == child.target_language,
        )
        .order_by(Book.created_at.desc())
    ).all()

    if shared_at_level:
        if not theme_lower:
            # No theme specified: return a random book from the pool with exact page count
            candidate = shared_at_level[0]
            pages = session.exec(select(BookPage).where(BookPage.book_id == candidate.id)).all()
            return _build_book_schema(candidate, list(pages))
        else:
            # Theme specified: return a book with a matching theme if one exists
            match = next((b for b in shared_at_level if b.theme.lower() == theme_lower), None)
            if match:
                pages = session.exec(select(BookPage).where(BookPage.book_id == match.id)).all()
                return _build_book_schema(match, list(pages))

    # ── Generate a new shared book ────────────────────────────────────────────
    try:
        draft = book_generation_service.generate_book(
            level=level,
            num_pages=payload.num_pages,
            theme=payload.theme or None,
            age_group=child.age_group,
            target_language=child.target_language,
            ai_config=ai_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    book = Book(
        child_id=None,  # shared — visible to all users at this level
        title=draft.title,
        theme=draft.theme,
        level=level,
        num_pages=len(draft.pages),
        target_language=child.target_language,
    )
    session.add(book)
    session.commit()
    session.refresh(book)

    pages: list[BookPage] = []
    for page_draft in draft.pages:
        vocab_json = json.dumps(page_draft.vocabulary, ensure_ascii=False)
        page = BookPage(
            book_id=book.id or 0,
            page_number=page_draft.page_number,
            text_en=page_draft.text_en,
            text_pt=page_draft.text_pt,
            vocabulary_json=vocab_json,
        )
        session.add(page)
        pages.append(page)

    session.commit()
    for page in pages:
        session.refresh(page)

    return _build_book_schema(book, pages)


# ─────────────────────────────────────────────────────────────────────────────
# Admin Learn endpoints
# ─────────────────────────────────────────────────────────────────────────────

ADMIN_LEARN_DIR = PROJECT_ROOT / "content" / "admin-learn"


def _require_admin(request: Request, session: Session) -> User:
    """Returns the logged-in user if their email matches ADMIN_EMAIL, else 403."""
    session_record = require_parent_session(request, session)
    if session_record.user_id is None:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    user = session.get(User, session_record.user_id)
    if user is None:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    if not ADMIN_EMAIL or user.email.lower() != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    return user


@app.get("/api/admin/check")
def admin_check(
    request: Request,
    session: Session = Depends(get_session),
) -> dict[str, bool | str]:
    session_record = get_request_user_session(request=request, session=session)
    if session_record is None or session_record.user_id is None:
        return {"is_admin": False}
    user = session.get(User, session_record.user_id)
    if user is None:
        return {"is_admin": False}
    is_admin = bool(ADMIN_EMAIL) and user.email.lower() == ADMIN_EMAIL
    return {"is_admin": is_admin, "email": user.email if is_admin else ""}


@app.get("/api/admin/learn/modules")
def admin_list_modules(
    request: Request,
    session: Session = Depends(get_session),
) -> list[dict]:
    _require_admin(request, session)
    modules: list[dict] = []
    if not ADMIN_LEARN_DIR.exists():
        return modules
    for category_dir in sorted(ADMIN_LEARN_DIR.iterdir()):
        if not category_dir.is_dir():
            continue
        for module_file in sorted(category_dir.glob("*.json")):
            try:
                data = json.loads(module_file.read_text(encoding="utf-8"))
                modules.append({
                    "slug": data.get("slug", module_file.stem),
                    "title": data.get("title", module_file.stem),
                    "category": data.get("category", category_dir.name),
                    "description": data.get("description", ""),
                    "total_sections": len(data.get("sections", [])),
                    "total_quiz": len(data.get("quiz", [])),
                })
            except Exception:
                continue
    return modules


@app.get("/api/admin/learn/modules/{slug}")
def admin_get_module(
    slug: str,
    request: Request,
    session: Session = Depends(get_session),
) -> dict:
    _require_admin(request, session)
    if not ADMIN_LEARN_DIR.exists():
        raise HTTPException(status_code=404, detail="Modulo nao encontrado.")
    for category_dir in ADMIN_LEARN_DIR.iterdir():
        if not category_dir.is_dir():
            continue
        for module_file in category_dir.glob("*.json"):
            try:
                data = json.loads(module_file.read_text(encoding="utf-8"))
                if data.get("slug") == slug or module_file.stem == slug:
                    return data
            except Exception:
                continue
    raise HTTPException(status_code=404, detail="Modulo nao encontrado.")


@app.get("/api/admin/learn/flashcards")
def admin_list_flashcards(
    request: Request,
    session: Session = Depends(get_session),
) -> list[dict]:
    _require_admin(request, session)
    cards = session.exec(select(AdminFlashcard).order_by(AdminFlashcard.created_at.desc())).all()
    return [
        {
            "id": c.id,
            "front": c.front,
            "back": c.back,
            "category": c.category,
            "code_example": c.code_example,
            "created_at": c.created_at.isoformat(),
        }
        for c in cards
    ]


class AdminFlashcardCreateSchema(BaseModel):
    front: str = Field(min_length=1, max_length=300)
    back: str = Field(min_length=1, max_length=1000)
    category: str = Field(default="general", max_length=40)
    code_example: Optional[str] = Field(default=None, max_length=2000)


@app.post("/api/admin/learn/flashcards", status_code=201)
def admin_create_flashcard(
    payload: AdminFlashcardCreateSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> dict:
    _require_admin(request, session)
    card = AdminFlashcard(
        front=payload.front.strip(),
        back=payload.back.strip(),
        category=payload.category.strip() or "general",
        code_example=payload.code_example.strip() if payload.code_example else None,
    )
    session.add(card)
    session.commit()
    session.refresh(card)
    return {
        "id": card.id,
        "front": card.front,
        "back": card.back,
        "category": card.category,
        "code_example": card.code_example,
        "created_at": card.created_at.isoformat(),
    }


@app.delete("/api/admin/learn/flashcards/{card_id}", status_code=204)
def admin_delete_flashcard(
    card_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    _require_admin(request, session)
    card = session.get(AdminFlashcard, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Flashcard nao encontrado.")
    session.delete(card)
    session.commit()


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", 8001))
    uvicorn.run(app, host=host, port=port)
