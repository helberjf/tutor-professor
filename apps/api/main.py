import hashlib
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, SQLModel, create_engine, select

from models.database import ChildProfile, Lesson, LessonItem, QuizAttempt, ReviewItem
from schemas.schemas import (
    ChatRequestSchema,
    ChatResponseSchema,
    ChildProfileSchema,
    GenerateLessonRequestSchema,
    GenerateLessonResponseSchema,
    LessonItemSchema,
    LessonSchema,
    LessonSummarySchema,
    ParentLoginSchema,
    ParentSettingsUpdateSchema,
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

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
    default_voice=os.getenv("KOKORO_DEFAULT_VOICE", "af_heart"),
    cache_dir=str(audio_cache_dir),
)
content_service = ContentService(PROJECT_ROOT / "content" / "quizzes")
tutor_service = TutorService(BASE_DIR / "prompts" / "tutor_system_prompt.txt")
phrase_generation_service = PhraseGenerationService()

active_parent_sessions: set[str] = set()


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


def get_default_child(session: Session) -> ChildProfile:
    child = session.exec(select(ChildProfile).order_by(ChildProfile.id)).first()
    if child is None:
        child = ChildProfile(name="Kid", age_group="7-9")
        session.add(child)
        session.commit()
        session.refresh(child)
    return child


def get_current_lesson(session: Session) -> Lesson:
    lesson = session.exec(
        select(Lesson).where(Lesson.is_completed == False).order_by(Lesson.id)
    ).first()
    if lesson is None:
        lesson = session.exec(select(Lesson).order_by(Lesson.id.desc())).first()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Nenhuma licao encontrada")
    return lesson


def get_lesson_items(session: Session, lesson_id: int) -> list[LessonItem]:
    return session.exec(
        select(LessonItem).where(LessonItem.lesson_id == lesson_id).order_by(LessonItem.id)
    ).all()


def get_next_lesson_day(session: Session) -> int:
    latest_lesson = session.exec(select(Lesson).order_by(Lesson.id.desc())).first()
    if latest_lesson is None or latest_lesson.id is None:
        return 1
    return latest_lesson.id + 1


def build_lesson_response(session: Session, lesson: Lesson) -> LessonSchema:
    lesson_items = get_lesson_items(session=session, lesson_id=lesson.id or 0)
    return LessonSchema(
        id=lesson.id or 0,
        title=lesson.title,
        theme=lesson.theme,
        objective=lesson.objective,
        content=lesson.content or {},
        items=[LessonItemSchema.model_validate(item) for item in lesson_items],
        is_completed=lesson.is_completed,
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
    seed = f"{SESSION_SECRET}:{secrets.token_urlsafe(32)}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def require_parent_session(request: Request) -> str:
    token = request.cookies.get("parent_session")
    if not token or token not in active_parent_sessions:
        raise HTTPException(status_code=401, detail="Login da area de pais obrigatorio")
    return token


@app.get("/health")
def health_check() -> dict[str, datetime | str]:
    return {"status": "ok", "timestamp": datetime.utcnow()}


@app.get("/api/lessons", response_model=list[LessonSummarySchema])
def list_all_lessons(session: Session = Depends(get_session)) -> list[LessonSummarySchema]:
    lessons = session.exec(select(Lesson).order_by(Lesson.id)).all()
    return [
        LessonSummarySchema(
            id=lesson.id or 0,
            title=lesson.title,
            theme=lesson.theme,
            objective=lesson.objective,
            is_completed=lesson.is_completed,
            completed_at=lesson.completed_at,
        )
        for lesson in lessons
    ]


@app.get("/api/lesson/{lesson_id}", response_model=LessonSchema)
def get_lesson_by_id(lesson_id: int, session: Session = Depends(get_session)) -> LessonSchema:
    lesson = session.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Licao nao encontrada")
    return build_lesson_response(session=session, lesson=lesson)


@app.get("/api/lesson/today", response_model=LessonSchema)
def get_today_lesson(session: Session = Depends(get_session)) -> LessonSchema:
    lesson = get_current_lesson(session=session)
    return build_lesson_response(session=session, lesson=lesson)


@app.post("/api/lesson/complete")
def complete_lesson(lesson_id: int, session: Session = Depends(get_session)) -> dict[str, str]:
    lesson = session.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Licao nao encontrada")

    child = get_default_child(session=session)
    lesson_items = get_lesson_items(session=session, lesson_id=lesson.id or 0)
    seed_review_items_for_lesson(session=session, child_id=child.id or 0, lesson_items=lesson_items)

    lesson.is_completed = True
    lesson.completed_at = datetime.utcnow()
    update_streak(child=child, now=datetime.utcnow())

    session.add(child)
    session.add(lesson)
    session.commit()
    return {"status": "success"}


@app.get("/api/quiz/today", response_model=QuizSchema)
def get_today_quiz(
    lesson_id: int | None = None,
    session: Session = Depends(get_session),
) -> QuizSchema:
    resolved_lesson_id = lesson_id
    lesson: Lesson | None = None
    if resolved_lesson_id is None:
        lesson = get_current_lesson(session=session)
        resolved_lesson_id = lesson.id
    elif resolved_lesson_id is not None:
        lesson = session.get(Lesson, resolved_lesson_id)

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
    request: QuizSubmitSchema,
    session: Session = Depends(get_session),
) -> QuizSubmitResponseSchema:
    child = get_default_child(session=session)
    attempt = QuizAttempt(
        lesson_id=request.lesson_id,
        score=request.score,
        total_questions=request.total_questions,
        child_id=child.id,
    )
    update_streak(child=child, now=datetime.utcnow())

    session.add(child)
    session.add(attempt)
    session.commit()

    return QuizSubmitResponseSchema(
        status="success",
        encouragement=build_quiz_encouragement(
            score=request.score,
            total_questions=request.total_questions,
        ),
    )


@app.get("/api/review", response_model=ReviewSessionSchema)
def get_review_session(
    limit: int = 5,
    session: Session = Depends(get_session),
) -> ReviewSessionSchema:
    child = get_default_child(session=session)
    return ReviewSessionSchema(
        total_due=count_due_review_items(session=session, child_id=child.id or 0),
        items=build_review_cards(session=session, child_id=child.id or 0, limit=limit),
    )


@app.post("/api/review/attempt", response_model=ReviewResultSchema)
def submit_review_attempt(
    request: ReviewAttemptSchema,
    session: Session = Depends(get_session),
) -> ReviewResultSchema:
    child = get_default_child(session=session)
    review_item = register_review_attempt(
        session=session,
        child_id=child.id or 0,
        word_en=request.word_en,
        word_pt=request.word_pt,
        correct=request.correct,
        review_item_id=request.review_item_id,
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


@app.get("/api/progress", response_model=ProgressSchema)
def get_progress(session: Session = Depends(get_session)) -> ProgressSchema:
    child = get_default_child(session=session)
    completed_lessons = session.exec(
        select(Lesson).where(Lesson.is_completed == True)
    ).all()

    vocabulary_learned = 0
    for lesson in completed_lessons:
        vocabulary_learned += len(get_lesson_items(session=session, lesson_id=lesson.id or 0))

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
        themes_completed=len(completed_lessons),
        streak_count=child.streak_count,
        vocabulary_learned=vocabulary_learned,
        last_activity=child.last_activity,
        current_level=child.current_level,
        difficult_words=difficult_words,
    )


@app.post("/api/chat", response_model=ChatResponseSchema)
async def chat_with_tutor(
    request: ChatRequestSchema,
    session: Session = Depends(get_session),
) -> ChatResponseSchema:
    child = get_default_child(session=session)
    response_text = tutor_service.build_response(
        message=request.message,
        history=request.history,
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
    request: SpeakRequestSchema,
    session: Session = Depends(get_session),
) -> SpeakResponseSchema:
    child = get_default_child(session=session)
    audio_file = await tts_service.generate_speech(
        request.text,
        request.voice or child.voice_preference,
    )
    if not audio_file:
        return SpeakResponseSchema(audio_url=None, fallback_text=request.text)

    return SpeakResponseSchema(audio_url=tts_service.get_audio_url(audio_file))


@app.post("/api/parent/login")
def parent_login(request: ParentLoginSchema, response: Response) -> dict[str, str]:
    correct_password = os.getenv("PARENT_PASSWORD", "tutor123")
    if request.password != correct_password:
        raise HTTPException(status_code=401, detail="Senha incorreta")

    token = build_parent_session_token()
    active_parent_sessions.add(token)
    response.set_cookie(
        key="parent_session",
        value=token,
        httponly=True,
        secure=PARENT_COOKIE_SECURE,
        samesite=PARENT_COOKIE_SAMESITE,
        domain=PARENT_COOKIE_DOMAIN,
        max_age=PARENT_COOKIE_MAX_AGE,
    )
    return {"status": "success"}


@app.post("/api/parent/logout")
def parent_logout(request: Request, response: Response) -> dict[str, str]:
    token = request.cookies.get("parent_session")
    if token in active_parent_sessions:
        active_parent_sessions.remove(token)
    response.delete_cookie(key="parent_session")
    return {"status": "success"}


@app.get("/api/parent/settings", response_model=ChildProfileSchema)
def get_parent_settings(
    request: Request,
    session: Session = Depends(get_session),
) -> ChildProfileSchema:
    require_parent_session(request)
    child = get_default_child(session=session)
    return ChildProfileSchema.model_validate(child)


@app.post("/api/parent/settings", response_model=ChildProfileSchema)
def update_parent_settings(
    request: Request,
    payload: ParentSettingsUpdateSchema,
    session: Session = Depends(get_session),
) -> ChildProfileSchema:
    require_parent_session(request)
    child = get_default_child(session=session)

    if payload.child_name:
        child.name = payload.child_name
    if payload.age_group:
        child.age_group = payload.age_group
    if payload.voice_preference:
        child.voice_preference = payload.voice_preference
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
    require_parent_session(request)

    if not phrase_generation_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY nao esta configurada no backend.",
        )

    child = get_default_child(session=session)
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
        lesson=build_lesson_response(session=session, lesson=lesson),
        message=f"{lesson.title} foi gerado e salvo no banco de dados.",
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", 8001))
    uvicorn.run(app, host=host, port=port)
