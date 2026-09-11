from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="diverse-manual-import-"))
DB_PATH = TMP_DIR / "test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "diverse-manual-import-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, str(API))

import httpx  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402


EMAIL = "manual-import@example.com"
PASSWORD = "Secret@123"
STUDY_DATE = date(2026, 9, 10)


def transport() -> httpx.ASGITransport:
    return httpx.ASGITransport(app=main.app, raise_app_exceptions=False)


@asynccontextmanager
async def api_client():
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        login = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if login.status_code != 200:
            raise AssertionError(f"login failed: {login.status_code} {login.text}")
        children = await client.get("/api/parent/children")
        child_id = children.json()[0]["id"]
        client.headers["X-Child-ID"] = str(child_id)
        yield client


async def seed_account() -> None:
    main.on_startup()
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        response = await client.post(
            "/api/auth/register",
            json={
                "first_name": "Parent",
                "last_name": "Test",
                "email": EMAIL,
                "cpf": "52998224725",
                "password": PASSWORD,
                "child_name": "Lia",
            },
        )
        if response.status_code != 201:
            raise AssertionError(f"register failed: {response.status_code} {response.text}")
        approve_all_accounts(main)


def subject_payload(subject_id: str, name: str) -> dict:
    question_id = f"question-{subject_id}"
    return {
        "id": subject_id,
        "name": name,
        "topics": [
            {
                "id": question_id,
                "topic": f"O que estudar em {name}?",
                "answer": f"Conteúdo completo de {name}.",
                "done": False,
            }
        ],
        "lessons": [
            {
                "id": f"lesson-{subject_id}",
                "title": "Fundamentos",
                "topic_ids": [question_id],
            }
        ],
    }


class DiverseManualImportRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        asyncio.run(seed_account())

    def test_appends_complete_subject_without_ai_and_rejects_duplicate(self) -> None:
        asyncio.run(self._test_append_and_duplicate())

    async def _test_append_and_duplicate(self) -> None:
        imported = subject_payload("subject-history", "História")
        async with api_client() as client:
            with patch.object(
                main.phrase_generation_service,
                "generate_json_text",
                side_effect=AssertionError("manual import must not call AI"),
            ):
                response = await client.post(
                    f"/api/study/diverse/{STUDY_DATE.isoformat()}/subjects/import",
                    json=imported,
                )
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        self.assertEqual([subject["name"] for subject in saved["custom_subjects"]], ["História"])
        self.assertEqual(saved["custom_subjects"][0]["lessons"][0]["topic_ids"], ["question-subject-history"])

        async with api_client() as client:
            replay = await client.post(
                f"/api/study/diverse/{STUDY_DATE.isoformat()}/subjects/import",
                json=imported,
            )
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(len(replay.json()["custom_subjects"]), 1)

        async with api_client() as client:
            duplicate = await client.post(
                f"/api/study/diverse/{STUDY_DATE.isoformat()}/subjects/import",
                json=subject_payload("subject-other", "história"),
            )
        self.assertEqual(duplicate.status_code, 409, duplicate.text)

    def test_losing_cas_race_does_not_overwrite_saved_subjects(self) -> None:
        asyncio.run(self._test_cas_conflict())

    async def _test_cas_conflict(self) -> None:
        race_date = date(2026, 9, 11)
        async with api_client() as client:
            seeded = await client.post(
                f"/api/study/diverse/{race_date.isoformat()}/subjects/import",
                json=subject_payload("subject-geography", "Geografia"),
            )
            self.assertEqual(seeded.status_code, 200, seeded.text)
            seeded_names = [
                subject["name"]
                for subject in seeded.json()["custom_subjects"]
            ]
            with patch.object(main, "_cas_update_diverse_day", return_value=False):
                response = await client.post(
                    f"/api/study/diverse/{race_date.isoformat()}/subjects/import",
                    json=subject_payload("subject-science", "Ciências"),
                )
            current = await client.get(f"/api/study/diverse/{race_date.isoformat()}")
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(
            [subject["name"] for subject in current.json()["custom_subjects"]],
            seeded_names,
        )

    def test_rejects_incomplete_or_oversized_manual_studies(self) -> None:
        asyncio.run(self._test_manual_contract_validation())

    async def _test_manual_contract_validation(self) -> None:
        empty = subject_payload("subject-empty", "Vazio")
        empty["topics"] = []
        empty["lessons"] = []

        oversized = subject_payload("subject-big", "Grande")
        oversized["topics"] = [
            {
                "id": f"question-{index}",
                "topic": f"Pergunta {index}?",
                "answer": f"Resposta {index}.",
                "done": False,
            }
            for index in range(51)
        ]
        oversized["lessons"] = [
            {
                "id": "lesson-subject-big-1",
                "title": "Parte 1",
                "topic_ids": [topic["id"] for topic in oversized["topics"][:26]],
            },
            {
                "id": "lesson-subject-big-2",
                "title": "Parte 2",
                "topic_ids": [topic["id"] for topic in oversized["topics"][26:]],
            },
        ]

        async with api_client() as client:
            empty_response = await client.post(
                "/api/study/diverse/2026-09-12/subjects/import",
                json=empty,
            )
            oversized_response = await client.post(
                "/api/study/diverse/2026-09-12/subjects/import",
                json=oversized,
            )
        self.assertEqual(empty_response.status_code, 422, empty_response.text)
        self.assertEqual(oversized_response.status_code, 422, oversized_response.text)


if __name__ == "__main__":
    unittest.main()
