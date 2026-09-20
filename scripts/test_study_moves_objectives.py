"""Studying has to show up: in the day's log, in the level, and in the objectives.

Four separate complaints share one root, and this suite pins all of them:

* answering a question in "Modo questões" left the level untouched, while a
  review card answered in the same session moved it;
* marking a coding topic as studied wrote nothing anywhere;
* talking to the tutor wrote nothing either;
* the objectives only moved when somebody ticked a box by hand.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-objectives-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'objectives.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "objectives-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "objectives@example.com"
os.environ["ACTIVITY_TIMEZONE"] = "America/Sao_Paulo"

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def make_study_question(child_id: int, key: str) -> int:
    """One answerable question in the language bank."""

    with Session(main.engine) as session:
        question = main.StudyQuestion(
            child_id=child_id,
            area="english",
            subject_name="Ingles",
            topic_key=key,
            topic_title=f"Topico {key}",
            question=f"Como dizer {key}?",
            question_key=key,
            options=["Hello", "Goodbye", "Please", "Thanks"],
            correct_option="Hello",
            explanation="Hello significa ola.",
        )
        session.add(question)
        session.commit()
        session.refresh(question)
        return question.id or 0


async def objective_state(client: httpx.AsyncClient, headers: dict, objective_id: int) -> dict:
    listed = (await client.get("/api/objectives", headers=headers)).json()
    return next(objective for objective in listed if objective["id"] == objective_id)


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Objetivo",
                    "email": "objectives@example.com",
                    "cpf": "52998224725",
                    "password": "Secret@123",
                    "child_name": "Ana",
                },
            ),
            201,
            "register",
        )
        assert_status(
            await client.post(
                "/api/auth/login",
                json={"email": "objectives@example.com", "password": "Secret@123"},
            ),
            200,
            "login",
        )
        child = (await client.get("/api/parent/children")).json()[0]
        child_id = child["id"]
        headers = {"X-Child-ID": str(child_id)}

        # ── The level counts every screen a question can be answered on ───────
        baseline = (await client.get("/api/child/level", headers=headers)).json()
        require(
            baseline["questions_answered"] == 0,
            f"a new profile should start with no answers, got {baseline}",
        )

        for index in range(3):
            question_id = make_study_question(child_id, f"q{index}")
            assert_status(
                await client.post(
                    f"/api/study/questions/{question_id}/attempt",
                    headers=headers,
                    json={"selected_option": "Hello"},
                ),
                200,
                "study question attempt",
            )

        after_language = (await client.get("/api/child/level", headers=headers)).json()
        require(
            after_language["questions_answered"] == 3,
            f"Modo questões must count towards the level, got {after_language}",
        )

        assert_status(
            await client.put("/api/account/modules", json={"modules": {"coding": True}}),
            200,
            "enable coding",
        )
        subject = (
            await client.post(
                "/api/coding/subjects",
                headers=headers,
                json={"name": "Python", "description": "", "icon_emoji": "PY"},
            )
        ).json()
        topic = (
            await client.post(
                f"/api/coding/subjects/{subject['id']}/topics",
                headers=headers,
                json={"title": "Tipos", "order_index": 0, "generate_ai": False},
            )
        ).json()
        with Session(main.engine) as session:
            coding_question = main.ProgrammingQuestion(
                topic_id=topic["id"],
                subject_id=subject["id"],
                child_id=child_id,
                question="Qual tipo representa texto?",
                question_key="texto",
                options=["str", "int", "list", "dict"],
                correct_option="str",
                explanation="str representa texto.",
            )
            session.add(coding_question)
            session.commit()
            session.refresh(coding_question)
            coding_question_id = coding_question.id
        assert_status(
            await client.post(
                f"/api/coding/questions/{coding_question_id}/attempt",
                headers=headers,
                json={"selected_option": "str"},
            ),
            200,
            "coding question attempt",
        )
        after_coding = (await client.get("/api/child/level", headers=headers)).json()
        require(
            after_coding["questions_answered"] == 4,
            f"programming questions must count towards the level too, got {after_coding}",
        )

        # ── Marking a topic as studied is study, and leaves a trace ───────────
        assert_status(
            await client.put(
                f"/api/coding/topics/{topic['id']}",
                headers=headers,
                json={"status": "studied"},
            ),
            200,
            "mark topic studied",
        )
        today_feed = (await client.get("/api/activity/today", headers=headers)).json()
        topic_titles = [
            activity["activity_title"]
            for activity in today_feed["activities"]
            if activity["activity_type"] == "coding"
        ]
        require(
            any("Tópico estudado: Tipos" == title for title in topic_titles),
            f"marking a topic as studied should appear in the day's log, got {topic_titles}",
        )

        # Re-saving the same status is not a second study event.
        before_repeat = today_feed["total_activities"]
        assert_status(
            await client.put(
                f"/api/coding/topics/{topic['id']}",
                headers=headers,
                json={"status": "studied", "notes": "reler depois"},
            ),
            200,
            "re-save the same status",
        )
        repeated_feed = (await client.get("/api/activity/today", headers=headers)).json()
        require(
            repeated_feed["total_activities"] == before_repeat,
            f"an unchanged status must not log twice, got {repeated_feed['total_activities']}",
        )

        # ── Talking to the tutor counts once a day, not once per message ──────
        for _ in range(3):
            assert_status(
                await client.post("/api/chat", headers=headers, json={"message": "Hello!"}),
                200,
                "chat with the tutor",
            )
        chat_feed = (await client.get("/api/activity/today", headers=headers)).json()
        require(
            chat_feed["activities_by_type"].get("chat") == 1,
            f"three messages are one conversation, got {chat_feed['activities_by_type']}",
        )

        # ── The objective advances by studying, one item per area per day ─────
        objective = (
            await client.post(
                "/api/objectives",
                headers=headers,
                json={
                    "title": "Passar na prova",
                    "items": [
                        {"title": "Estudar licoes", "area": "language"},
                        {"title": "Treinar questoes", "area": "language"},
                        {"title": "Revisar Python", "area": "coding"},
                        {"title": "Ler um livro de papel", "area": "free"},
                    ],
                },
            )
        ).json()
        require(
            objective["progress_percent"] == 0,
            f"a fresh objective starts at zero, got {objective}",
        )

        question_id = make_study_question(child_id, "depois-do-objetivo")
        assert_status(
            await client.post(
                f"/api/study/questions/{question_id}/attempt",
                headers=headers,
                json={"selected_option": "Hello"},
            ),
            200,
            "language question after the objective exists",
        )
        state = await objective_state(client, headers, objective["id"])
        done = [item for item in state["items"] if item["done"]]
        require(
            [item["title"] for item in done] == ["Estudar licoes"],
            f"studying should close the first open item of that area, got {done}",
        )
        require(
            done[0]["auto_completed"] is True,
            f"an item closed by studying must say so, got {done[0]}",
        )

        # A second question the same day is the same study block.
        question_id = make_study_question(child_id, "mesmo-dia")
        assert_status(
            await client.post(
                f"/api/study/questions/{question_id}/attempt",
                headers=headers,
                json={"selected_option": "Hello"},
            ),
            200,
            "second language question on the same day",
        )
        state = await objective_state(client, headers, objective["id"])
        require(
            sum(1 for item in state["items"] if item["done"]) == 1,
            f"one study block must not close two items, got {state['items']}",
        )

        # A different area on the same day is a different block, and does count.
        with Session(main.engine) as session:
            another_question = main.ProgrammingQuestion(
                topic_id=topic["id"],
                subject_id=subject["id"],
                child_id=child_id,
                question="Qual tipo guarda pares?",
                question_key="pares",
                options=["dict", "int", "list", "str"],
                correct_option="dict",
                explanation="dict guarda pares.",
            )
            session.add(another_question)
            session.commit()
            session.refresh(another_question)
            another_question_id = another_question.id
        assert_status(
            await client.post(
                f"/api/coding/questions/{another_question_id}/attempt",
                headers=headers,
                json={"selected_option": "dict"},
            ),
            200,
            "coding question on the same day",
        )
        state = await objective_state(client, headers, objective["id"])
        done_titles = sorted(item["title"] for item in state["items"] if item["done"])
        require(
            done_titles == ["Estudar licoes", "Revisar Python"],
            f"each area gets its own daily credit, got {done_titles}",
        )

        # Tomorrow, the next language item is owed again.
        real_today = main.activity_today
        main.activity_today = lambda: real_today() + timedelta(days=1)  # type: ignore[assignment]
        try:
            question_id = make_study_question(child_id, "amanha")
            assert_status(
                await client.post(
                    f"/api/study/questions/{question_id}/attempt",
                    headers=headers,
                    json={"selected_option": "Hello"},
                ),
                200,
                "language question the next day",
            )
        finally:
            main.activity_today = real_today  # type: ignore[assignment]
        state = await objective_state(client, headers, objective["id"])
        done_titles = sorted(item["title"] for item in state["items"] if item["done"])
        require(
            done_titles == ["Estudar licoes", "Revisar Python", "Treinar questoes"],
            f"a new day owes the next item of the area, got {done_titles}",
        )
        require(
            state["progress_percent"] == 75,
            f"three of four items is 75%, got {state['progress_percent']}",
        )

        # "Livre" has no event that could stand for it, so it stays manual.
        free_item = next(item for item in state["items"] if item["area"] == "free")
        require(not free_item["done"], f"a free item must never close itself, got {free_item}")

        # Unchecking by hand hands the item back to the learner.
        auto_item = next(item for item in state["items"] if item["title"] == "Estudar licoes")
        assert_status(
            await client.put(
                f"/api/objectives/items/{auto_item['id']}",
                headers=headers,
                json={"done": False},
            ),
            200,
            "uncheck an auto-completed item",
        )
        state = await objective_state(client, headers, objective["id"])
        reopened = next(item for item in state["items"] if item["id"] == auto_item["id"])
        require(
            not reopened["done"] and reopened["auto_completed"] is False,
            f"unchecking must clear the automatic badge, got {reopened}",
        )

        # ── The 30-day window can be walked back through the history ──────────
        today = main.activity_today()
        old_day = today - timedelta(days=45)
        with Session(main.engine) as session:
            session.add(
                main.DailyActivity(
                    child_id=child_id,
                    activity_date=old_day,
                    activity_type="lesson",
                    activity_title="Licao antiga",
                    created_at=datetime.utcnow(),
                )
            )
            session.add(
                main.StudyDay(
                    child_id=child_id,
                    study_date=old_day,
                    pomodoro_count=4,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
            )
            session.commit()

        current_window = (await client.get("/api/activity/month", headers=headers)).json()
        require(
            all(day["activity_date"] != old_day.isoformat() for day in current_window),
            "a day 45 days back must not be inside the window that ends today",
        )

        walked_back = (
            await client.get(
                f"/api/activity/month?end_date={(old_day + timedelta(days=5)).isoformat()}",
                headers=headers,
            )
        ).json()
        old_entry = next(
            (day for day in walked_back if day["activity_date"] == old_day.isoformat()),
            None,
        )
        require(old_entry is not None, "walking the window back must reach the older day")
        require(
            old_entry["total_activities"] == 1,
            f"the older day should report its activity, got {old_entry}",
        )
        require(
            old_entry["pomodoro_count"] == 4,
            f"older calendars need their pomodoros too, got {old_entry}",
        )

        future_window = (
            await client.get(
                f"/api/activity/month?end_date={(today + timedelta(days=10)).isoformat()}",
                headers=headers,
            )
        ).json()
        require(
            future_window[-1]["activity_date"] == today.isoformat(),
            f"a future end date is clamped to today, got {future_window[-1]}",
        )

        # ── The streak counts only what the account can actually see ──────────
        coding_only_day = today - timedelta(days=1)
        with Session(main.engine) as session:
            session.add(
                main.DailyActivity(
                    child_id=child_id,
                    activity_date=coding_only_day,
                    activity_type="coding",
                    activity_title="So programacao",
                    created_at=datetime.utcnow(),
                )
            )
            session.commit()

        with_coding = (await client.get("/api/study/dashboard", headers=headers)).json()
        assert_status(
            await client.put("/api/account/modules", json={"modules": {"coding": False}}),
            200,
            "disable coding",
        )
        without_coding = (await client.get("/api/study/dashboard", headers=headers)).json()
        require(
            with_coding["study_streak_count"] > without_coding["study_streak_count"],
            "a day held up only by hidden coding activity must not extend the streak: "
            f"{with_coding['study_streak_count']} vs {without_coding['study_streak_count']}",
        )

        # The same rule has to hold for the day counter the dashboard draws.
        hidden_day = (
            await client.get(f"/api/study/day/{coding_only_day.isoformat()}", headers=headers)
        ).json()
        require(
            hidden_day["activity_count"] == 0 and not hidden_day["is_study_day"],
            f"a hidden day must read as empty, not as studied, got {hidden_day}",
        )

    print("Study-moves-objectives checks passed.")


if __name__ == "__main__":
    asyncio.run(run())
