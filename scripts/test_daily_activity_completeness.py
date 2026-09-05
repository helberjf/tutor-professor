"""Regression checks for the complete daily activity feed."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-activity-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'activity.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "activity-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "activity@example.com"
os.environ["ACTIVITY_TIMEZONE"] = "America/Sao_Paulo"

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

import httpx  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402
from account_approval_support import enable_all_modules  # noqa: E402


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text}")


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        registered = await client.post(
            "/api/auth/register",
            json={
                "first_name": "Pai",
                "last_name": "Atividade",
                "email": "activity@example.com",
                "cpf": "52998224725",
                "password": "Secret@123",
                "child_name": "Lia",
            },
        )
        assert_status(registered, 201, "register")
        assert_status(
            await client.post("/api/auth/login", json={"email": "activity@example.com", "password": "Secret@123"}),
            200,
            "login",
        )
        enable_all_modules(main)
        child = (await client.get("/api/parent/children")).json()[0]
        headers = {"X-Child-ID": str(child["id"])}

        subject_response = await client.post(
            "/api/coding/subjects",
            headers=headers,
            json={"name": "Python", "description": "", "icon_emoji": "PY"},
        )
        assert_status(subject_response, 201, "coding subject")
        subject = subject_response.json()
        topic_response = await client.post(
            f"/api/coding/subjects/{subject['id']}/topics",
            headers=headers,
            json={"title": "Tipos", "order_index": 0, "generate_ai": False},
        )
        assert_status(topic_response, 201, "coding topic")
        topic = topic_response.json()
        with Session(main.engine) as session:
            coding_question = main.ProgrammingQuestion(
                topic_id=topic["id"],
                subject_id=subject["id"],
                child_id=child["id"],
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

        question_response = await client.post(
            f"/api/coding/questions/{coding_question_id}/attempt",
            headers=headers,
            json={"selected_option": "str"},
        )
        assert_status(question_response, 200, "coding question attempt")

        with Session(main.engine) as session:
            study_question = main.StudyQuestion(
                child_id=child["id"],
                area="english",
                subject_name="Ingles",
                topic_key="saudacoes",
                topic_title="Saudacoes",
                question="Como dizer ola?",
                question_key="ola",
                options=["Hello", "Bye", "Thanks", "Please"],
                correct_option="Hello",
                explanation="Hello significa ola.",
            )
            session.add(study_question)
            session.commit()
            session.refresh(study_question)
            study_question_id = study_question.id

        study_question_response = await client.post(
            f"/api/study/questions/{study_question_id}/attempt",
            headers=headers,
            json={"selected_option": "Hello"},
        )
        assert_status(study_question_response, 200, "study question attempt")

        exam_response = await client.post(
            "/api/exams",
            headers=headers,
            json={"name": "Simulado Python", "code": "PY-1", "question_count": 1, "passing_percent": 70},
        )
        assert_status(exam_response, 201, "exam")
        exam = exam_response.json()
        with Session(main.engine) as session:
            exam_question = main.ExamQuestion(
                exam_id=exam["id"],
                domain="Fundamentos",
                question="Qual tipo representa texto?",
                question_key="exam-texto",
                options=["str", "int", "list", "dict"],
                correct_options=["str"],
                response_type="single",
                explanation="str representa texto.",
            )
            session.add(exam_question)
            session.commit()
            session.refresh(exam_question)
            exam_question_id = exam_question.id

        start_response = await client.post(f"/api/exams/{exam['id']}/attempts", headers=headers)
        assert_status(start_response, 201, "start exam")
        attempt = start_response.json()["attempt"]
        assert_status(
            await client.post(
                f"/api/exams/attempts/{attempt['id']}/answers",
                headers=headers,
                json={"exam_question_id": exam_question_id, "selected_options": ["str"]},
            ),
            204,
            "exam answer",
        )
        assert_status(
            await client.post(f"/api/exams/attempts/{attempt['id']}/finish", headers=headers),
            200,
            "finish exam",
        )
        assert_status(
            await client.post(f"/api/exams/attempts/{attempt['id']}/finish", headers=headers),
            200,
            "repeat finished exam",
        )

        activity_response = await client.get("/api/activity/today", headers=headers)
        assert_status(activity_response, 200, "activity summary")
        summary = activity_response.json()
        for activity_type in ("question", "exam"):
            if summary["activities_by_type"].get(activity_type, 0) < 1:
                raise AssertionError(f"expected {activity_type} activity, got {summary}")
        if summary["activities_by_type"].get("exam", 0) != 1:
            raise AssertionError(f"finished exam should be logged once, got {summary}")
        if summary["total_duration_seconds"] < 0 or summary["average_score"] is None:
            raise AssertionError(f"expected aggregate activity metrics, got {summary}")
        month_response = await client.get("/api/activity/month", headers=headers)
        assert_status(month_response, 200, "monthly activity summary")
        month = month_response.json()
        if len(month) != 30 or month[-1]["activity_date"] != summary["activity_date"]:
            raise AssertionError(f"expected 30 local calendar days ending today, got {month}")

    local_date = main.activity_date_for(datetime(2026, 1, 1, 2, 0))
    if str(local_date) != "2025-12-31":
        raise AssertionError(f"expected Sao Paulo date conversion, got {local_date}")

    print("Daily activity completeness checks passed.")


if __name__ == "__main__":
    asyncio.run(run())
