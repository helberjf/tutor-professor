import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, SQLModel, create_engine, select

from models.database import Book, BookPage, ChildLessonProgress, ChildProfile, Lesson, LessonItem, QuizAttempt, ReviewItem, User, UserSession
from schemas.schemas import (
    BookPageSchema,
    BookSchema,
    BookSummarySchema,
    ChatRequestSchema,
    ChatResponseSchema,
    ChildProgressSummarySchema,
    ChildProfileSchema,
    CreateChildProfileSchema,
    GenerateBookRequestSchema,
    GenerateLessonRequestSchema,
    GenerateLessonResponseSchema,
    LevelAnalysisSchema,
    LessonItemSchema,
    LessonSchema,
    LessonSummarySchema,
    ParentLoginSchema,
    ParentSettingsUpdateSchema,
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
)
from services.book_service import BookGenerationService
from services.content_service import ContentService
from services.phrase_generator_service import PhraseGenerationService
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
PARENT_COOKIE_SECURE = os.getenv("PARENT_COOKIE_SECURE", "false").lower() == "true"
PARENT_COOKIE_SAMESITE = os.getenv("PARENT_COOKIE_SAMESITE", "lax").lower()
PARENT_COOKIE_DOMAIN = os.getenv("PARENT_COOKIE_DOMAIN") or None
PARENT_COOKIE_MAX_AGE = int(os.getenv("PARENT_COOKIE_MAX_AGE", str(60 * 60 * 24 * 7)))
PARENT_SESSION_COOKIE_NAME = "parent_session"

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


def list_accessible_lessons(session: Session, child_id: int) -> list[Lesson]:
    lessons = session.exec(select(Lesson).order_by(Lesson.id)).all()
    return [
        lesson
        for lesson in lessons
        if not is_generated_lesson(lesson) or lesson.child_id == child_id
    ]


def get_child_completed_lesson_map(session: Session, child_id: int) -> dict[int, ChildLessonProgress]:
    progress_items = session.exec(
        select(ChildLessonProgress).where(ChildLessonProgress.child_id == child_id)
    ).all()
    return {
        progress.lesson_id: progress
        for progress in progress_items
        if progress.lesson_id is not None
    }


def get_current_lesson(session: Session, child_id: int) -> Lesson | None:
    lessons = list_accessible_lessons(session=session, child_id=child_id)
    progress_map = get_child_completed_lesson_map(session=session, child_id=child_id)

    lesson = next(
        (
            item
            for item in lessons
            if not (progress_map.get(item.id or 0).is_completed if progress_map.get(item.id or 0) else False)
        ),
        None,
    )
    if lesson is None and lessons:
        lesson = lessons[-1]
    return lesson


def get_lesson_items(session: Session, lesson_id: int) -> list[LessonItem]:
    return session.exec(
        select(LessonItem).where(LessonItem.lesson_id == lesson_id).order_by(LessonItem.id)
    ).all()


def compute_and_update_child_level(session: Session, child: ChildProfile) -> int:
    """Analyse quiz accuracy + spaced-repetition difficulty and return a level 1-10.

    Level thresholds (each bracket takes roughly 5 completed lessons to climb):
      1-2  beginner      < 10 vocab, quiz avg < 60 %
      3-4  elementary    10-25 vocab
      5-6  intermediate  25-50 vocab, quiz avg >= 60 %
      7-8  upper-interm  50-100 vocab, quiz avg >= 75 %
      9-10 advanced      > 100 vocab, quiz avg >= 85 %
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
    if vocab_count >= 100 and quiz_accuracy >= 0.85:
        level = 10 if avg_difficulty < 1.5 else 9
    elif vocab_count >= 50 and quiz_accuracy >= 0.75:
        level = 8 if avg_difficulty < 1.5 else 7
    elif vocab_count >= 25 and quiz_accuracy >= 0.60:
        level = 6 if avg_difficulty < 2.0 else 5
    elif vocab_count >= 10:
        level = 4 if quiz_accuracy >= 0.50 else 3
    else:
        level = 2 if quiz_accuracy >= 0.50 else 1

    if child.current_level != level:
        child.current_level = level
        session.add(child)
        session.commit()
        session.refresh(child)

    return level


def auto_generate_lesson_for_child(session: Session, child: ChildProfile) -> Lesson:
    """Generate and persist a new Gemini lesson for *child* when no lesson exists."""
    if not phrase_generation_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Nenhuma licao foi encontrada e o GEMINI_API_KEY nao esta configurado no backend. "
                "Configure a chave para gerar licoes automaticamente."
            ),
        )

    level = compute_and_update_child_level(session=session, child=child)
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
            level=level,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Nao foi possivel gerar a licao com o Gemini. {exc}",
        ) from exc

    lesson = Lesson(
        id=next_day,
        title=f"Ingles de hoje - Dia {next_day}",
        theme="Frases do dia",
        objective="Aprenda 3 frases uteis em ingles hoje.",
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
            "generated_by": "gemini",
            "generated_model": phrase_generation_service.model,
            "generated_level": level,
            "generated_at": datetime.utcnow().isoformat(),
        },
        child_id=child.id,
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

    quiz_questions = build_generated_quiz_questions(session=session, lesson_items=created_items)
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


def build_generated_quiz_questions(session: Session, lesson_items: list[LessonItem]) -> list[QuizQuestionSchema]:
    phrase_pool = [
        item.word_en
        for item in session.exec(select(LessonItem).order_by(LessonItem.id)).all()
        if item.word_en not in {lesson_item.word_en for lesson_item in lesson_items}
    ]
    generated_questions: list[QuizQuestionSchema] = []

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
                question=f"Como se diz '{lesson_item.word_pt}' em ingles?",
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
    child = get_requested_child(request=request, session=session)
    lessons = list_accessible_lessons(session=session, child_id=child.id or 0)
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


@app.get("/api/lesson/today", response_model=LessonSchema)
def get_today_lesson(request: Request, session: Session = Depends(get_session)) -> LessonSchema:
    child = get_requested_child(request=request, session=session)
    lesson = get_current_lesson(session=session, child_id=child.id or 0)
    if lesson is None:
        lesson = auto_generate_lesson_for_child(session=session, child=child)
    return build_lesson_response(session=session, lesson=lesson, child_id=child.id or 0)


@app.get("/api/lesson/{lesson_id}", response_model=LessonSchema)
def get_lesson_by_id(lesson_id: int, request: Request, session: Session = Depends(get_session)) -> LessonSchema:
    child = get_requested_child(request=request, session=session)
    lesson = session.get(Lesson, lesson_id)
    accessible_lesson_ids = {item.id or 0 for item in list_accessible_lessons(session=session, child_id=child.id or 0)}
    if lesson is None or (lesson.id or 0) not in accessible_lesson_ids:
        raise HTTPException(status_code=404, detail="Licao nao encontrada")
    return build_lesson_response(session=session, lesson=lesson, child_id=child.id or 0)


@app.post("/api/lesson/complete")
def complete_lesson(lesson_id: int, request: Request, session: Session = Depends(get_session)) -> dict[str, str]:
    child = get_requested_child(request=request, session=session)
    lesson = session.get(Lesson, lesson_id)
    accessible_lesson_ids = {item.id or 0 for item in list_accessible_lessons(session=session, child_id=child.id or 0)}
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
    child = get_requested_child(request=request, session=session)
    resolved_lesson_id = lesson_id
    lesson: Lesson | None = None
    if resolved_lesson_id is None:
        lesson = get_current_lesson(session=session, child_id=child.id or 0)
        if lesson is None:
            raise HTTPException(status_code=404, detail="Nenhuma licao encontrada para o quiz")
        resolved_lesson_id = lesson.id
    elif resolved_lesson_id is not None:
        lesson = session.get(Lesson, resolved_lesson_id)
        accessible_lesson_ids = {item.id or 0 for item in list_accessible_lessons(session=session, child_id=child.id or 0)}
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
    accessible_lesson_ids = {lesson.id or 0 for lesson in list_accessible_lessons(session=session, child_id=child.id or 0)}
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


@app.get("/api/progress", response_model=ProgressSchema)
def get_progress(request: Request, session: Session = Depends(get_session)) -> ProgressSchema:
    child = get_requested_child(request=request, session=session)
    return build_progress_for_child(session=session, child=child)


_LEVEL_LABELS = {
    1: "Iniciante", 2: "Iniciante+",
    3: "Basico", 4: "Basico+",
    5: "Intermediario", 6: "Intermediario+",
    7: "Avancado", 8: "Avancado+",
    9: "Fluente", 10: "Fluente+",
}
_LEVEL_THRESHOLDS = {1: 5, 2: 10, 3: 25, 4: 25, 5: 50, 6: 50, 7: 100, 8: 100, 9: 150, 10: 999}


@app.get("/api/child/level", response_model=LevelAnalysisSchema)
def get_child_level(request: Request, session: Session = Depends(get_session)) -> LevelAnalysisSchema:
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
    )


@app.post("/api/chat", response_model=ChatResponseSchema)
async def chat_with_tutor(
    payload: ChatRequestSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ChatResponseSchema:
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
    child = ChildProfile(name=child_name, age_group="7-9", user_id=user.id)
    session.add(child)
    session.commit()

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
    require_parent_session(request, session)

    if not phrase_generation_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY nao esta configurada no backend.",
        )

    child = get_requested_child(request=request, session=session)
    level = compute_and_update_child_level(session=session, child=child)
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
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Nao foi possivel gerar novas frases com o Gemini. {exc}",
        ) from exc

    lesson = Lesson(
        id=next_day,
        title=f"Ingles de hoje - Dia {next_day}",
        theme="Frases do dia",
        objective="Aprenda 3 frases uteis em ingles hoje.",
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
            "generated_by": "gemini",
            "generated_model": phrase_generation_service.model,
            "generated_topic": payload.topic.strip() if payload.topic else None,
            "generated_at": datetime.utcnow().isoformat(),
        },
        child_id=child.id,
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

    quiz_questions = build_generated_quiz_questions(session=session, lesson_items=created_items)
    lesson.content = {
        **(lesson.content or {}),
        "quiz_questions": [question.model_dump() for question in quiz_questions],
    }
    session.add(lesson)
    session.commit()
    session.refresh(lesson)

    return GenerateLessonResponseSchema(
        status="success",
        lesson=build_lesson_response(session=session, lesson=lesson, child_id=child.id or 0),
        message=f"{lesson.title} foi gerado e salvo no banco de dados.",
    )


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
    child = get_requested_child(request=request, session=session)
    books = session.exec(
        select(Book).where(Book.child_id == child.id).order_by(Book.created_at.desc())
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
    child = get_requested_child(request=request, session=session)
    book = session.get(Book, book_id)
    if book is None or book.child_id != child.id:
        raise HTTPException(status_code=404, detail="Livro nao encontrado.")
    pages = session.exec(select(BookPage).where(BookPage.book_id == book_id)).all()
    return _build_book_schema(book, list(pages))


@app.post("/api/books/generate", response_model=BookSchema)
def generate_book(
    payload: GenerateBookRequestSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> BookSchema:
    if not book_generation_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY nao esta configurada no backend. Adicione a chave e reinicie a API.",
        )

    child = get_requested_child(request=request, session=session)

    # Resolve level: 0 means use child's current level
    level = payload.level if payload.level > 0 else compute_and_update_child_level(
        session=session, child=child
    )

    try:
        draft = book_generation_service.generate_book(
            level=level,
            num_pages=payload.num_pages,
            theme=payload.theme or None,
            age_group=child.age_group,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Persist book
    book = Book(
        child_id=child.id or 0,
        title=draft.title,
        theme=draft.theme,
        level=level,
        num_pages=len(draft.pages),
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


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", 8001))
    uvicorn.run(app, host=host, port=port)
