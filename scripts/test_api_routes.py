"""Integration smoke tests for the FastAPI backend routes.

The script uses a temporary SQLite database so it can run without touching
local development data.
"""
from __future__ import annotations

import os
import sys
import asyncio
import tempfile
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

        today = date.today()
        yesterday = today - timedelta(days=1)
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
            json={"subject": "React", "count": 3},
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
        if saved_subject["lessons"][0]["topics"][0]["topic"] != "Je m'appelle":
            raise AssertionError(f"expected diverse lesson block to round-trip, got {diverse_payload}")

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
