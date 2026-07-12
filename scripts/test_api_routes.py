"""Integration smoke tests for the FastAPI backend routes.

The script uses a temporary SQLite database so it can run without touching
local development data.
"""
from __future__ import annotations

import os
import sys
import asyncio
import tempfile
import threading
import time
from datetime import date, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-api-"))
DB_PATH = TMP_DIR / "kids_tutor_test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["CORS_ALLOWED_ORIGINS"] = "http://localhost:3000,https://english-tutor-kid.vercel.app"
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "pai@example.com"
os.environ["GOOGLE_CLIENT_ID"] = "test-google-client"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-google-secret"
os.environ["GOOGLE_REDIRECT_URI"] = "http://testserver/api/auth/google/callback"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402


VALID_CPF = "52998224725"


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text}")


class MockGoogleResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self) -> dict:
        return self.payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"mock google error: {self.status_code}")


def seed_lesson() -> None:
    with Session(main.engine) as session:
        lesson = main.Lesson(
            id=1,
            title="Dia 1",
            theme="Saudacoes",
            objective="Aprender frases simples de saudacao.",
            content={
                "daily_goal": "3 frases para cumprimentar",
                "phrase_breakdowns": [
                    {
                        "phrase_en": "Hello",
                        "phrase_pt": "Ola",
                        "word_by_word": [{"en": "Hello", "pt": "Ola"}],
                    }
                ],
                "quiz_questions": [
                    {
                        "id": 1,
                        "question": "Como se diz Ola em ingles?",
                        "options": ["Hello", "Bye", "Thanks", "Please"],
                        "correct_option": "Hello",
                        "explanation": "Hello significa Ola.",
                    }
                ],
            },
        )
        session.add(lesson)
        session.add(
            main.LessonItem(
                word_en="Hello",
                word_pt="Ola",
                example_sentence_en="Hello, friend!",
                example_sentence_pt="Ola, amigo!",
                lesson_id=1,
            )
        )
        session.add(
            main.LessonItem(
                word_en="Thank you",
                word_pt="Obrigado",
                example_sentence_en="Thank you, teacher!",
                example_sentence_pt="Obrigado, professor!",
                lesson_id=1,
            )
        )
        session.commit()


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        seed_lesson()

        assert_status(await client.get("/health"), 200, "health")
        assert_status(await client.get("/api/progress"), 401, "anonymous progress requires login")
        assert_status(await client.get("/api/study/dashboard"), 401, "anonymous study dashboard requires login")

        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": "pai@example.com",
                    "cpf": "11111111111",
                    "password": "secret123",
                    "child_name": "Lia",
                },
            ),
            422,
            "register invalid cpf",
        )

        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": "pai@example.com",
                    "cpf": VALID_CPF,
                    "password": "secret123",
                    "child_name": "Lia",
                },
            ),
            201,
            "register",
        )
        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": "pai@example.com",
                    "cpf": "39053344705",
                    "password": "secret123",
                    "child_name": "Lia",
                },
            ),
            409,
            "duplicate email",
        )
        assert_status(await client.post("/api/auth/login", json={"email": "pai@example.com", "password": "secret123"}), 200, "login")
        assert_status(await client.get("/api/auth/me"), 200, "me")

        providers_response = await client.get("/api/ai/providers")
        assert_status(providers_response, 200, "ai providers")
        providers = providers_response.json()
        provider_ids = [provider["id"] for provider in providers]
        for required_provider in ["gemini", "openai", "anthropic", "openrouter", "groq", "mistral"]:
            if required_provider not in provider_ids:
                raise AssertionError(f"expected {required_provider} in AI providers, got {providers}")
        gemini_provider = next(provider for provider in providers if provider["id"] == "gemini")
        if not gemini_provider.get("is_default"):
            raise AssertionError(f"expected Gemini to be default provider, got {providers}")

        ai_settings_response = await client.get("/api/ai/settings")
        assert_status(ai_settings_response, 200, "initial ai settings")
        ai_settings = ai_settings_response.json()
        if ai_settings["provider"] != "gemini" or ai_settings["has_api_key"]:
            raise AssertionError(f"expected missing Gemini settings by default, got {ai_settings}")

        children_response = await client.get("/api/parent/children")
        assert_status(children_response, 200, "parent children")
        children = children_response.json()
        if len(children) != 1 or children[0]["name"] != "Lia":
            raise AssertionError(f"expected registered child Lia, got {children}")
        child_id = children[0]["id"]
        child_headers = {"X-Child-ID": str(child_id)}

        assert_status(await client.get("/api/parent/settings", headers=child_headers), 200, "parent settings")
        assert_status(await client.get("/api/parent/progress", headers=child_headers), 200, "parent progress")
        assert_status(
            await client.post("/api/parent/settings", headers=child_headers, json={"child_name": "Lia Teste", "age_group": "7-9"}),
            200,
            "parent settings update",
        )
        assert_status(
            await client.post("/api/parent/children", json={"name": "Noah", "age_group": "4-6"}),
            200,
            "create child",
        )

        assert_status(await client.get("/api/lessons", headers=child_headers), 200, "lessons")
        assert_status(await client.get("/api/lesson/today", headers=child_headers), 200, "today lesson")
        assert_status(await client.get("/api/lesson/1", headers=child_headers), 200, "lesson by id")
        assert_status(await client.get("/api/quiz/today?lesson_id=1", headers=child_headers), 200, "today quiz")
        assert_status(
            await client.post(
                "/api/review/attempt",
                headers=child_headers,
                json={"word_en": "Hello", "word_pt": "Ola", "correct": True},
            ),
            200,
            "review attempt before complete",
        )
        assert_status(await client.post("/api/lesson/complete?lesson_id=1", headers=child_headers), 200, "complete lesson")
        assert_status(
            await client.post(
                "/api/quiz/submit",
                headers=child_headers,
                json={"lesson_id": 1, "score": 1, "total_questions": 1},
            ),
            200,
            "submit quiz",
        )
        assert_status(await client.get("/api/review", headers=child_headers), 200, "review session")
        progress_response = await client.get("/api/progress", headers=child_headers)
        assert_status(progress_response, 200, "progress")
        if progress_response.json()["themes_completed"] != 1:
            raise AssertionError(f"expected completed theme in progress, got {progress_response.text}")

        coding_subject_response = await client.post(
            "/api/coding/subjects",
            headers=child_headers,
            json={"name": "Python", "description": "Treino de codigo", "icon_emoji": "PY"},
        )
        assert_status(coding_subject_response, 201, "create coding subject")
        coding_subject = coding_subject_response.json()
        missing_coding_ai_topic_response = await client.post(
            f"/api/coding/subjects/{coding_subject['id']}/topics/generate",
            headers=child_headers,
        )
        assert_status(missing_coding_ai_topic_response, 422, "generate coding topic requires AI settings")
        create_coding_topic_response = await client.post(
            f"/api/coding/subjects/{coding_subject['id']}/topics",
            headers=child_headers,
            json={"title": "Variaveis e tipos", "order_index": 0, "generate_ai": False},
        )
        assert_status(create_coding_topic_response, 201, "create coding topic")
        coding_topic = create_coding_topic_response.json()
        if coding_topic["status"] != "not_started":
            raise AssertionError(f"expected new coding topic to be not_started, got {coding_topic['status']}")

        today = date.today()
        yesterday = today - timedelta(days=1)
        coding_day_response = await client.put(
            f"/api/study/coding/{today.isoformat()}",
            headers=child_headers,
            json={
                "subjects": {
                    "Python": [
                        {"topic": "Variaveis e tipos", "done": True},
                    ]
                }
            },
        )
        assert_status(coding_day_response, 200, "save coding day progress")
        assert_status(
            await client.put(
                f"/api/study/day/{yesterday.isoformat()}",
                headers=child_headers,
                json={
                    "plan_text": "Revisar as frases da licao antes de dormir.",
                    "studied_text": "Revisei greetings e pratiquei speaking.",
                    "distractions": ["celular"],
                },
            ),
            200,
            "create yesterday study day",
        )
        today_response = await client.put(
            f"/api/study/day/{today.isoformat()}",
            headers=child_headers,
            json={
                "plan_text": "Estudar 20 minutos depois do almoco.",
                "studied_text": "Fiz a licao, revisei flashcards e li um livro curto.",
                "distractions": [" celular ", "YouTube", ""],
            },
        )
        assert_status(today_response, 200, "create today study day")
        today_payload = today_response.json()
        if today_payload["distractions"] != ["celular", "YouTube"]:
            raise AssertionError(f"expected sanitized distractions, got {today_payload}")
        if today_payload["is_study_day"] is not True:
            raise AssertionError(f"expected studied_text to mark study day, got {today_payload}")

        selected_day_response = await client.get(f"/api/study/day/{today.isoformat()}", headers=child_headers)
        assert_status(selected_day_response, 200, "get selected study day")
        if selected_day_response.json()["studied_text"] != "Fiz a licao, revisei flashcards e li um livro curto.":
            raise AssertionError(f"expected selected study day details, got {selected_day_response.text}")

        dashboard_response = await client.get("/api/study/dashboard", headers=child_headers)
        assert_status(dashboard_response, 200, "study dashboard")
        dashboard = dashboard_response.json()
        if dashboard["study_streak_count"] != 2:
            raise AssertionError(f"expected 2-day study streak, got {dashboard}")
        if dashboard["last_study_date"] != today.isoformat():
            raise AssertionError(f"expected last study date today, got {dashboard}")
        if dashboard["today"]["plan_text"] != "Estudar 20 minutos depois do almoco.":
            raise AssertionError(f"expected today's plan in dashboard, got {dashboard}")
        if len(dashboard["recent_days"]) < 2:
            raise AssertionError(f"expected recent study history, got {dashboard}")

        assert_status(await client.post("/api/chat", headers=child_headers, json={"message": "hello", "history": []}), 200, "chat")
        assert_status(await client.post("/api/audio/speak", headers=child_headers, json={"text": "Hello"}), 200, "audio speak")
        missing_ai_response = await client.post("/api/parent/generate-lesson", headers=child_headers, json={})
        assert_status(missing_ai_response, 403, "generate lesson requires user ai settings")
        if "chave" not in missing_ai_response.text.lower() and "api" not in missing_ai_response.text.lower():
            raise AssertionError(f"expected missing AI key message, got {missing_ai_response.text}")
        missing_flashcards_response = await client.post(
            "/api/study/diverse/generate-flashcards",
            headers=child_headers,
            json={"subject": "React", "count": 3, "avoid_topics": ["Componentes", "Props"]},
        )
        assert_status(missing_flashcards_response, 403, "generate flashcards requires user ai settings")
        missing_suggested_flashcards_response = await client.post(
            "/api/study/diverse/generate-flashcards",
            headers=child_headers,
            json={"subject": "", "count": 1, "suggest_subject": True},
        )
        assert_status(
            missing_suggested_flashcards_response,
            403,
            "suggested flashcards accepts empty subject before AI auth",
        )

        diverse_response = await client.put(
            f"/api/study/diverse/{today.isoformat()}",
            headers=child_headers,
            json={
                "custom_subjects": [
                    {
                        "name": "Frances",
                        "topics": [{"topic": "Cumprimentos", "done": False, "answer": "Bonjour e Bonsoir."}],
                        "lessons": [
                            {
                                "id": "lesson-test-1",
                                "title": "Licao 1: basico",
                                "created_at": "2026-06-08T00:00:00.000Z",
                                "topics": [
                                    {"topic": "Je m'appelle", "done": True, "answer": "Significa eu me chamo."}
                                ],
                            }
                        ],
                    }
                ]
            },
        )
        assert_status(diverse_response, 200, "save diverse day with lesson blocks")
        diverse_payload = diverse_response.json()
        saved_subject = diverse_payload["custom_subjects"][0]
        if not saved_subject.get("id", "").startswith("subject-"):
            raise AssertionError(f"expected persisted canonical subject identity, got {saved_subject}")
        saved_lesson = saved_subject["lessons"][0]
        if "topics" in saved_lesson:
            raise AssertionError(f"expected no embedded diverse lesson topics, got {diverse_payload}")
        lesson_topic_ids = saved_lesson.get("topic_ids") or []
        canonical_topics = {topic["id"]: topic for topic in saved_subject["topics"]}
        if len(lesson_topic_ids) != 1 or canonical_topics.get(lesson_topic_ids[0], {}).get("topic") != "Je m'appelle":
            raise AssertionError(f"expected diverse lesson reference to round-trip, got {diverse_payload}")
        with Session(main.engine) as session:
            stored_identity_record = session.exec(
                main.select(main.DiverseDay).where(
                    main.DiverseDay.child_id == child_id,
                    main.DiverseDay.study_date == today,
                )
            ).first()
            stored_subject_id = stored_identity_record.custom_subjects[0].get("id")
        if stored_subject_id != saved_subject["id"]:
            raise AssertionError(
                f"subject identity was not persisted canonically: stored={stored_subject_id}, response={saved_subject}"
            )

        canonical_with_new_subject = diverse_payload["custom_subjects"] + [
            {
                "name": "Materia nova sem ID",
                "topics": [{"topic": "Pergunta nova?", "answer": "Resposta nova."}],
                "lessons": [],
            }
        ]
        add_subject_response = await client.put(
            f"/api/study/diverse/{today.isoformat()}",
            headers=child_headers,
            json={"custom_subjects": canonical_with_new_subject},
        )
        assert_status(add_subject_response, 200, "append new diverse subject without client ID")
        after_new_subject = add_subject_response.json()["custom_subjects"]
        if after_new_subject[0]["id"] != saved_subject["id"]:
            raise AssertionError(f"existing subject identity changed while adding subject: {after_new_subject}")
        new_subject = next(subject for subject in after_new_subject if subject["name"] == "Materia nova sem ID")
        if not new_subject.get("id", "").startswith("subject-"):
            raise AssertionError(f"server did not assign new subject identity: {new_subject}")

        canonical_with_new_lesson = add_subject_response.json()["custom_subjects"]
        canonical_with_new_lesson[0]["lessons"].append(
            {"title": "Licao nova sem ID", "topic_ids": []}
        )
        add_lesson_response = await client.put(
            f"/api/study/diverse/{today.isoformat()}",
            headers=child_headers,
            json={"custom_subjects": canonical_with_new_lesson},
        )
        assert_status(add_lesson_response, 200, "append new diverse lesson without client ID")
        saved_lessons = add_lesson_response.json()["custom_subjects"][0]["lessons"]
        new_lesson = next(lesson for lesson in saved_lessons if lesson["title"] == "Licao nova sem ID")
        if not new_lesson.get("id", "").startswith("lesson-"):
            raise AssertionError(f"server did not assign new lesson identity: {new_lesson}")

        legacy_duplicate_subject = {
            "name": "Biologia",
            "topics": [{"topic": "O que e mitose?", "answer": "Divisao celular"}],
            "lessons": [
                {
                    "id": "lesson-mitose",
                    "title": "Mitose",
                    "topics": [{"topic": "O que e mitose?", "answer": "Divisao celular"}],
                }
            ],
        }
        canonical_duplicate_subject = main.normalize_subject(legacy_duplicate_subject)
        with Session(main.engine) as session:
            diverse_record = session.exec(
                main.select(main.DiverseDay).where(
                    main.DiverseDay.child_id == child_id,
                    main.DiverseDay.study_date == today,
                )
            ).first()
            if diverse_record is None:
                raise AssertionError("expected saved diverse record for legacy migration regression")
            diverse_record.custom_subjects = [legacy_duplicate_subject]
            session.add(diverse_record)
            session.commit()

        activity_before_noop = await client.get(f"/api/activity/day/{today.isoformat()}", headers=child_headers)
        assert_status(activity_before_noop, 200, "activity count before diverse legacy no-op")
        diverse_count_before_noop = activity_before_noop.json()["activities_by_type"].get("diverse", 0)
        canonical_noop_response = await client.put(
            f"/api/study/diverse/{today.isoformat()}",
            headers=child_headers,
            json={"custom_subjects": [canonical_duplicate_subject]},
        )
        assert_status(canonical_noop_response, 200, "canonical save after diverse legacy migration")
        activity_after_noop = await client.get(f"/api/activity/day/{today.isoformat()}", headers=child_headers)
        assert_status(activity_after_noop, 200, "activity count after diverse legacy no-op")
        diverse_count_after_noop = activity_after_noop.json()["activities_by_type"].get("diverse", 0)
        if diverse_count_after_noop != diverse_count_before_noop:
            raise AssertionError(
                "semantic no-op legacy migration must not create another diverse activity: "
                f"before={diverse_count_before_noop}, after={diverse_count_after_noop}"
            )

        with Session(main.engine) as session:
            foreign_child = main.ChildProfile(
                name="Foreign child",
                age_group="7-9",
                user_id=999999,
            )
            session.add(foreign_child)
            session.flush()
            session.add(
                main.DiverseDay(
                    child_id=foreign_child.id or 0,
                    study_date=today,
                    custom_subjects=[canonical_duplicate_subject],
                )
            )
            session.commit()
            foreign_child_id = foreign_child.id
        foreign_child_response = await client.get(
            f"/api/study/diverse/{today.isoformat()}",
            headers={"X-Child-ID": str(foreign_child_id)},
        )
        assert_status(foreign_child_response, 404, "reject inaccessible requested child")
        malformed_child_response = await client.get(
            f"/api/study/diverse/{today.isoformat()}",
            headers={"X-Child-ID": "not-a-child"},
        )
        assert_status(malformed_child_response, 400, "reject malformed requested child id")

        missing_diverse_questions_response = await client.post(
            "/api/study/diverse/questions/generate",
            headers=child_headers,
            json={
                "study_date": today.isoformat(),
                "subject_index": 0,
                "lesson_id": "lesson-mitose",
                "context": "  prova   de vestibular  ",
            },
        )
        assert_status(
            missing_diverse_questions_response,
            422,
            "append diverse questions requires AI settings",
        )

        save_ai_response = await client.put(
            "/api/ai/settings",
            json={"provider": "gemini", "api_key": "test-ai-key", "model": "gemini-2.5-flash"},
        )
        assert_status(save_ai_response, 200, "save ai settings")
        saved_ai_settings = save_ai_response.json()
        if not saved_ai_settings["has_api_key"] or saved_ai_settings.get("api_key_preview") == "test-ai-key":
            raise AssertionError(f"expected masked AI key after save, got {saved_ai_settings}")
        if "test-ai-key" in save_ai_response.text:
            raise AssertionError("raw AI key leaked in save response")

        stored_ai_response = await client.get("/api/ai/settings")
        assert_status(stored_ai_response, 200, "stored ai settings")
        if "test-ai-key" in stored_ai_response.text:
            raise AssertionError("raw AI key leaked in settings response")

        with Session(main.engine) as session:
            french_child = session.get(main.ChildProfile, child_id)
            if french_child is None:
                raise AssertionError("expected registered child for French question tests")
            french_child.target_language = "French"
            french_child.base_language = "Portuguese"
            session.add(french_child)
            french_lesson = main.Lesson(
                title="Les salutations",
                theme="Rencontres",
                objective="Se presenter poliment",
                child_id=child_id,
                target_language="French",
                content={
                    "phrase_breakdowns": [
                        {
                            "phrase_en": "Je m'appelle Lia",
                            "phrase_pt": "Eu me chamo Lia",
                            "word_by_word": [{"en": "Je", "pt": "Eu"}],
                        }
                    ]
                },
            )
            session.add(french_lesson)
            session.flush()
            french_lesson_id = french_lesson.id or 0
            session.add(
                main.LessonItem(
                    word_en="Bonjour",
                    word_pt="Ola",
                    example_sentence_en="Bonjour, Marie !",
                    example_sentence_pt="Ola, Marie!",
                    lesson_id=french_lesson_id,
                )
            )
            session.commit()
            other_child = session.exec(
                main.select(main.ChildProfile).where(main.ChildProfile.name == "Noah")
            ).first()
            if other_child is None or other_child.id is None:
                raise AssertionError("expected second child for lesson access test")
            other_child.target_language = "French"
            session.add(other_child)
            other_child_id = other_child.id
            wrong_level_generated_lesson = main.Lesson(
                title="Le francais avance",
                theme="Niveau avance",
                objective="Respecter le niveau de la lecon",
                child_id=None,
                level=(french_child.current_level or 1) + 1,
                target_language="French",
                content={"generated_by": "openai"},
            )
            session.add(wrong_level_generated_lesson)
            session.commit()
            wrong_level_generated_lesson_id = wrong_level_generated_lesson.id or 0

        inaccessible_french_lesson_response = await client.get(
            f"/api/lesson/{french_lesson_id}",
            headers={"X-Child-ID": str(other_child_id)},
        )
        assert_status(
            inaccessible_french_lesson_response,
            404,
            "reject French lesson generation for child without access",
        )
        wrong_level_generated_response = await client.get(
            f"/api/lesson/{wrong_level_generated_lesson_id}",
            headers=child_headers,
        )
        assert_status(
            wrong_level_generated_response,
            404,
            "treat any generated provider as generated for level access",
        )

        french_ai_calls = 0
        captured_french_prompt = ""
        original_language_generate_json = main.phrase_generation_service.generate_json_text

        def mock_french_questions_json(**kwargs):
            nonlocal french_ai_calls, captured_french_prompt
            french_ai_calls += 1
            captured_french_prompt = kwargs["prompt"]
            return main.json.dumps(
                {
                    "questions": [
                        {
                            "front": "Comment traduit-on bom dia en francais ?",
                            "back": "Bonjour.",
                            "question_type": "translation",
                            "supporting_example": "Bonjour, Marie !",
                        },
                        {
                            "front": "Quel mot complete la phrase : Je ___ Lia ?",
                            "back": "m'appelle",
                            "question_type": "sentence_completion",
                        },
                        {
                            "front": "Quel pronom signifie eu ?",
                            "back": "Je.",
                            "question_type": "grammar",
                        },
                        {
                            "front": "Que signifie bonjour ?",
                            "back": "Ola.",
                            "question_type": "vocabulary",
                        },
                        {
                            "front": "Lisez Bonjour, Marie. Qui est saluee ?",
                            "back": "Marie.",
                            "question_type": "comprehension",
                        },
                    ]
                },
                ensure_ascii=False,
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_french_questions_json
            french_questions_response = await client.post(
                f"/api/lessons/{french_lesson_id}/questions/generate",
                headers=child_headers,
                json={"context": "  pratique   pour entrevista oral  "},
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        assert_status(french_questions_response, 200, "generate five French lesson questions")
        french_questions = french_questions_response.json()
        if french_ai_calls != 1 or len(french_questions) != 5:
            raise AssertionError(
                f"expected five French questions from one AI call, got calls={french_ai_calls}, "
                f"questions={french_questions}"
            )
        if {question["target_language"] for question in french_questions} != {"French"}:
            raise AssertionError(f"questions did not use the child's French language: {french_questions}")
        if len({question["question_type"] for question in french_questions}) < 3:
            raise AssertionError(f"French batch lacks question variety: {french_questions}")
        for expected_prompt_part in (
            "French",
            "Portuguese",
            "Les salutations",
            "Bonjour",
            "Je m'appelle Lia",
            "pratique pour entrevista oral",
        ):
            if expected_prompt_part not in captured_french_prompt:
                raise AssertionError(
                    f"expected {expected_prompt_part!r} in French prompt: {captured_french_prompt}"
                )

        canonical_french_lesson_response = await client.get(
            f"/api/lesson/{french_lesson_id}", headers=child_headers
        )
        assert_status(canonical_french_lesson_response, 200, "reload French lesson questions")
        canonical_french_questions = canonical_french_lesson_response.json()["questions"]
        if [item["id"] for item in canonical_french_questions] != [item["id"] for item in french_questions]:
            raise AssertionError("GET lesson did not return the same canonical French question IDs")
        if [item["front"] for item in canonical_french_questions] != [item["front"] for item in french_questions]:
            raise AssertionError("GET lesson did not return the same canonical French question fronts")

        def mock_malformed_language_json(**_kwargs):
            return main.json.dumps(
                {
                    "questions": [
                        {
                            "front": ({"not": "a string"} if index == 1 else f"Incomplete {index}?"),
                            "back": "Answer",
                            "question_type": ["grammar", "translation", "vocabulary"][index % 3],
                        }
                        for index in range(1, 6)
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_malformed_language_json
            malformed_language_response = await client.post(
                f"/api/lessons/{french_lesson_id}/questions/generate",
                headers=child_headers,
                json={},
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        assert_status(malformed_language_response, 502, "reject partial French question batch")
        with Session(main.engine) as session:
            after_malformed = session.exec(
                main.select(main.LessonQuestion).where(
                    main.LessonQuestion.child_id == child_id,
                    main.LessonQuestion.lesson_id == french_lesson_id,
                )
            ).all()
        if len(after_malformed) != 5:
            raise AssertionError("malformed language batch partially mutated canonical questions")

        language_barrier = threading.Barrier(2)
        concurrent_language_ai_calls = 0

        def mock_concurrent_language_json(**_kwargs):
            nonlocal concurrent_language_ai_calls
            concurrent_language_ai_calls += 1
            language_barrier.wait(timeout=10)
            return main.json.dumps(
                {
                    "questions": [
                        {
                            "front": f"Question concurrente {index} ?",
                            "back": f"Reponse {index}.",
                            "question_type": ["grammar", "translation", "vocabulary"][index % 3],
                        }
                        for index in range(1, 6)
                    ]
                },
                ensure_ascii=False,
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_concurrent_language_json
            concurrent_language_responses = await asyncio.gather(
                client.post(
                    f"/api/lessons/{french_lesson_id}/questions/generate",
                    headers=child_headers,
                    json={},
                ),
                client.post(
                    f"/api/lessons/{french_lesson_id}/questions/generate",
                    headers=child_headers,
                    json={},
                ),
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        concurrent_statuses = sorted(response.status_code for response in concurrent_language_responses)
        if concurrent_statuses != [200, 502] or concurrent_language_ai_calls != 2:
            raise AssertionError(
                "concurrent identical language batches must append once without duplicates: "
                f"statuses={concurrent_statuses}, calls={concurrent_language_ai_calls}"
            )
        with Session(main.engine) as session:
            after_concurrent = session.exec(
                main.select(main.LessonQuestion).where(
                    main.LessonQuestion.child_id == child_id,
                    main.LessonQuestion.lesson_id == french_lesson_id,
                )
            ).all()
        if len(after_concurrent) != 10 or len({item.front for item in after_concurrent}) != 10:
            raise AssertionError("concurrent language generation created duplicates or a partial batch")

        def forbid_ai_during_completion(**_kwargs):
            raise AssertionError("lesson completion must not call AI question generation")

        try:
            main.phrase_generation_service.generate_json_text = forbid_ai_during_completion
            deterministic_completion_response = await client.post(
                f"/api/lesson/complete?lesson_id={french_lesson_id}",
                headers=child_headers,
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        assert_status(
            deterministic_completion_response,
            200,
            "French lesson completion stays deterministic",
        )

        mixed_language_review_response = await client.get(
            "/api/review?limit=50",
            headers=child_headers,
        )
        assert_status(mixed_language_review_response, 200, "mixed French language review")
        mixed_language_cards = mixed_language_review_response.json()["items"]
        mixed_card_types = {card["card_type"] for card in mixed_language_cards}
        if mixed_card_types != {"vocabulary", "lesson_question"}:
            raise AssertionError(
                f"expected vocabulary and lesson questions in review, got {mixed_language_cards}"
            )

        vocabulary_only_review_response = await client.get(
            "/api/review?limit=50&vocabulary_only=true",
            headers=child_headers,
        )
        assert_status(
            vocabulary_only_review_response,
            200,
            "vocabulary-only French language review",
        )
        vocabulary_only_cards = vocabulary_only_review_response.json()["items"]
        if not vocabulary_only_cards or any(
            card["card_type"] != "vocabulary" for card in vocabulary_only_cards
        ):
            raise AssertionError(
                "vocabulary_only review leaked a lesson question into the vocabulary renderer: "
                f"{vocabulary_only_cards}"
            )
        reviewed_lesson_question = next(
            card for card in mixed_language_cards if card["card_type"] == "lesson_question"
        )
        reviewed_vocabulary = next(
            card for card in mixed_language_cards if card["card_type"] == "vocabulary"
        )

        with Session(main.engine) as session:
            question_before = session.get(
                main.LessonQuestion,
                reviewed_lesson_question["lesson_question_id"],
            )
            vocabulary_before = session.get(main.ReviewItem, reviewed_vocabulary["review_item_id"])
            if question_before is None or vocabulary_before is None:
                raise AssertionError("expected canonical mixed review records")
            question_schedule_before = question_before.next_review
            vocabulary_state_before = (
                vocabulary_before.next_review,
                vocabulary_before.attempt_count,
                vocabulary_before.correct_count,
                vocabulary_before.error_count,
            )

        lesson_question_attempt_response = await client.post(
            "/api/review/attempt",
            headers=child_headers,
            json={
                "card_type": "lesson_question",
                "lesson_question_id": reviewed_lesson_question["lesson_question_id"],
                "correct": True,
            },
        )
        assert_status(lesson_question_attempt_response, 200, "grade French lesson question")
        lesson_question_attempt = lesson_question_attempt_response.json()
        if lesson_question_attempt["card_type"] != "lesson_question" or lesson_question_attempt[
            "card_id"
        ] != reviewed_lesson_question["lesson_question_id"]:
            raise AssertionError(f"unexpected mixed review result: {lesson_question_attempt}")

        with Session(main.engine) as session:
            question_after = session.get(
                main.LessonQuestion,
                reviewed_lesson_question["lesson_question_id"],
            )
            vocabulary_after = session.get(main.ReviewItem, reviewed_vocabulary["review_item_id"])
            if question_after is None or vocabulary_after is None:
                raise AssertionError("expected mixed review records after grading")
            if question_after.next_review <= question_schedule_before:
                raise AssertionError("lesson question schedule did not move forward")
            vocabulary_state_after = (
                vocabulary_after.next_review,
                vocabulary_after.attempt_count,
                vocabulary_after.correct_count,
                vocabulary_after.error_count,
            )
            if vocabulary_state_after != vocabulary_state_before:
                raise AssertionError("grading a lesson question changed vocabulary scheduling")

            foreign_review_question = main.LessonQuestion(
                child_id=other_child_id,
                lesson_id=french_lesson_id,
                target_language="French",
                question_type="grammar",
                front="Question privee ?",
                front_key=main.front_key_for("Question privee ?"),
                back="Reponse privee.",
            )
            session.add(foreign_review_question)
            session.commit()
            session.refresh(foreign_review_question)
            foreign_review_question_id = foreign_review_question.id or 0

        foreign_lesson_question_attempt = await client.post(
            "/api/review/attempt",
            headers=child_headers,
            json={
                "card_type": "lesson_question",
                "lesson_question_id": foreign_review_question_id,
                "correct": False,
            },
        )
        assert_status(
            foreign_lesson_question_attempt,
            404,
            "reject grading another child's lesson question",
        )

        with Session(main.engine) as session:
            restored_child = session.get(main.ChildProfile, child_id)
            if restored_child is None:
                raise AssertionError("expected child while restoring language")
            restored_child.target_language = "English"
            session.add(restored_child)
            old_french_lesson = main.Lesson(
                title="Ancienne lecon francaise",
                theme="Revision",
                objective="Conserver la langue de la lecon",
                child_id=child_id,
                target_language="French",
                content={},
            )
            mutable_language_lesson = main.Lesson(
                title="Lecon dont la langue change",
                theme="Revision",
                objective="Detecter un changement concurrent",
                child_id=child_id,
                target_language="French",
                content={},
            )
            session.add(old_french_lesson)
            session.add(mutable_language_lesson)
            session.commit()
            session.refresh(old_french_lesson)
            session.refresh(mutable_language_lesson)
            old_french_lesson_id = old_french_lesson.id or 0
            mutable_language_lesson_id = mutable_language_lesson.id or 0

        old_lesson_prompt = ""

        def mock_old_french_lesson_json(**kwargs):
            nonlocal old_lesson_prompt
            old_lesson_prompt = kwargs["prompt"]
            return main.json.dumps(
                {
                    "questions": [
                        {
                            "front": f"Ancienne question {index} ?",
                            "back": f"Reponse {index}.",
                            "question_type": ["grammar", "translation", "vocabulary"][index % 3],
                        }
                        for index in range(1, 6)
                    ]
                },
                ensure_ascii=False,
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_old_french_lesson_json
            old_french_questions_response = await client.post(
                f"/api/lessons/{old_french_lesson_id}/questions/generate",
                headers=child_headers,
                json={},
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        assert_status(
            old_french_questions_response,
            200,
            "generate from an old French lesson after child switches to English",
        )
        old_french_questions = old_french_questions_response.json()
        if {question["target_language"] for question in old_french_questions} != {"French"}:
            raise AssertionError(
                "question language must come from the persisted lesson after child switches: "
                f"{old_french_questions}"
            )
        if "Idioma-alvo: French" not in old_lesson_prompt or "Idioma-alvo: English" in old_lesson_prompt:
            raise AssertionError(f"old lesson prompt used the child's current language: {old_lesson_prompt}")

        def mock_language_change_during_ai(**_kwargs):
            with Session(main.engine) as competing_session:
                changing_lesson = competing_session.get(main.Lesson, mutable_language_lesson_id)
                if changing_lesson is None:
                    raise AssertionError("expected mutable language lesson")
                changing_lesson.target_language = "German"
                competing_session.add(changing_lesson)
                competing_session.commit()
            return main.json.dumps(
                {
                    "questions": [
                        {
                            "front": f"Question avant changement {index} ?",
                            "back": f"Reponse {index}.",
                            "question_type": ["grammar", "translation", "vocabulary"][index % 3],
                        }
                        for index in range(1, 6)
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_language_change_during_ai
            language_changed_response = await client.post(
                f"/api/lessons/{mutable_language_lesson_id}/questions/generate",
                headers=child_headers,
                json={},
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        assert_status(language_changed_response, 409, "reject lesson language changed during AI")
        with Session(main.engine) as session:
            language_changed_questions = session.exec(
                main.select(main.LessonQuestion).where(
                    main.LessonQuestion.child_id == child_id,
                    main.LessonQuestion.lesson_id == mutable_language_lesson_id,
                )
            ).all()
        if language_changed_questions:
            raise AssertionError("lesson language race persisted a partial question batch")

        with Session(main.engine) as session:
            capacity_lesson = main.Lesson(
                title="English capacity lesson",
                theme="Capacity",
                objective="Enforce the per-lesson question limit",
                child_id=child_id,
                target_language="English",
                content={},
            )
            capacity_race_lesson = main.Lesson(
                title="English capacity race lesson",
                theme="Capacity",
                objective="Recheck capacity after AI",
                child_id=child_id,
                target_language="English",
                content={},
            )
            session.add(capacity_lesson)
            session.add(capacity_race_lesson)
            session.flush()
            language_capacity_lesson_id = capacity_lesson.id or 0
            language_capacity_race_lesson_id = capacity_race_lesson.id or 0
            for lesson_id, count, prefix in (
                (language_capacity_lesson_id, 195, "capacity-existing"),
                (language_capacity_race_lesson_id, 194, "capacity-race-existing"),
            ):
                for index in range(count):
                    front = f"{prefix} {index}?"
                    session.add(
                        main.LessonQuestion(
                            child_id=child_id,
                            lesson_id=lesson_id,
                            target_language="English",
                            question_type="grammar",
                            front=front,
                            front_key=main.front_key_for(front),
                            back="Answer.",
                        )
                    )
            session.commit()

        language_capacity_ai_calls = 0

        def mock_language_capacity_json(**_kwargs):
            nonlocal language_capacity_ai_calls
            language_capacity_ai_calls += 1
            return main.json.dumps(
                {
                    "questions": [
                        {
                            "front": f"Capacity generated {index}?",
                            "back": "Answer.",
                            "question_type": ["grammar", "translation", "vocabulary"][index % 3],
                        }
                        for index in range(1, 6)
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_language_capacity_json
            exact_language_capacity_response = await client.post(
                f"/api/lessons/{language_capacity_lesson_id}/questions/generate",
                headers=child_headers,
                json={},
            )
            exceeded_language_capacity_response = await client.post(
                f"/api/lessons/{language_capacity_lesson_id}/questions/generate",
                headers=child_headers,
                json={},
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        assert_status(exact_language_capacity_response, 200, "fill language question capacity exactly")
        assert_status(exceeded_language_capacity_response, 409, "reject language capacity before AI")
        if language_capacity_ai_calls != 1:
            raise AssertionError(
                f"language capacity rejection must happen before AI: {language_capacity_ai_calls}"
            )
        with Session(main.engine) as session:
            exact_capacity_count = len(
                session.exec(
                    main.select(main.LessonQuestion).where(
                        main.LessonQuestion.child_id == child_id,
                        main.LessonQuestion.lesson_id == language_capacity_lesson_id,
                    )
                ).all()
            )
        if exact_capacity_count != main.MAX_LESSON_QUESTIONS:
            raise AssertionError(f"unexpected exact language capacity count: {exact_capacity_count}")

        def mock_language_capacity_change(**_kwargs):
            with Session(main.engine) as competing_session:
                for index in range(2):
                    front = f"External capacity race {index}?"
                    competing_session.add(
                        main.LessonQuestion(
                            child_id=child_id,
                            lesson_id=language_capacity_race_lesson_id,
                            target_language="English",
                            question_type="grammar",
                            front=front,
                            front_key=main.front_key_for(front),
                            back="External answer.",
                        )
                    )
                competing_session.commit()
            return main.json.dumps(
                {
                    "questions": [
                        {
                            "front": f"Race generated {index}?",
                            "back": "Answer.",
                            "question_type": ["grammar", "translation", "vocabulary"][index % 3],
                        }
                        for index in range(1, 6)
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_language_capacity_change
            changed_language_capacity_response = await client.post(
                f"/api/lessons/{language_capacity_race_lesson_id}/questions/generate",
                headers=child_headers,
                json={},
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_language_generate_json
        assert_status(
            changed_language_capacity_response,
            409,
            "recheck language question capacity after AI",
        )
        with Session(main.engine) as session:
            changed_capacity_count = len(
                session.exec(
                    main.select(main.LessonQuestion).where(
                        main.LessonQuestion.child_id == child_id,
                        main.LessonQuestion.lesson_id == language_capacity_race_lesson_id,
                    )
                ).all()
            )
        if changed_capacity_count != 196:
            raise AssertionError(
                "post-AI capacity conflict must preserve only external rows: "
                f"{changed_capacity_count}"
            )

        def capacity_subject(topic_count: int, linked_count: int, label: str) -> dict:
            topics = [
                {
                    "id": f"question-{label}-{index}",
                    "topic": f"Questao existente {label} {index}?",
                    "answer": f"Resposta existente {index}.",
                }
                for index in range(topic_count)
            ]
            return {
                "name": f"Materia {label}",
                "topics": topics,
                "lessons": [
                    {
                        "id": f"lesson-{label}",
                        "title": f"Licao {label}",
                        "topic_ids": [topic["id"] for topic in topics[:linked_count]],
                    }
                ],
            }

        capacity_date = today + timedelta(days=10)
        lesson_overflow_date = today + timedelta(days=11)
        subject_overflow_date = today + timedelta(days=12)
        with Session(main.engine) as session:
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=capacity_date,
                    custom_subjects=[capacity_subject(1545, 45, "capacity")],
                )
            )
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=lesson_overflow_date,
                    custom_subjects=[capacity_subject(46, 46, "lesson-overflow")],
                )
            )
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=subject_overflow_date,
                    custom_subjects=[capacity_subject(1546, 0, "subject-overflow")],
                )
            )
            session.commit()

        capacity_ai_calls = 0
        original_capacity_generate_json = main.phrase_generation_service.generate_json_text

        def mock_capacity_questions_json(**kwargs):
            nonlocal capacity_ai_calls
            capacity_ai_calls += 1
            return main.json.dumps(
                {
                    "questions": [
                        {"question": f"Nova questao de capacidade {index}?", "answer": "Resposta."}
                        for index in range(1, 6)
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_capacity_questions_json
            exact_capacity_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": capacity_date.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-capacity",
                },
            )
            assert_status(exact_capacity_response, 200, "append at exact diverse capacity boundary")
            lesson_overflow_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": lesson_overflow_date.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-lesson-overflow",
                },
            )
            assert_status(lesson_overflow_response, 409, "reject lesson above diverse capacity")
            subject_overflow_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": subject_overflow_date.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-subject-overflow",
                },
            )
            assert_status(subject_overflow_response, 409, "reject subject above diverse capacity")
        finally:
            main.phrase_generation_service.generate_json_text = original_capacity_generate_json
        if capacity_ai_calls != 1:
            raise AssertionError(f"capacity rejection must happen before AI call, got {capacity_ai_calls}")
        with Session(main.engine) as session:
            exact_capacity_record = session.exec(
                main.select(main.DiverseDay).where(
                    main.DiverseDay.child_id == child_id,
                    main.DiverseDay.study_date == capacity_date,
                )
            ).first()
            lesson_overflow_record = session.exec(
                main.select(main.DiverseDay).where(
                    main.DiverseDay.child_id == child_id,
                    main.DiverseDay.study_date == lesson_overflow_date,
                )
            ).first()
            subject_overflow_record = session.exec(
                main.select(main.DiverseDay).where(
                    main.DiverseDay.child_id == child_id,
                    main.DiverseDay.study_date == subject_overflow_date,
                )
            ).first()
            exact_subject = main.normalize_subject(exact_capacity_record.custom_subjects[0])
            lesson_overflow_subject = main.normalize_subject(lesson_overflow_record.custom_subjects[0])
            subject_overflow_subject = main.normalize_subject(subject_overflow_record.custom_subjects[0])
        if len(exact_subject["topics"]) != 1550 or len(exact_subject["lessons"][0]["topic_ids"]) != 50:
            raise AssertionError("exact 1545/45 boundary must append to schema limits")
        if len(lesson_overflow_subject["lessons"][0]["topic_ids"]) != 46:
            raise AssertionError("lesson capacity rejection mutated existing references")
        if len(subject_overflow_subject["topics"]) != 1546:
            raise AssertionError("subject capacity rejection mutated existing questions")

        capacity_changed_date = today + timedelta(days=15)
        with Session(main.engine) as session:
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=capacity_changed_date,
                    custom_subjects=[capacity_subject(1545, 45, "capacity-changed")],
                )
            )
            session.commit()

        capacity_changed_ai_calls = 0

        def mock_capacity_change_during_ai(**kwargs):
            nonlocal capacity_changed_ai_calls
            capacity_changed_ai_calls += 1
            with Session(main.engine) as session:
                changed_record = session.exec(
                    main.select(main.DiverseDay).where(
                        main.DiverseDay.child_id == child_id,
                        main.DiverseDay.study_date == capacity_changed_date,
                    )
                ).first()
                changed_subject = main.normalize_subject(changed_record.custom_subjects[0])
                changed_subject["topics"].append(
                    {
                        "id": "question-capacity-external",
                        "topic": "Questao externa durante IA?",
                        "answer": "Mudanca concorrente.",
                    }
                )
                changed_subject["lessons"][0]["topic_ids"].append("question-capacity-external")
                changed_record.custom_subjects = [changed_subject]
                changed_record.updated_at = main.datetime.utcnow()
                session.add(changed_record)
                session.commit()
            return mock_capacity_questions_json()

        try:
            main.phrase_generation_service.generate_json_text = mock_capacity_change_during_ai
            capacity_changed_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": capacity_changed_date.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-capacity-changed",
                },
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_capacity_generate_json
        assert_status(capacity_changed_response, 409, "recheck capacity after AI call")
        if capacity_changed_ai_calls != 1:
            raise AssertionError(f"expected one AI call before capacity changed, got {capacity_changed_ai_calls}")
        with Session(main.engine) as session:
            changed_record = session.exec(
                main.select(main.DiverseDay).where(
                    main.DiverseDay.child_id == child_id,
                    main.DiverseDay.study_date == capacity_changed_date,
                )
            ).first()
            changed_subject = main.normalize_subject(changed_record.custom_subjects[0])
        if len(changed_subject["topics"]) != 1546:
            raise AssertionError("post-AI capacity conflict must preserve only the external change")
        if len(changed_subject["lessons"][0]["topic_ids"]) != 46:
            raise AssertionError("post-AI capacity conflict mutated lesson references")

        reorder_date = today + timedelta(days=13)
        reorder_subject_a = {
            "name": "Materia A",
            "topics": [{"id": "question-a", "topic": "Questao original A?", "answer": "A."}],
            "lessons": [
                {
                    "id": "shared-lesson-id",
                    "title": "Mesmo titulo",
                    "topic_ids": ["question-a"],
                }
            ],
        }
        reorder_subject_b = {
            "name": "Materia B",
            "topics": [{"id": "question-b", "topic": "Questao original B?", "answer": "B."}],
            "lessons": [
                {
                    "id": "shared-lesson-id",
                    "title": "Mesmo titulo",
                    "topic_ids": ["question-b"],
                }
            ],
        }
        reorder_preview = main.normalize_subjects([reorder_subject_a, reorder_subject_b])
        reordered_selected_subject_id = reorder_preview[0]["id"]
        with Session(main.engine) as session:
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=reorder_date,
                    custom_subjects=[reorder_subject_a, reorder_subject_b],
                )
            )
            session.commit()

        reorder_ai_calls = 0

        def mock_reorder_during_ai(**kwargs):
            nonlocal reorder_ai_calls
            reorder_ai_calls += 1
            with Session(main.engine) as session:
                reorder_record = session.exec(
                    main.select(main.DiverseDay).where(
                        main.DiverseDay.child_id == child_id,
                        main.DiverseDay.study_date == reorder_date,
                    )
                ).first()
                reorder_record.custom_subjects = list(reversed(reorder_record.custom_subjects))
                reorder_record.updated_at = main.datetime.utcnow()
                session.add(reorder_record)
                session.commit()
            return main.json.dumps(
                {
                    "questions": [
                        {"question": f"Questao gerada para A {index}?", "answer": "A."}
                        for index in range(1, 6)
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_reorder_during_ai
            reordered_generation_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": reorder_date.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "shared-lesson-id",
                },
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_capacity_generate_json
        assert_status(reordered_generation_response, 200, "follow materialized subject through reorder")
        if reorder_ai_calls != 1:
            raise AssertionError(f"expected one AI call before reorder conflict, got {reorder_ai_calls}")
        reordered_day_response = await client.get(
            f"/api/study/diverse/{reorder_date.isoformat()}", headers=child_headers
        )
        assert_status(reordered_day_response, 200, "reload reordered diverse day")
        reordered_subjects = reordered_day_response.json()["custom_subjects"]
        if [subject["name"] for subject in reordered_subjects] != ["Materia B", "Materia A"]:
            raise AssertionError(f"expected external reorder to remain committed, got {reordered_subjects}")
        reordered_by_id = {subject["id"]: subject for subject in reordered_subjects}
        if len(reordered_by_id[reordered_selected_subject_id]["topics"]) != 6:
            raise AssertionError(f"materialized subject lost generated questions after reorder: {reordered_subjects}")
        if any(
            len(subject["topics"]) != 1
            for subject_id, subject in reordered_by_id.items()
            if subject_id != reordered_selected_subject_id
        ):
            raise AssertionError(f"reordered subject received questions for another ID: {reordered_subjects}")

        canonical_reorder_date = today + timedelta(days=16)
        canonical_reorder_subjects = [
            {
                "id": "subject-canonical-a",
                "name": "Materia com mesmo nome",
                "topics": [
                    {"id": "question-canonical-a", "topic": "Questao original canonica A?", "answer": "A."}
                ],
                "lessons": [
                    {
                        "id": "lesson-canonical-a",
                        "title": "Mesmo titulo de licao",
                        "topic_ids": ["question-canonical-a"],
                    }
                ],
            },
            {
                "id": "subject-canonical-b",
                "name": "Materia com mesmo nome",
                "topics": [
                    {"id": "question-canonical-b", "topic": "Questao original canonica B?", "answer": "B."}
                ],
                "lessons": [
                    {
                        "id": "lesson-canonical-b",
                        "title": "Mesmo titulo de licao",
                        "topic_ids": ["question-canonical-b"],
                    }
                ],
            },
        ]
        with Session(main.engine) as session:
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=canonical_reorder_date,
                    custom_subjects=canonical_reorder_subjects,
                )
            )
            session.commit()

        canonical_generated_fronts = [
            f"Questao para identidade canonica A {index}?" for index in range(1, 6)
        ]

        def mock_canonical_reorder_during_ai(**kwargs):
            with Session(main.engine) as session:
                canonical_record = session.exec(
                    main.select(main.DiverseDay).where(
                        main.DiverseDay.child_id == child_id,
                        main.DiverseDay.study_date == canonical_reorder_date,
                    )
                ).first()
                canonical_record.custom_subjects = list(reversed(canonical_record.custom_subjects))
                canonical_record.updated_at = main.datetime.utcnow()
                session.add(canonical_record)
                session.commit()
            return main.json.dumps(
                {
                    "questions": [
                        {"question": front, "answer": "Resposta A."}
                        for front in canonical_generated_fronts
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_canonical_reorder_during_ai
            canonical_reorder_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": canonical_reorder_date.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-canonical-a",
                },
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_capacity_generate_json
        assert_status(canonical_reorder_response, 200, "follow canonical subject identity after reorder")
        canonical_reorder_day = await client.get(
            f"/api/study/diverse/{canonical_reorder_date.isoformat()}", headers=child_headers
        )
        assert_status(canonical_reorder_day, 200, "reload canonical reorder result")
        canonical_by_id = {
            subject["id"]: subject for subject in canonical_reorder_day.json()["custom_subjects"]
        }
        canonical_a = canonical_by_id["subject-canonical-a"]
        canonical_b = canonical_by_id["subject-canonical-b"]
        if len(canonical_a["topics"]) != 6 or len(canonical_a["lessons"][0]["topic_ids"]) != 6:
            raise AssertionError(f"generated questions did not follow canonical A identity: {canonical_a}")
        if len(canonical_b["topics"]) != 1 or len(canonical_b["lessons"][0]["topic_ids"]) != 1:
            raise AssertionError(f"canonical B was incorrectly mutated after reorder: {canonical_b}")
        if not set(canonical_generated_fronts).issubset(
            {topic["topic"] for topic in canonical_a["topics"]}
        ):
            raise AssertionError(f"canonical A is missing generated questions: {canonical_a}")

        legacy_window_date = today + timedelta(days=17)
        legacy_window_subjects = [
            {
                "name": "Materia legada repetida",
                "topics": [
                    {"topic": "Conteudo original legado A?", "answer": "A."}
                ],
                "lessons": [
                    {
                        "title": "Mesmo rotulo legado",
                        "topics": [
                            {"topic": "Conteudo original legado A?", "answer": "A."}
                        ],
                    }
                ],
            },
            {
                "name": "Materia legada repetida",
                "topics": [
                    {"topic": "Conteudo original legado B?", "answer": "B."}
                ],
                "lessons": [
                    {
                        "title": "Mesmo rotulo legado",
                        "topics": [
                            {"topic": "Conteudo original legado B?", "answer": "B."}
                        ],
                    }
                ],
            },
        ]
        legacy_window_preview = main.normalize_subjects(legacy_window_subjects)
        selected_legacy_subject_id = legacy_window_preview[0]["id"]
        selected_legacy_lesson_id = legacy_window_preview[0]["lessons"][0]["id"]
        with Session(main.engine) as session:
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=legacy_window_date,
                    custom_subjects=legacy_window_subjects,
                )
            )
            session.commit()

        legacy_ai_started = main.threading.Event()
        allow_legacy_ai_return = main.threading.Event()
        observed_persisted_identities: dict[str, object] = {}
        legacy_window_ai_calls = 0
        legacy_generated_fronts = [
            f"Questao gerada para legado A {index}?" for index in range(1, 6)
        ]

        def mock_legacy_window_ai(**kwargs):
            nonlocal legacy_window_ai_calls
            legacy_window_ai_calls += 1
            with Session(main.engine) as session:
                observed_record = session.exec(
                    main.select(main.DiverseDay).where(
                        main.DiverseDay.child_id == child_id,
                        main.DiverseDay.study_date == legacy_window_date,
                    )
                ).first()
                observed_persisted_identities["canonical"] = (
                    main.has_canonical_subject_identities(observed_record.custom_subjects)
                )
                observed_persisted_identities["subjects"] = observed_record.custom_subjects
                observed_persisted_identities["activity_count"] = len(
                    session.exec(
                        main.select(main.DailyActivity).where(
                            main.DailyActivity.child_id == child_id,
                            main.DailyActivity.activity_date == legacy_window_date,
                            main.DailyActivity.activity_type == "diverse",
                        )
                    ).all()
                )
            legacy_ai_started.set()
            if not allow_legacy_ai_return.wait(timeout=5):
                raise AssertionError("timed out waiting for stale legacy PUT")
            return main.json.dumps(
                {
                    "questions": [
                        {"question": front, "answer": "Resposta legada A."}
                        for front in legacy_generated_fronts
                    ]
                }
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_legacy_window_ai
            legacy_generate_task = asyncio.create_task(
                client.post(
                    "/api/study/diverse/questions/generate",
                    headers=child_headers,
                    json={
                        "study_date": legacy_window_date.isoformat(),
                        "subject_index": 0,
                        "lesson_id": selected_legacy_lesson_id,
                    },
                )
            )
            if not await asyncio.to_thread(legacy_ai_started.wait, 5):
                raise AssertionError("legacy generation did not reach AI call")
            stale_legacy_put_response = await client.put(
                f"/api/study/diverse/{legacy_window_date.isoformat()}",
                headers=child_headers,
                json={"custom_subjects": list(reversed(legacy_window_subjects))},
            )
            allow_legacy_ai_return.set()
            legacy_generate_response = await legacy_generate_task
        finally:
            allow_legacy_ai_return.set()
            main.phrase_generation_service.generate_json_text = original_capacity_generate_json
        assert_status(stale_legacy_put_response, 409, "reject stale reordered legacy PUT")
        assert_status(legacy_generate_response, 200, "generate after materializing legacy identities")
        if legacy_window_ai_calls != 1:
            raise AssertionError(f"legacy materialization must preserve one AI call, got {legacy_window_ai_calls}")
        if observed_persisted_identities.get("canonical") is not True:
            raise AssertionError(
                f"legacy identities were not persisted before AI call: {observed_persisted_identities}"
            )
        if observed_persisted_identities.get("activity_count") != 0:
            raise AssertionError(
                f"identity-only migration must not add activity: {observed_persisted_identities}"
            )
        persisted_before_ai = observed_persisted_identities["subjects"]
        if persisted_before_ai[0]["id"] != selected_legacy_subject_id:
            raise AssertionError(f"materialized subject identity changed unexpectedly: {persisted_before_ai}")
        legacy_window_final = await client.get(
            f"/api/study/diverse/{legacy_window_date.isoformat()}", headers=child_headers
        )
        assert_status(legacy_window_final, 200, "reload materialized legacy generation")
        legacy_final_by_id = {
            subject["id"]: subject for subject in legacy_window_final.json()["custom_subjects"]
        }
        selected_legacy_final = legacy_final_by_id[selected_legacy_subject_id]
        other_legacy_final = next(
            subject
            for subject_id, subject in legacy_final_by_id.items()
            if subject_id != selected_legacy_subject_id
        )
        if len(selected_legacy_final["topics"]) != 6:
            raise AssertionError(f"legacy generation missed original subject identity: {selected_legacy_final}")
        if len(other_legacy_final["topics"]) != 1:
            raise AssertionError(f"stale legacy PUT redirected generated cards: {other_legacy_final}")
        if not set(legacy_generated_fronts).issubset(
            {topic["topic"] for topic in selected_legacy_final["topics"]}
        ):
            raise AssertionError(f"generated legacy cards attached to wrong identity: {legacy_final_by_id}")

        diverse_ai_calls: list[dict[str, str]] = []
        original_generate_diverse_json = main.phrase_generation_service.generate_json_text

        def mock_diverse_questions_json(*, system_text, prompt, temperature, ai_config, timeout_seconds=None):
            diverse_ai_calls.append({"system_text": system_text, "prompt": prompt})
            return (
                '{"questions":['
                '{"question":"Como a mitose conserva o numero de cromossomos?","answer":"Replica e separa igualmente as cromatides."},'
                '{"question":"Em qual fase os cromossomos se alinham no equador?","answer":"Na metafase."},'
                '{"question":"Qual e a funcao do fuso mitotico?","answer":"Mover e separar os cromossomos."},'
                '{"question":"O que ocorre durante a anafase?","answer":"As cromatides irmas migram para polos opostos."},'
                '{"question":"Por que a mitose e importante no crescimento?","answer":"Ela aumenta o numero de celulas somaticas."}'
                ']}'
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_diverse_questions_json
            append_diverse_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": today.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-mitose",
                    "context": "  prova   de vestibular  ",
                },
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_generate_diverse_json
        assert_status(append_diverse_response, 200, "append five diverse AI questions")
        appended_questions = append_diverse_response.json()
        if len(appended_questions) != 5 or len(diverse_ai_calls) != 1:
            raise AssertionError(
                f"expected five questions from exactly one AI call, got {appended_questions}, calls={diverse_ai_calls}"
            )
        prompt = diverse_ai_calls[0]["prompt"]
        for expected_prompt_part in [
            "Biologia",
            "Mitose",
            "O que e mitose?",
            "Divisao celular",
            "prova de vestibular",
            "Determine from the subject whether it is technical",
            "PRIORITIZE technical-interview questions",
            "otherwise create exam-style",
        ]:
            if expected_prompt_part not in prompt:
                raise AssertionError(f"expected {expected_prompt_part!r} in diverse prompt, got {prompt}")

        generated_day_response = await client.get(
            f"/api/study/diverse/{today.isoformat()}", headers=child_headers
        )
        assert_status(generated_day_response, 200, "reload generated diverse questions")
        generated_subject = generated_day_response.json()["custom_subjects"][0]
        generated_lesson = generated_subject["lessons"][0]
        generated_topics_by_id = {topic["id"]: topic for topic in generated_subject["topics"]}
        appended_ids = [question["id"] for question in appended_questions]
        if generated_lesson["topic_ids"][-5:] != appended_ids:
            raise AssertionError(
                f"expected lesson to reference appended canonical IDs, got {generated_lesson}"
            )
        if any(generated_topics_by_id.get(question_id) != question for question_id, question in zip(appended_ids, appended_questions)):
            raise AssertionError(
                f"expected response questions to be canonical persisted topics, got {generated_subject}"
            )

        questions_before_failure = generated_subject["topics"]
        lesson_ids_before_failure = generated_lesson["topic_ids"]

        def mock_malformed_diverse_json(**kwargs):
            return "not valid JSON"

        try:
            main.phrase_generation_service.generate_json_text = mock_malformed_diverse_json
            malformed_diverse_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": today.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-mitose",
                },
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_generate_diverse_json
        assert_status(malformed_diverse_response, 502, "reject malformed diverse AI batch")
        after_failure_response = await client.get(
            f"/api/study/diverse/{today.isoformat()}", headers=child_headers
        )
        assert_status(after_failure_response, 200, "reload diverse day after malformed AI batch")
        after_failure_subject = after_failure_response.json()["custom_subjects"][0]
        if after_failure_subject["topics"] != questions_before_failure:
            raise AssertionError("malformed AI batch partially changed canonical diverse questions")
        if after_failure_subject["lessons"][0]["topic_ids"] != lesson_ids_before_failure:
            raise AssertionError("malformed AI batch partially changed diverse lesson references")

        invalid_subject_response = await client.post(
            "/api/study/diverse/questions/generate",
            headers=child_headers,
            json={
                "study_date": today.isoformat(),
                "subject_index": 99,
                "lesson_id": "lesson-mitose",
            },
        )
        assert_status(invalid_subject_response, 404, "reject missing diverse subject")
        invalid_lesson_response = await client.post(
            "/api/study/diverse/questions/generate",
            headers=child_headers,
            json={
                "study_date": today.isoformat(),
                "subject_index": 0,
                "lesson_id": "missing-lesson",
            },
        )
        assert_status(invalid_lesson_response, 404, "reject missing diverse lesson")
        negative_subject_response = await client.post(
            "/api/study/diverse/questions/generate",
            headers=child_headers,
            json={
                "study_date": today.isoformat(),
                "subject_index": -1,
                "lesson_id": "lesson-mitose",
            },
        )
        assert_status(negative_subject_response, 422, "validate diverse subject index")

        technical_subject = {
            "name": "Sistemas Operacionais e Redes",
            "topics": [
                {
                    "topic": "O que e um deadlock?",
                    "answer": "Um bloqueio circular entre processos ou threads.",
                }
            ],
            "lessons": [
                {
                    "id": "lesson-python-listas",
                    "title": "Listas",
                    "topics": [
                        {
                            "topic": "O que e um deadlock?",
                            "answer": "Um bloqueio circular entre processos ou threads.",
                        }
                    ],
                }
            ],
        }
        with Session(main.engine) as session:
            technical_record = session.exec(
                main.select(main.DiverseDay).where(
                    main.DiverseDay.child_id == child_id,
                    main.DiverseDay.study_date == today,
                )
            ).first()
            if technical_record is None:
                raise AssertionError("expected diverse record before technical question generation")
            technical_record.custom_subjects = [
                *technical_record.custom_subjects,
                technical_subject,
            ]
            session.add(technical_record)
            session.commit()

        technical_ai_calls: list[str] = []

        def mock_technical_questions_json(*, system_text, prompt, temperature, ai_config, timeout_seconds=None):
            technical_ai_calls.append(prompt)
            return (
                '{"questions":['
                '{"question":"Como evitar deadlock ao adquirir dois locks?","answer":"Use uma ordem global consistente.","code_example":"with lock_a:\\n    with lock_b:\\n        update()"},'
                '{"question":"Quais condicoes tornam um deadlock possivel?","answer":"Exclusao mutua, posse e espera, sem preempcao e espera circular."},'
                '{"question":"Como mutex difere de semaforo?","answer":"Mutex tem posse exclusiva; semaforo controla uma contagem de recursos."},'
                '{"question":"O que starvation significa no escalonamento?","answer":"Uma tarefa espera indefinidamente por recursos ou CPU."},'
                '{"question":"Como detectar espera circular?","answer":"Procure ciclos no grafo de alocacao de recursos."}'
                ']}'
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_technical_questions_json
            technical_questions_response = await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": today.isoformat(),
                    "subject_index": 1,
                    "lesson_id": "lesson-python-listas",
                },
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_generate_diverse_json
        assert_status(technical_questions_response, 200, "append technical interview questions")
        technical_questions = technical_questions_response.json()
        if len(technical_ai_calls) != 1:
            raise AssertionError(f"expected one technical-subject AI call, got {technical_ai_calls}")
        for semantic_instruction in [
            "Determine from the subject whether it is technical",
            "PRIORITIZE technical-interview questions",
            "otherwise create exam-style",
        ]:
            if semantic_instruction not in technical_ai_calls[0]:
                raise AssertionError(
                    f"expected semantic conditional instruction {semantic_instruction!r}, got {technical_ai_calls}"
                )
        if not technical_questions[0].get("code_example"):
            raise AssertionError(f"expected optional code example to persist, got {technical_questions}")

        concurrent_day_before = await client.get(
            f"/api/study/diverse/{today.isoformat()}", headers=child_headers
        )
        assert_status(concurrent_day_before, 200, "load diverse day before concurrent append")
        concurrent_subject_before = concurrent_day_before.json()["custom_subjects"][0]
        concurrent_topics_before = len(concurrent_subject_before["topics"])
        concurrent_ids_before = len(concurrent_subject_before["lessons"][0]["topic_ids"])
        ai_overlap_barrier = main.threading.Barrier(2)
        original_session_commit = main.Session.commit

        batch_a = [
            {"question": f"Questao concorrente A{i}?", "answer": f"Resposta A{i}."}
            for i in range(1, 6)
        ]
        batch_b = [
            {"question": f"Questao concorrente B{i}?", "answer": f"Resposta B{i}."}
            for i in range(1, 6)
        ]

        def mock_concurrent_diverse_json(*, system_text, prompt, temperature, ai_config, timeout_seconds=None):
            ai_overlap_barrier.wait(timeout=5)
            cards = batch_a if "lote A" in prompt else batch_b
            return main.json.dumps({"questions": cards})

        def slow_concurrent_commit(session):
            time.sleep(0.15)
            return original_session_commit(session)

        async def append_concurrent_batch(context: str):
            return await client.post(
                "/api/study/diverse/questions/generate",
                headers=child_headers,
                json={
                    "study_date": today.isoformat(),
                    "subject_index": 0,
                    "lesson_id": "lesson-mitose",
                    "context": context,
                },
            )

        try:
            main.phrase_generation_service.generate_json_text = mock_concurrent_diverse_json
            main.Session.commit = slow_concurrent_commit
            concurrent_responses = await asyncio.gather(
                append_concurrent_batch("lote A"),
                append_concurrent_batch("lote B"),
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_generate_diverse_json
            main.Session.commit = original_session_commit
        for index, response in enumerate(concurrent_responses, start=1):
            assert_status(response, 200, f"concurrent diverse append {index}")
        concurrent_day_after = await client.get(
            f"/api/study/diverse/{today.isoformat()}", headers=child_headers
        )
        assert_status(concurrent_day_after, 200, "reload diverse day after concurrent append")
        concurrent_subject_after = concurrent_day_after.json()["custom_subjects"][0]
        if len(concurrent_subject_after["topics"]) != concurrent_topics_before + 10:
            raise AssertionError(
                "concurrent appends must preserve both canonical batches: "
                f"before={concurrent_topics_before}, after={len(concurrent_subject_after['topics'])}"
            )
        if len(concurrent_subject_after["lessons"][0]["topic_ids"]) != concurrent_ids_before + 10:
            raise AssertionError(
                "concurrent appends must preserve both lesson reference batches: "
                f"before={concurrent_ids_before}, "
                f"after={len(concurrent_subject_after['lessons'][0]['topic_ids'])}"
            )
        if main._diverse_question_locks:
            raise AssertionError(
                f"idle diverse generation locks must be removed, got {main._diverse_question_locks}"
            )

        cas_race_date = today + timedelta(days=14)
        cas_base_subject = {
            "name": "Historia CAS",
            "topics": [
                {"id": "question-cas-base", "topic": "Qual foi o evento inicial?", "answer": "Evento base."}
            ],
            "lessons": [
                {
                    "id": "lesson-cas-race",
                    "title": "Concorrencia",
                    "topic_ids": ["question-cas-base"],
                }
            ],
        }
        cas_base_subject = main.normalize_subjects([cas_base_subject])[0]
        with Session(main.engine) as session:
            session.add(
                main.DiverseDay(
                    child_id=child_id,
                    study_date=cas_race_date,
                    custom_subjects=[cas_base_subject],
                )
            )
            session.commit()

        generated_cas_fronts = [f"Questao CAS gerada {index}?" for index in range(1, 6)]
        generate_reached_cas = main.threading.Event()
        allow_generate_cas = main.threading.Event()
        original_cas_update = main._cas_update_diverse_day

        def mock_cas_race_ai(**kwargs):
            return main.json.dumps(
                {
                    "questions": [
                        {"question": front, "answer": "Resposta gerada."}
                        for front in generated_cas_fronts
                    ]
                }
            )

        def delay_generate_cas(*args, **kwargs):
            custom_subjects = kwargs["custom_subjects"]
            fronts = {
                topic.get("topic")
                for subject in custom_subjects
                for topic in subject.get("topics", [])
            }
            if any(front in fronts for front in generated_cas_fronts):
                generate_reached_cas.set()
                if not allow_generate_cas.wait(timeout=5):
                    raise AssertionError("timed out waiting for concurrent PUT before generate CAS")
            return original_cas_update(*args, **kwargs)

        manual_cas_subject = {
            "id": cas_base_subject["id"],
            "name": "Historia CAS",
            "topics": [
                *cas_base_subject["topics"],
                {
                    "id": "question-cas-manual",
                    "topic": "Qual mudanca foi salva manualmente?",
                    "answer": "A mudanca do PUT.",
                },
            ],
            "lessons": [
                {
                    "id": "lesson-cas-race",
                    "title": "Concorrencia",
                    "topic_ids": ["question-cas-base", "question-cas-manual"],
                }
            ],
        }
        try:
            main.phrase_generation_service.generate_json_text = mock_cas_race_ai
            main._cas_update_diverse_day = delay_generate_cas
            generate_cas_task = asyncio.create_task(
                client.post(
                    "/api/study/diverse/questions/generate",
                    headers=child_headers,
                    json={
                        "study_date": cas_race_date.isoformat(),
                        "subject_index": 0,
                        "lesson_id": "lesson-cas-race",
                    },
                )
            )
            reached_cas = await asyncio.to_thread(generate_reached_cas.wait, 5)
            if not reached_cas:
                raise AssertionError("generate did not reach delayed CAS update")
            concurrent_put_response = await client.put(
                f"/api/study/diverse/{cas_race_date.isoformat()}",
                headers=child_headers,
                json={"custom_subjects": [manual_cas_subject]},
            )
            assert_status(concurrent_put_response, 200, "concurrent Diverse PUT wins CAS race")
            allow_generate_cas.set()
            stale_generate_response = await generate_cas_task
        finally:
            allow_generate_cas.set()
            main.phrase_generation_service.generate_json_text = original_generate_diverse_json
            main._cas_update_diverse_day = original_cas_update
        assert_status(stale_generate_response, 409, "stale generate loses CAS race without overwrite")
        cas_race_final_response = await client.get(
            f"/api/study/diverse/{cas_race_date.isoformat()}", headers=child_headers
        )
        assert_status(cas_race_final_response, 200, "reload Diverse CAS race result")
        cas_race_final_subject = cas_race_final_response.json()["custom_subjects"][0]
        cas_race_final_fronts = {topic["topic"] for topic in cas_race_final_subject["topics"]}
        if "Qual mudanca foi salva manualmente?" not in cas_race_final_fronts:
            raise AssertionError(f"winning PUT disappeared after CAS race: {cas_race_final_subject}")
        if any(front in cas_race_final_fronts for front in generated_cas_fronts):
            raise AssertionError(f"stale generate silently overwrote CAS winner: {cas_race_final_subject}")

        children_after_noah_response = await client.get("/api/parent/children")
        assert_status(children_after_noah_response, 200, "reload children for ownership test")
        noah = next(child for child in children_after_noah_response.json() if child["name"] == "Noah")
        wrong_child_response = await client.post(
            "/api/study/diverse/questions/generate",
            headers={"X-Child-ID": str(noah["id"])},
            json={
                "study_date": today.isoformat(),
                "subject_index": 0,
                "lesson_id": "lesson-mitose",
            },
        )
        assert_status(wrong_child_response, 404, "do not expose another child's diverse day")

        old_topic_flashcard_response = await client.post(
            f"/api/coding/topics/{coding_topic['id']}/flashcards",
            headers=child_headers,
            json={
                "front": "Flashcard antigo de variaveis",
                "back": "Resposta antiga que deve sair ao regenerar.",
            },
        )
        assert_status(old_topic_flashcard_response, 201, "create old coding topic flashcard")

        captured_topic_generation: dict[str, str] = {}
        original_generate_topic_ai_content = main.generate_topic_ai_content
        try:
            def mock_generate_topic_ai_content(**kwargs):
                captured_topic_generation["user_context"] = kwargs.get("user_context", "")
                lesson_code = "const total = values.reduce((sum, value) => sum + value, 0);"
                return main.TopicAIContentSchema.model_validate(
                    {
                        "sections": [
                            {
                                "title": f"Variaveis novas {index}",
                                "body": "Conteudo regenerado.",
                                "code_example": lesson_code,
                            }
                            for index in range(1, 4)
                        ],
                        "quiz": [
                            {
                                "id": index,
                                "question": f"O que o reduce faz no caso {index}?",
                                "options": ["Soma", "Subtrai", "Multiplica", "Divide"],
                                "correct_option": "Soma",
                                "explanation": "O acumulador soma os valores.",
                            }
                            for index in range(1, 6)
                        ],
                        "flashcards": [
                            {
                                "front": f"Como voce explicaria o reduce em uma entrevista tecnica {index}?",
                                "back": "Reduce acumula os valores do array.",
                                "code_example": lesson_code,
                            }
                            for index in range(1, 6)
                        ],
                    }
                )

            main.generate_topic_ai_content = mock_generate_topic_ai_content
            regenerated_topic_response = await client.post(
                f"/api/coding/topics/{coding_topic['id']}/generate",
                headers=child_headers,
                json={"context": "refazer flashcards para iniciantes"},
            )
        finally:
            main.generate_topic_ai_content = original_generate_topic_ai_content
        assert_status(regenerated_topic_response, 200, "regenerate coding topic content")
        regenerated_topic = regenerated_topic_response.json()
        if regenerated_topic["flashcard_count"] != 5:
            raise AssertionError(f"expected regenerated topic to report five new flashcards, got {regenerated_topic}")
        if captured_topic_generation.get("user_context") != "refazer flashcards para iniciantes":
            raise AssertionError(f"expected regeneration context to reach AI service, got {captured_topic_generation}")

        regenerated_flashcards_response = await client.get(
            f"/api/coding/topics/{coding_topic['id']}/flashcards",
            headers=child_headers,
        )
        assert_status(regenerated_flashcards_response, 200, "list regenerated coding topic flashcards")
        regenerated_flashcards = regenerated_flashcards_response.json()
        regenerated_fronts = [card["front"] for card in regenerated_flashcards]
        expected_regenerated_fronts = [
            f"Como voce explicaria o reduce em uma entrevista tecnica {index}?"
            for index in range(1, 6)
        ]
        if regenerated_fronts != expected_regenerated_fronts:
            raise AssertionError(f"expected regenerated flashcards to replace old cards, got {regenerated_flashcards}")

        regenerated_deck_response = await client.get(
            f"/api/coding/subjects/{coding_subject['id']}/deck",
            headers=child_headers,
        )
        assert_status(regenerated_deck_response, 200, "deck reflects regenerated topic flashcards")
        regenerated_deck_cards = regenerated_deck_response.json()["cards"]
        deck_fronts = [card["front"] for card in regenerated_deck_cards]
        if deck_fronts != regenerated_fronts:
            raise AssertionError(f"expected deck cards to mirror regenerated flashcards, got {regenerated_deck_cards}")
        if len(regenerated_deck_cards) < 2:
            raise AssertionError(f"expected at least two regenerated deck cards for activity tests, got {regenerated_deck_cards}")

        deck_attempt_response = await client.post(
            "/api/coding/deck/attempt",
            headers=child_headers,
            json={"review_item_id": regenerated_deck_cards[0]["review_item_id"], "rating": "good"},
        )
        assert_status(deck_attempt_response, 200, "deck attempt logs flashcard study")

        coding_review_response = await client.get(
            f"/api/coding/review?subject_id={coding_subject['id']}&limit=5",
            headers=child_headers,
        )
        assert_status(coding_review_response, 200, "coding review after regenerated cards")
        coding_review_items = coding_review_response.json()["items"]
        coding_review_item = next(
            (
                item
                for item in coding_review_items
                if item["review_item_id"] != regenerated_deck_cards[0]["review_item_id"]
            ),
            coding_review_items[0] if coding_review_items else None,
        )
        if coding_review_item is None:
            raise AssertionError(f"expected coding review card, got {coding_review_response.text}")
        coding_review_attempt_response = await client.post(
            "/api/coding/review/attempt",
            headers=child_headers,
            json={"review_item_id": coding_review_item["review_item_id"], "rating": "knew"},
        )
        assert_status(coding_review_attempt_response, 200, "coding review attempt logs activity")

        captured_diverse_prompt: dict[str, str] = {}
        initial_diverse_ai_call_count = 0
        original_generate_json_text = main.phrase_generation_service.generate_json_text
        try:
            def mock_generate_json_text(*, system_text, prompt, temperature, ai_config, timeout_seconds=None):
                nonlocal initial_diverse_ai_call_count
                initial_diverse_ai_call_count += 1
                captured_diverse_prompt["prompt"] = prompt
                return (
                    '{"subject":"React","flashcards":['
                    '{"question":"O que sao hooks?","answer":"Hooks reutilizam estado e efeitos em componentes."},'
                    '{"question":"Quando usar props?","answer":"Props passam dados de um componente pai para um filho."}'
                    ']}'
                )

            main.phrase_generation_service.generate_json_text = mock_generate_json_text
            context_flashcards_response = await client.post(
                "/api/study/diverse/generate-flashcards",
                headers=child_headers,
                json={
                    "subject": "React",
                    "count": 2,
                    "context": "focar em hooks, props e erros comuns para dev junior",
                    "avoid_topics": ["Componentes"],
                },
            )
        finally:
            main.phrase_generation_service.generate_json_text = original_generate_json_text
        assert_status(context_flashcards_response, 200, "generate flashcards with context")
        if "hooks, props e erros comuns" not in captured_diverse_prompt.get("prompt", ""):
            raise AssertionError(f"expected AI context in diverse prompt, got {captured_diverse_prompt}")
        if initial_diverse_ai_call_count != 1:
            raise AssertionError(
                "initial Diverse question generation must use one AI request/response, "
                f"got {initial_diverse_ai_call_count}"
            )

        activity_response = await client.get("/api/activity/today", headers=child_headers)
        assert_status(activity_response, 200, "today activity log")
        activity_payload = activity_response.json()
        activity_types = activity_payload["activities_by_type"]
        for expected_type in [
            "lesson",
            "quiz",
            "review",
            "study",
            "coding",
            "diverse",
            "coding_review",
            "flashcard",
        ]:
            if activity_types.get(expected_type, 0) < 1:
                raise AssertionError(f"expected {expected_type} in activity log, got {activity_payload}")

        modules_response = await client.get("/api/admin/learn/modules")
        assert_status(modules_response, 200, "admin learn modules")
        modules = modules_response.json()
        leetcode_modules = [module for module in modules if module["category"] == "leetcode"]
        if not leetcode_modules:
            raise AssertionError(f"expected at least one leetcode module, got {modules}")
        if not any(module["slug"] == "leetcode-arrays-two-pointers" for module in leetcode_modules):
            raise AssertionError(f"expected leetcode arrays/two pointers module, got {leetcode_modules}")

        leetcode_response = await client.get("/api/admin/learn/modules/leetcode-arrays-two-pointers")
        assert_status(leetcode_response, 200, "admin leetcode module detail")
        leetcode_module = leetcode_response.json()
        practice_items = leetcode_module.get("practice", [])
        if len(practice_items) < 2:
            raise AssertionError(f"expected at least two leetcode practice items, got {practice_items}")
        first_practice = practice_items[0]
        if not first_practice.get("starter_code") or not first_practice.get("test_cases"):
            raise AssertionError(f"expected starter code and test cases, got {first_practice}")

        assert_status(await client.post("/api/auth/logout"), 200, "auth logout")
        assert_status(await client.get("/api/auth/me"), 401, "me after logout")

        google_start_response = await client.get("/api/auth/google/start?next=/parents", follow_redirects=False)
        if google_start_response.status_code not in (302, 307):
            raise AssertionError(f"google start: expected redirect, got {google_start_response.status_code}: {google_start_response.text}")
        google_state = client.cookies.get("google_oauth_state")
        if not google_state:
            raise AssertionError("expected google_oauth_state cookie after Google OAuth start")

        original_post = main.requests.post
        original_get = main.requests.get
        try:
            main.requests.post = lambda *args, **kwargs: MockGoogleResponse({"access_token": "google-access-token", "id_token": "google-id-token"})
            main.requests.get = lambda *args, **kwargs: MockGoogleResponse(
                {
                    "sub": "google-sub-123",
                    "email": "google@example.com",
                    "email_verified": True,
                    "given_name": "Google",
                    "family_name": "User",
                }
            )
            google_callback_response = await client.get(
                f"/api/auth/google/callback?state={google_state}&code=test-code",
                follow_redirects=False,
            )
        finally:
            main.requests.post = original_post
            main.requests.get = original_get

        if google_callback_response.status_code not in (302, 307):
            raise AssertionError(
                f"google callback: expected redirect, got {google_callback_response.status_code}: {google_callback_response.text}"
            )
        google_me_response = await client.get("/api/auth/me")
        assert_status(google_me_response, 200, "me after google login")
        if google_me_response.json()["email"] != "google@example.com":
            raise AssertionError(f"expected Google-created user session, got {google_me_response.text}")
        assert_status(await client.post("/api/auth/logout"), 200, "google auth logout")

        assert_status(await client.post("/api/parent/login", json={"password": "parent-pass"}), 200, "legacy parent login")
        assert_status(await client.post("/api/parent/logout"), 200, "parent logout")

    print("API route smoke tests passed.")


if __name__ == "__main__":
    asyncio.run(run())
