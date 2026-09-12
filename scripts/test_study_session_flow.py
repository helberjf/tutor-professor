"""The single study queue: build it once, come back to it, close the day with it.

Real HTTP requests against the app, because the promise being tested is a
behaviour and not a shape: a student who answers three cards, closes the app and
comes back must land on card four, and the day must count as studied without
anybody typing a line about it.

What is pinned here:

  - `GET /api/study/session` never creates anything (a button that started a
    session just by rendering the page would take the choice away from the student);
  - `POST /api/study/session/start` resumes the open session instead of
    reshuffling it, and `restart=true` is the only way to get a new queue;
  - the bookmark only moves forward, so a stale tab cannot rewind a student;
  - finishing closes the study day, and the day also closes from plain activity;
  - questions derived from a finished lesson need no provider and no credit;
  - a question answered right twice stops coming back.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-study-session-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'session.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["SESSION_SECRET"] = "test-session-secret-for-study-session"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "queue-admin@example.com"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import (  # noqa: E402
    ChildProfile,
    DailyActivity,
    Lesson,
    LessonItem,
    StudyQuestion,
    User,
)
from services.study_queue_service import (  # noqa: E402
    count_pending_questions,
    is_mastered,
    select_pending_questions,
)

VALID_CPF = "52998224725"
EMAIL = "fila@example.com"
PASSWORD = "Senha@Forte123"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def auth_headers(client: httpx.AsyncClient) -> dict[str, str]:
    await client.post(
        "/api/auth/register",
        json={
            "first_name": "Fila",
            "last_name": "Estudo",
            "email": EMAIL,
            "cpf": VALID_CPF,
            "password": PASSWORD,
        },
    )
    approve_all_accounts(main)
    enable_all_modules(main)
    login = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    require(login.status_code == 200, f"login failed: {login.text}")
    return {"Authorization": f"Bearer {login.json()['token']}"}


def seed_lesson(title: str) -> int:
    """A shared static lesson, the way scripts/init_db.py seeds the curated pack."""

    with Session(main.engine) as session:
        lesson = Lesson(
            title=title,
            theme="Frases do dia",
            objective="Aprender frases uteis.",
            content={"daily_goal": "3 frases"},
            child_id=None,
            level=None,
            target_language="English",
        )
        session.add(lesson)
        session.commit()
        session.refresh(lesson)
        for index, (word_en, word_pt) in enumerate(
            [("Good morning", "Bom dia"), ("Thank you", "Obrigado"), ("See you later", "Ate mais")]
        ):
            session.add(
                LessonItem(
                    lesson_id=lesson.id,
                    word_en=word_en,
                    word_pt=word_pt,
                    example_sentence_en=f"We say {word_en} every day.",
                    example_sentence_pt=f"A gente diz {word_pt} todo dia.",
                )
            )
        session.commit()
        return lesson.id or 0


def child_id_of_account() -> int:
    with Session(main.engine) as session:
        child = session.exec(select(ChildProfile).order_by(ChildProfile.id)).first()
        return child.id or 0 if child else 0


async def test_state_endpoint_creates_nothing(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    state = await client.get("/api/study/session", headers=headers)
    require(state.status_code == 200, f"session state failed: {state.text}")
    body = state.json()
    require(body["has_session"] is False, "a fresh account has nothing to continue")
    require(body["lesson_pending"] is True, "the seeded lesson should be reported as pending")

    with Session(main.engine) as session:
        require(
            session.exec(select(main.StudySession)).first() is None,
            "reading the state must not create a session",
        )


async def test_start_builds_a_queue_and_resumes_it(
    client: httpx.AsyncClient, headers: dict[str, str]
) -> tuple[int, int]:
    started = await client.post("/api/study/session/start", headers=headers)
    require(started.status_code == 200, f"start failed: {started.text}")
    body = started.json()
    require(body["total"] > 0, "the first session should carry today's lesson")
    require(
        all(item["kind"] == "lesson_item" for item in body["items"]),
        "a student with nothing learned yet should only be taught, not quizzed",
    )
    session_id = body["id"]

    # Starting again resumes: the same session, the same cards, same order.
    again = await client.post("/api/study/session/start", headers=headers)
    require(again.json()["id"] == session_id, "start must resume the open session")
    require(
        [item["prompt"] for item in again.json()["items"]] == [item["prompt"] for item in body["items"]],
        "resuming must not reshuffle the queue",
    )

    moved = await client.post(
        f"/api/study/session/{session_id}/progress",
        headers=headers,
        json={"position": 2, "answered_count": 2, "correct_count": 2},
    )
    require(moved.status_code == 200, f"progress failed: {moved.text}")
    require(moved.json()["position"] == 2, "the bookmark should be where the student stopped")

    rewind = await client.post(
        f"/api/study/session/{session_id}/progress",
        headers=headers,
        json={"position": 0},
    )
    require(rewind.json()["position"] == 2, "the bookmark must never go backwards")

    state = await client.get("/api/study/session", headers=headers)
    resumed = state.json()
    require(resumed["has_session"] is True, "an unfinished session is something to continue")
    require(resumed["position"] == 2 and resumed["remaining"] == resumed["total"] - 2,
            "the home screen should know exactly how much is left")
    require(bool(resumed["next_label"]), "the continue button needs something to name")

    return session_id, body["total"]


async def test_finish_closes_the_day(
    client: httpx.AsyncClient, headers: dict[str, str], session_id: int, total: int
) -> None:
    today = date.today().isoformat()
    before = await client.get(f"/api/study/day/{today}", headers=headers)
    require(before.json()["is_study_day"] is False, "the day starts open")

    finished = await client.post(
        f"/api/study/session/{session_id}/finish",
        headers=headers,
        json={"answered_count": total, "correct_count": total},
    )
    require(finished.status_code == 200, f"finish failed: {finished.text}")
    require(finished.json()["day_closed"] is True, "finishing a session closes the day")

    after = await client.get(f"/api/study/day/{today}", headers=headers)
    body = after.json()
    require(body["is_study_day"] is True, "the day must close without anybody typing")
    require(body["closed_by_activity"] is True, "the client has to be able to explain why it closed")
    require(body["studied_text"] == "", "closing the day must not invent a written record")

    state = await client.get("/api/study/session", headers=headers)
    require(state.json()["has_session"] is False, "a finished session is not something to continue")


async def test_day_also_closes_from_plain_activity(
    client: httpx.AsyncClient, headers: dict[str, str]
) -> None:
    """A lesson or review answered anywhere counts, not only a finished queue."""

    yesterday = date.today() - timedelta(days=1)
    with Session(main.engine) as session:
        session.add(
            DailyActivity(
                child_id=child_id_of_account(),
                activity_date=yesterday,
                activity_type="review",
                activity_title="Review: Good morning",
            )
        )
        session.commit()

    day = await client.get(f"/api/study/day/{yesterday.isoformat()}", headers=headers)
    body = day.json()
    require(body["is_study_day"] is True, "a day with activity is a day studied")
    require(body["activity_count"] == 1, "the day should report what closed it")

    dashboard = await client.get("/api/study/dashboard", headers=headers)
    require(
        dashboard.json()["study_streak_count"] >= 2,
        "two consecutive days with activity are a two-day streak",
    )


async def test_free_question_bank_needs_no_provider(
    client: httpx.AsyncClient, headers: dict[str, str], lesson_id: int
) -> None:
    """No AI key is configured in this test — the bank still fills up."""

    completed = await client.post(f"/api/lesson/complete?lesson_id={lesson_id}", headers=headers)
    require(completed.status_code == 200, f"completing the lesson failed: {completed.text}")

    target = {
        "area": "english",
        "subject_name": main.ENGLISH_QUESTION_SUBJECT,
        "topic_key": str(lesson_id),
        "topic_title": "Licao de teste",
    }
    ensured = await client.post("/api/study/questions/ensure", headers=headers, json=target)
    require(ensured.status_code == 200, f"ensure failed: {ensured.text}")
    questions = ensured.json()
    require(len(questions) >= 4, f"a three-phrase lesson should yield several questions, got {len(questions)}")
    for question in questions:
        require(len(question["options"]) == 4, "every question needs four options")
        require(question["correct_option"] in question["options"], "the right answer must be on the list")
        require(len(set(question["options"])) == 4, "options must not repeat")

    # Asking twice must not duplicate the bank.
    again = await client.post("/api/study/questions/ensure", headers=headers, json=target)
    require(len(again.json()) == len(questions), "ensure must be idempotent")

    # "Modo gramatica" is deliberately not filled from the same phrases:
    # translation questions labelled as grammar practice would be a lie about
    # what the student drilled, so that topic waits for the AI path.
    grammar = await client.post(
        "/api/study/questions/ensure",
        headers=headers,
        json={
            "area": "english",
            "subject_name": f"{main.ENGLISH_QUESTION_SUBJECT} - Gramatica",
            "topic_key": f"grammar:{lesson_id}",
            "topic_title": "Gramatica: Licao de teste",
        },
    )
    require(grammar.status_code == 200, f"grammar ensure failed: {grammar.text}")
    require(grammar.json() == [], "grammar mode must not be filled with vocabulary questions")

    # A topic that is already stocked schedules nothing at all.
    stocked = await client.post(
        "/api/study/questions/prefetch",
        headers=headers,
        json={**target, "threshold": 3},
    )
    require(stocked.status_code == 200, f"prefetch failed: {stocked.text}")
    require(stocked.json()["scheduled"] is False, "a full topic needs no top-up")
    require(stocked.json()["reason"] == "suficiente", "the reason should say why")

    # Running low schedules the provider call in the background, and the answer
    # comes back right away rather than waiting for it.
    hungry = await client.post(
        "/api/study/questions/prefetch",
        headers=headers,
        json={**target, "threshold": 20},
    )
    require(hungry.json()["scheduled"] is True, "a topic running low should be topped up")
    require(hungry.json()["reason"] == "gerando", "the reason should say what is happening")

    # With the daily credit spent, the top-up says so instead of failing or
    # silently charging something that is not there.
    with Session(main.engine) as session:
        user = session.exec(select(User).where(User.email == EMAIL)).first()
        user.ai_credits = 0
        user.ai_credits_reset_date = date.today()
        user.ai_unlimited = False
        session.add(user)
        session.commit()

    broke = await client.post(
        "/api/study/questions/prefetch",
        headers=headers,
        json={**target, "threshold": 20},
    )
    require(broke.json()["scheduled"] is False, "no credit means nothing to schedule")
    require(broke.json()["reason"] == "sem_credito", "the reason should be honest")

    # The lesson also got its free review questions when it was completed.
    review = await client.get("/api/review?limit=10", headers=headers)
    require(review.json()["total_due"] > 0, "a finished lesson must leave something to review")


async def test_mastered_questions_stop_coming_back(
    client: httpx.AsyncClient, headers: dict[str, str], lesson_id: int
) -> None:
    child_id = child_id_of_account()
    with Session(main.engine) as session:
        questions = session.exec(
            select(StudyQuestion).where(StudyQuestion.child_id == child_id).order_by(StudyQuestion.id)
        ).all()
        require(len(questions) >= 2, "the free bank should have filled by now")
        mastered, pending = questions[0], questions[1]
        mastered.attempt_count = 2
        mastered.correct_count = 2
        mastered.last_selected_option = mastered.correct_option
        mastered.last_answered_at = datetime.utcnow()
        pending.attempt_count = 1
        pending.correct_count = 0
        pending.error_count = 1
        pending.last_selected_option = next(
            option for option in pending.options if option != pending.correct_option
        )
        pending.last_answered_at = datetime.utcnow()
        session.add(mastered)
        session.add(pending)
        session.commit()
        mastered_id, pending_id = mastered.id, pending.id

        require(is_mastered(session.get(StudyQuestion, mastered_id)), "two right answers retire a question")
        require(not is_mastered(session.get(StudyQuestion, pending_id)), "a missed question is still owed")
        ordered = select_pending_questions(
            session.exec(select(StudyQuestion).where(StudyQuestion.child_id == child_id)).all()
        )
        require(
            all(question.id != mastered_id for question in ordered),
            "a mastered question must not be queued again",
        )
        require(
            ordered[0].attempt_count == 0 or ordered[0].id == pending_id,
            "never-seen questions come first, then the missed ones",
        )
        # The counter runs in SQL while is_mastered runs in Python; they are two
        # spellings of one rule and have to agree.
        every_question = session.exec(
            select(StudyQuestion).where(StudyQuestion.child_id == child_id)
        ).all()
        require(
            count_pending_questions(session, child_id)
            == sum(0 if is_mastered(question) else 1 for question in every_question),
            "the SQL count and the Python mastery rule disagree",
        )

    restarted = await client.post("/api/study/session/start?restart=true", headers=headers)
    body = restarted.json()
    require(body["total"] > 0, "there is still work after a lesson is done")
    queued_ids = {item["ref_id"] for item in body["items"] if item["kind"] == "study_question"}
    require(mastered_id not in queued_ids, "the queue must not serve a mastered question")


async def test_an_unreadable_queue_is_rebuilt(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    """A card written by an older release must not 500 the session screen."""

    child_id = child_id_of_account()
    with Session(main.engine) as session:
        record = session.exec(
            select(main.StudySession)
            .where(main.StudySession.child_id == child_id)
            .order_by(main.StudySession.id.desc())
        ).first()
        require(record is not None, "there should be a session to corrupt")
        record.status = "active"
        record.position = 1
        record.items = [{"kind": "something_this_version_never_heard_of", "ref_id": 1}]
        session.add(record)
        session.commit()
        broken_id = record.id

    state = await client.get("/api/study/session", headers=headers)
    require(state.status_code == 200, f"state should survive an unreadable queue: {state.text}")
    require(state.json()["has_session"] is False, "an unreadable queue is not something to continue")

    started = await client.post("/api/study/session/start", headers=headers)
    require(started.status_code == 200, f"start should rebuild, not fail: {started.text}")
    require(started.json()["id"] != broken_id, "the unreadable session should be replaced")
    require(started.json()["total"] > 0, "the rebuilt queue should carry the work that is still owed")


async def test_onboarding_places_the_child(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    state = await client.get("/api/onboarding/state", headers=headers)
    require(state.status_code == 200, f"onboarding state failed: {state.text}")
    require(state.json()["placement_available"] is True, "English must offer the placement test")

    placement = await client.get("/api/onboarding/placement", headers=headers)
    questions = placement.json()
    require(len(questions) == 5, "the placement test is five questions")
    require(
        [question["level"] for question in questions] == sorted(question["level"] for question in questions),
        "the test must get harder, not jump around",
    )
    for question in questions:
        require(question["correct_option"] in question["options"], "every step needs a right answer")

    done = await client.post(
        "/api/onboarding/complete",
        headers=headers,
        json={
            "child_name": "Ana",
            "age_group": "7-9",
            "target_language": "English",
            "correct_levels": [1, 2, 3],
        },
    )
    require(done.status_code == 200, f"onboarding failed: {done.text}")
    body = done.json()
    require(body["child_name"] == "Ana", "the child keeps the name that was typed")
    require(body["level"] == 4, "answering up to level 3 starts the student at 4")
    require(body["level_pinned"] is True, "a placed level has to survive the automatic ladder")

    level = await client.get("/api/child/level", headers=headers)
    require(level.json()["level"] == 4, "the placed level is what the app reports")

    state_after = await client.get("/api/onboarding/state", headers=headers)
    require(state_after.json()["completed"] is True, "a finished first run is not offered again")


async def run() -> None:
    main.on_startup()
    lesson_id = seed_lesson("Licao de teste")
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await auth_headers(client)
        await test_state_endpoint_creates_nothing(client, headers)
        session_id, total = await test_start_builds_a_queue_and_resumes_it(client, headers)
        await test_finish_closes_the_day(client, headers, session_id, total)
        await test_day_also_closes_from_plain_activity(client, headers)
        await test_free_question_bank_needs_no_provider(client, headers, lesson_id)
        await test_mastered_questions_stop_coming_back(client, headers, lesson_id)
        await test_an_unreadable_queue_is_rebuilt(client, headers)
        await test_onboarding_places_the_child(client, headers)

    print("study session flow: all checks passed")


if __name__ == "__main__":
    asyncio.run(run())
