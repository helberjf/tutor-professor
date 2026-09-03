"""Integration checks for Programming question metrics on the study dashboard."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="question-dashboard-metrics-"))
DB_PATH = TMP_DIR / "test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "question-dashboard-metrics-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402


VALID_CPF = "52998224725"


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


async def register_parent(client: httpx.AsyncClient, email: str, child_name: str) -> tuple[int, dict[str, str]]:
    assert_status(
        await client.post(
            "/api/auth/register",
            json={
                "first_name": "Pai",
                "last_name": "Metricas",
                "email": email,
                "cpf": VALID_CPF,
                "password": "Secret@123",
                "child_name": child_name,
            },
        ),
        201,
        f"register {email}",
    )
    approve_all_accounts(main)
    assert_status(
        await client.post("/api/auth/login", json={"email": email, "password": "Secret@123"}),
        200,
        f"login {email}",
    )
    children_response = await client.get("/api/parent/children")
    assert_status(children_response, 200, f"children {email}")
    child = children_response.json()[0]
    return child["id"], {"X-Child-ID": str(child["id"])}


def seed_questions(child_id: int, subject_id: int, topic_id: int) -> tuple[int, int, int]:
    with Session(main.engine) as session:
        first = main.ProgrammingQuestion(
            child_id=child_id,
            subject_id=subject_id,
            topic_id=topic_id,
            question="Qual opção cria uma role IAM temporária?",
            question_key="iam-role-temporaria",
            options=["AssumeRole", "CreateBucket", "PutObject", "InvalidateCache"],
            correct_option="AssumeRole",
            explanation="AssumeRole emite credenciais temporárias para uma role.",
        )
        second = main.ProgrammingQuestion(
            child_id=child_id,
            subject_id=subject_id,
            topic_id=topic_id,
            question="Qual prática reduz credenciais long-lived?",
            question_key="reduz-long-lived",
            options=["Usar roles", "Salvar chave no git", "Compartilhar root", "Desativar MFA"],
            correct_option="Usar roles",
            explanation="Roles reduzem exposição de chaves permanentes.",
        )
        legacy_bad = main.ProgrammingQuestion(
            child_id=child_id,
            subject_id=subject_id,
            topic_id=topic_id,
            question="Questão antiga sem alternativas completas?",
            question_key="questao-antiga-sem-alternativas",
            options=["A", "B", "C", "D"],
            correct_option="A",
            explanation="Este registro simula a saída antiga da IA.",
        )
        session.add(first)
        session.add(second)
        session.add(legacy_bad)
        session.commit()
        session.refresh(first)
        session.refresh(second)
        session.refresh(legacy_bad)
        return first.id or 0, second.id or 0, legacy_bad.id or 0


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        child_id, child_headers = await register_parent(client, "metrics-parent@example.com", "Lia")

        subject_response = await client.post(
            "/api/coding/subjects",
            headers=child_headers,
            json={"name": "AWS", "description": "Certificação DVA-C02", "icon_emoji": "☁️"},
        )
        assert_status(subject_response, 201, "create subject")
        subject_id = subject_response.json()["id"]

        topic_response = await client.post(
            f"/api/coding/subjects/{subject_id}/topics",
            headers=child_headers,
            json={"title": "IAM", "order_index": 0, "generate_ai": False},
        )
        assert_status(topic_response, 201, "create topic")
        topic_id = topic_response.json()["id"]
        wrong_question_id, correct_question_id, legacy_bad_question_id = seed_questions(child_id, subject_id, topic_id)

        questions_response = await client.get(f"/api/coding/topics/{topic_id}/questions", headers=child_headers)
        assert_status(questions_response, 200, "list topic questions hides invalid legacy options")
        listed_question_ids = [question["id"] for question in questions_response.json()]
        if listed_question_ids != [wrong_question_id, correct_question_id] or legacy_bad_question_id in listed_question_ids:
            raise AssertionError(
                "expected legacy A/B/C/D-only questions to be hidden from practice, "
                f"got {questions_response.text}"
            )

        empty_dashboard_response = await client.get("/api/study/dashboard", headers=child_headers)
        assert_status(empty_dashboard_response, 200, "dashboard before attempts")
        if empty_dashboard_response.json().get("question_metrics") not in ([], None):
            raise AssertionError(f"expected no metrics before attempts, got {empty_dashboard_response.text}")

        wrong_attempt = await client.post(
            f"/api/coding/questions/{wrong_question_id}/attempt",
            headers=child_headers,
            json={"selected_option": "CreateBucket"},
        )
        assert_status(wrong_attempt, 200, "wrong question attempt")
        wrong_payload = wrong_attempt.json()
        if wrong_payload["correct"] is not False or wrong_payload["error_count"] != 1:
            raise AssertionError(f"expected one wrong attempt, got {wrong_payload}")

        correct_attempt = await client.post(
            f"/api/coding/questions/{correct_question_id}/attempt",
            headers=child_headers,
            json={"selected_option": "Usar roles"},
        )
        assert_status(correct_attempt, 200, "correct question attempt")
        correct_payload = correct_attempt.json()
        if correct_payload["correct"] is not True or correct_payload["correct_count"] != 1:
            raise AssertionError(f"expected one correct attempt, got {correct_payload}")

        dashboard_response = await client.get("/api/study/dashboard", headers=child_headers)
        assert_status(dashboard_response, 200, "dashboard after attempts")
        dashboard = dashboard_response.json()
        metrics = dashboard.get("question_metrics")
        if metrics != [
            {
                "subject_id": subject_id,
                "subject_name": "AWS",
                "resolved_count": 2,
                "correct_count": 1,
                "error_count": 1,
                "accuracy_percent": 50,
            }
        ]:
            raise AssertionError(f"expected AWS question metrics, got {dashboard}")

        other_child_response = await client.post("/api/parent/children", json={"name": "Noah", "age_group": "7-9"})
        assert_status(other_child_response, 200, "create second child")
        other_headers = {"X-Child-ID": str(other_child_response.json()["id"])}
        foreign_attempt = await client.post(
            f"/api/coding/questions/{wrong_question_id}/attempt",
            headers=other_headers,
            json={"selected_option": "AssumeRole"},
        )
        assert_status(foreign_attempt, 404, "other child cannot submit this question")

    print("Question dashboard metrics checks passed.")


if __name__ == "__main__":
    asyncio.run(run())
