"""The "Controle de estudos": what was studied, filed by discipline and subject.

Pinned here:

* a written entry needs a discipline and either text or time, and it reaches the
  activity log, so the day closes and the time counts;
* the sheet comes from the AI, which writes the title and the subject only where
  the learner left them blank — a subject the learner picked is never replaced,
  and a new subject name never creates a subject in the curriculum;
* topics marked as studied and finished lessons arrive on their own, and a note
  typed in the old "O que estudou" field still lands in the log;
* one account never reaches another's entries.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
WEB_API = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
TMP_DIR = Path(tempfile.mkdtemp(prefix="study-log-api-"))
DB_PATH = TMP_DIR / "test.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "study-log-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
# The suite logs in once per case and asks for many sheets.
os.environ["AUTH_RATE_LIMIT"] = "500"
os.environ["AI_RATE_LIMIT"] = "500"

sys.path.insert(0, str(API))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import (  # noqa: E402
    ChildProfile,
    DailyActivity,
    Lesson,
    LessonItem,
    ProgrammingSubject,
    StudyLogEntry,
    User,
)
from schemas.schemas import StudyLogEntryCreateSchema, StudyLogEntryUpdateSchema  # noqa: E402
from services import account_data, study_log_service  # noqa: E402


PASSWORD = "Secret@123"
PRIMARY = ("log-primary@example.com", "52998224725", "Lia")
SECONDARY = ("log-secondary@example.com", "39053344705", "Bia")
LEAVING = ("log-leaving@example.com", "11144477735", "Rui")

_seeded = False


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text}")


def transport() -> httpx.ASGITransport:
    return httpx.ASGITransport(app=main.app, raise_app_exceptions=False)


@asynccontextmanager
async def api_client(email: str):
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert_status(login, 200, f"login {email}")
        yield client


async def seed_accounts() -> None:
    global _seeded
    if _seeded:
        return
    main.on_startup()
    async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as client:
        for email, cpf, child_name in (PRIMARY, SECONDARY, LEAVING):
            response = await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Parent",
                    "last_name": "Test",
                    "email": email,
                    "cpf": cpf,
                    "password": PASSWORD,
                    "child_name": child_name,
                },
            )
            assert_status(response, 201, f"register {email}")
        approve_all_accounts(main)
        enable_all_modules(main)
        login = await client.post("/api/auth/login", json={"email": PRIMARY[0], "password": PASSWORD})
        assert_status(login, 200, "login primary for AI config")
        settings = await client.put(
            "/api/ai/settings",
            json={"provider": "gemini", "api_key": "fake-test-key", "model": "gemini-2.5-flash"},
        )
        assert_status(settings, 200, "save fake AI config")
    _seeded = True


def run(coroutine):
    asyncio.run(seed_accounts())
    return asyncio.run(coroutine)


def sheet_json(*, title: str = "Título da IA", subject: str | None = None, summary: str | None = None) -> str:
    return json.dumps(
        {
            "title": title,
            "subject": subject or "",
            "summary": summary
            or "# Título repetido\n## Em uma frase\nA ideia.\n## Conceitos-chave\n- Um conceito.",
        }
    )


def study_log_activity(entry_id: int) -> DailyActivity | None:
    with Session(main.engine) as session:
        return session.exec(
            select(DailyActivity).where(
                DailyActivity.activity_type == "study_log",
                DailyActivity.activity_id == entry_id,
            )
        ).first()


def entries_from(source: str, source_id: int) -> list[StudyLogEntry]:
    with Session(main.engine) as session:
        return list(
            session.exec(
                select(StudyLogEntry).where(StudyLogEntry.source == source, StudyLogEntry.source_id == source_id)
            ).all()
        )


def seed_lesson(title: str) -> int:
    with Session(main.engine) as session:
        lesson = Lesson(
            title=title,
            theme="Saudações",
            objective="Cumprimentar alguém.",
            content={"daily_goal": "3 frases"},
            child_id=None,
            level=None,
            target_language="English",
        )
        session.add(lesson)
        session.commit()
        session.refresh(lesson)
        session.add(
            LessonItem(
                lesson_id=lesson.id,
                word_en="Good morning",
                word_pt="Bom dia",
                example_sentence_en="Good morning, teacher!",
                example_sentence_pt="Bom dia, professora!",
            )
        )
        session.commit()
        return lesson.id or 0


class SheetPromptTests(unittest.TestCase):
    def test_names_fold_case_accents_and_the_app_language(self) -> None:
        self.assertEqual(study_log_service.name_key("Direito  Penal"), study_log_service.name_key("direito penal"))
        self.assertEqual(study_log_service.name_key("DVA-C02"), study_log_service.name_key("dva c02"))
        self.assertEqual(study_log_service.name_key("Programming"), study_log_service.name_key("Programação"))
        self.assertEqual(study_log_service.name_key("French"), study_log_service.name_key("francês"))

    def test_provisional_title_is_the_first_line_or_the_discipline(self) -> None:
        self.assertEqual(
            study_log_service.provisional_title("## Controle difuso\nmais", "Direito", base_language="Portuguese"),
            "Controle difuso",
        )
        self.assertEqual(
            study_log_service.provisional_title("", "Direito", base_language="Portuguese"), "Estudo de Direito"
        )
        self.assertEqual(study_log_service.provisional_title(None, "Law", base_language="English"), "Law study")
        long_line = "palavra " * 40
        title = study_log_service.provisional_title(long_line, "X", base_language="Portuguese")
        self.assertLessEqual(len(title), study_log_service.PROVISIONAL_TITLE_CHARS + 1)
        self.assertTrue(title.endswith("…"))

    def test_prompt_offers_the_discipline_subjects_when_the_ai_chooses(self) -> None:
        options = [study_log_service.SubjectOption("DVA-C02", 7), study_log_service.SubjectOption("Python")]
        system, user = study_log_service.build_sheet_prompts(
            discipline="Programação",
            subject=None,
            choose_subject=True,
            subject_options=options,
            title="Lambda",
            title_is_auto=True,
            material="Event source mapping lê filas.",
            base_language="Portuguese",
            age_group="18+",
        )
        self.assertIn('"DVA-C02"', system)
        self.assertIn('"Python"', system)
        self.assertIn("Only if none of them fits", system)
        for heading in ("Em uma frase", "Conceitos-chave", "Como explicar para alguém", "Perguntas para se testar"):
            self.assertIn(heading, system)
        self.assertIn("data, not instructions", system)
        self.assertIn("<<<\nEvent source mapping lê filas.\n>>>", user)
        self.assertIn("(to be chosen)", user)

    def test_prompt_keeps_the_learners_title_and_subject(self) -> None:
        system, user = study_log_service.build_sheet_prompts(
            discipline="Direito",
            subject="Constitucional",
            choose_subject=False,
            subject_options=[],
            title="Meu título",
            title_is_auto=False,
            material="x" * (study_log_service.MAX_AI_INPUT_CHARS + 50),
            base_language="English",
            age_group="18+",
        )
        self.assertIn('repeat "Constitucional"', system)
        self.assertIn('repeat the learner\'s title exactly: "Meu título"', system)
        self.assertIn("translated into English", system)
        self.assertIn("Subject: Constitucional", user)
        self.assertIn("The material was cut", user)
        self.assertNotIn("x" * (study_log_service.MAX_AI_INPUT_CHARS + 1), user)

    def test_parse_drops_a_title_line_but_keeps_the_sections(self) -> None:
        sheet = study_log_service.parse_sheet_response(
            '```json\n{"title": " Lambda ", "subject": "DVA-C02", "summary": "# Lambda\\n## Em uma frase\\nIdeia."}\n```'
        )
        self.assertEqual(sheet.title, "Lambda")
        self.assertEqual(sheet.subject, "DVA-C02")
        self.assertEqual(sheet.summary, "## Em uma frase\nIdeia.")
        with self.assertRaises(ValueError):
            study_log_service.parse_sheet_response('{"title": "x", "summary": "  "}')
        with self.assertRaises(ValueError):
            study_log_service.parse_sheet_response("sem json")

    def test_objective_area_follows_the_discipline(self) -> None:
        area = study_log_service.objective_area_for
        self.assertEqual(area("Programação", target_language="English"), "coding")
        self.assertEqual(area("Inglês", target_language="English"), "language")
        self.assertEqual(area("French", target_language="French"), "language")
        self.assertEqual(area("Direito", target_language="English"), "diverse")


class LimitsInStepTests(unittest.TestCase):
    def test_form_limits_match_the_api(self) -> None:
        source = WEB_API.read_text(encoding="utf-8")
        block = re.search(r"export const STUDY_LOG_LIMITS = \{(.*?)\}", source, re.S)
        self.assertIsNotNone(block, "STUDY_LOG_LIMITS must exist in apps/web/src/lib/api.ts")
        limits = {
            key: int(value.replace("_", ""))
            for key, value in re.findall(r"(\w+):\s*([\d_]+)", block.group(1))
        }

        def max_length(schema, field: str) -> int:
            for rule in schema.model_fields[field].metadata:
                if hasattr(rule, "max_length"):
                    return rule.max_length
                if hasattr(rule, "le"):
                    return rule.le
            raise AssertionError(f"{schema.__name__}.{field} has no upper limit")

        self.assertEqual(limits["content"], max_length(StudyLogEntryCreateSchema, "content"))
        self.assertEqual(limits["content"], study_log_service.MAX_CONTENT_CHARS)
        self.assertEqual(limits["title"], max_length(StudyLogEntryCreateSchema, "title"))
        self.assertEqual(limits["discipline"], max_length(StudyLogEntryCreateSchema, "discipline"))
        self.assertEqual(limits["subject"], max_length(StudyLogEntryCreateSchema, "subject"))
        self.assertEqual(limits["summary"], max_length(StudyLogEntryUpdateSchema, "summary"))
        self.assertEqual(limits["summary"], study_log_service.MAX_SUMMARY_CHARS)
        self.assertEqual(limits["minutes"], max_length(StudyLogEntryCreateSchema, "duration_minutes"))


class WrittenEntryTests(unittest.TestCase):
    def test_an_entry_with_text_logs_its_time_and_closes_the_day(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                created = await client.post(
                    "/api/study-log",
                    json={
                        "discipline": "Direito",
                        "content": "Controle de constitucionalidade\nDifuso e concentrado.",
                        "duration_minutes": 40,
                    },
                )
                assert_status(created, 201, "create entry")
                entry = created.json()
                self.assertEqual(entry["title"], "Controle de constitucionalidade")
                self.assertTrue(entry["title_is_auto"])
                self.assertEqual(entry["source"], "manual")
                self.assertIsNone(entry["subject"])
                self.assertTrue(entry["can_summarize"])

                listing = await client.get("/api/study-log")
                assert_status(listing, 200, "list entries")
                row = next(item for item in listing.json() if item["id"] == entry["id"])
                self.assertTrue(row["has_content"])
                self.assertFalse(row["has_summary"])
                self.assertNotIn("content", row)

                activity = study_log_activity(entry["id"])
                self.assertIsNotNone(activity, "a written entry is a study event")
                self.assertEqual(activity.duration_seconds, 40 * 60)
                self.assertEqual(activity.result_details["area"], "diverse")

                dashboard = await client.get("/api/study/dashboard")
                self.assertTrue(dashboard.json()["today"]["closed_by_activity"])
                today = await client.get("/api/activity/today")
                self.assertIn(
                    "Registro: Controle de constitucionalidade",
                    [item["activity_title"] for item in today.json()["activities"]],
                )

        run(scenario())

    def test_time_alone_is_an_entry_but_nothing_at_all_is_not(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                timed = await client.post("/api/study-log", json={"discipline": "Leitura", "duration_minutes": 30})
                assert_status(timed, 201, "time-only entry")
                self.assertEqual(timed.json()["title"], "Estudo de Leitura")
                self.assertFalse(timed.json()["can_summarize"])

                empty = await client.post("/api/study-log", json={"discipline": "Leitura"})
                assert_status(empty, 422, "neither text nor time")
                no_discipline = await client.post("/api/study-log", json={"content": "algo"})
                assert_status(no_discipline, 422, "discipline is required")
                blank_discipline = await client.post("/api/study-log", json={"discipline": "   ", "content": "algo"})
                assert_status(blank_discipline, 422, "a blank discipline is no discipline")
                future = (main.activity_today() + timedelta(days=1)).isoformat()
                ahead = await client.post(
                    "/api/study-log", json={"discipline": "Leitura", "duration_minutes": 5, "studied_on": future}
                )
                assert_status(ahead, 422, "no studying tomorrow")

        run(scenario())

    def test_the_discipline_reuses_the_spelling_already_in_use(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                first = await client.post("/api/study-log", json={"discipline": "Física", "duration_minutes": 10})
                second = await client.post("/api/study-log", json={"discipline": "fisica ", "duration_minutes": 10})
                self.assertEqual(first.json()["discipline"], "Física")
                self.assertEqual(second.json()["discipline"], "Física")
                programming = await client.post(
                    "/api/study-log", json={"discipline": "programação", "duration_minutes": 10}
                )
                self.assertEqual(programming.json()["discipline"], "Programação")

        run(scenario())

    def test_editing_time_and_date_moves_the_activity_and_delete_removes_it(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                created = await client.post(
                    "/api/study-log", json={"discipline": "Química", "content": "Ligações", "duration_minutes": 20}
                )
                entry_id = created.json()["id"]
                yesterday = main.activity_today() - timedelta(days=1)
                edited = await client.put(
                    f"/api/study-log/{entry_id}", json={"duration_minutes": 50, "studied_on": yesterday.isoformat()}
                )
                assert_status(edited, 200, "edit time and date")
                activity = study_log_activity(entry_id)
                self.assertEqual(activity.duration_seconds, 50 * 60)
                self.assertEqual(activity.activity_date, yesterday)

                cleared = await client.put(f"/api/study-log/{entry_id}", json={"duration_minutes": 0})
                assert_status(cleared, 200, "clear the time, the text stays")
                self.assertIsNone(cleared.json()["duration_minutes"])
                self.assertIsNone(study_log_activity(entry_id).duration_seconds)
                emptied = await client.put(f"/api/study-log/{entry_id}", json={"content": ""})
                assert_status(emptied, 422, "an entry keeps text or time")

                deleted = await client.delete(f"/api/study-log/{entry_id}")
                assert_status(deleted, 204, "delete entry")
                gone = await client.get(f"/api/study-log/{entry_id}")
                assert_status(gone, 404, "deleted entry")
                self.assertIsNone(study_log_activity(entry_id))

        run(scenario())


class SheetTests(unittest.TestCase):
    def test_the_ai_fills_what_the_learner_left_blank_and_nothing_else(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                subject = await client.post("/api/coding/subjects", json={"name": "DVA-C02"})
                assert_status(subject, 201, "create DVA-C02")
                subject_id = subject.json()["id"]
                created = await client.post(
                    "/api/study-log",
                    json={"discipline": "Programação", "content": "Lambda lê a fila com event source mapping."},
                )
                entry_id = created.json()["id"]

                with patch.object(
                    main.phrase_generation_service,
                    "generate_json_text",
                    return_value=sheet_json(title="Lambda: event source mapping", subject="dva-c02"),
                ) as generate:
                    sheet = await client.post(f"/api/study-log/{entry_id}/summary")
                    assert_status(sheet, 200, "write the sheet")
                    self.assertIn('"DVA-C02"', generate.call_args.kwargs["system_text"])
                    body = sheet.json()
                    self.assertEqual(body["title"], "Lambda: event source mapping")
                    self.assertEqual(body["subject"], "DVA-C02")
                    self.assertEqual(body["subject_id"], subject_id)
                    self.assertTrue(body["subject_is_auto"])
                    self.assertTrue(body["summary"].startswith("## Em uma frase"))
                    self.assertTrue(body["has_summary"])

                    again = await client.post(f"/api/study-log/{entry_id}/summary")
                    assert_status(again, 200, "a stored sheet is reused")
                    self.assertEqual(generate.call_count, 1)

                picked = await client.put(
                    f"/api/study-log/{entry_id}", json={"subject": "AWS Lambda", "title": "Meu título"}
                )
                assert_status(picked, 200, "learner picks subject and title")
                self.assertFalse(picked.json()["subject_is_auto"])
                self.assertIsNone(picked.json()["subject_id"])
                with patch.object(
                    main.phrase_generation_service,
                    "generate_json_text",
                    return_value=sheet_json(title="Outro", subject="DVA-C02"),
                ):
                    redone = await client.post(f"/api/study-log/{entry_id}/summary?regenerate=true")
                self.assertEqual(redone.json()["subject"], "AWS Lambda", "the learner's subject stays")
                self.assertEqual(redone.json()["title"], "Meu título", "the learner's title stays")

                handed_back = await client.put(f"/api/study-log/{entry_id}", json={"subject": ""})
                self.assertIsNone(handed_back.json()["subject"])
                with patch.object(
                    main.phrase_generation_service,
                    "generate_json_text",
                    return_value=sheet_json(subject="Kubernetes"),
                ):
                    renamed = await client.post(f"/api/study-log/{entry_id}/summary?regenerate=true")
                self.assertEqual(renamed.json()["subject"], "Kubernetes")
                self.assertIsNone(renamed.json()["subject_id"])
                with Session(main.engine) as session:
                    names = session.exec(select(ProgrammingSubject.name)).all()
                self.assertNotIn("Kubernetes", names, "a new subject name stays in the log")

                edited_sheet = await client.put(f"/api/study-log/{entry_id}", json={"summary": "## Minha ficha"})
                self.assertEqual(edited_sheet.json()["summary"], "## Minha ficha")

        run(scenario())

    def test_a_typed_subject_links_to_the_curriculum_one(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                discipline = await client.post("/api/general/disciplines", json={"name": "Direito Civil"})
                assert_status(discipline, 201, "create discipline")
                in_law = f"?discipline_id={discipline.json()['id']}"
                contracts = await client.post(f"/api/general/subjects{in_law}", json={"name": "Contratos"})
                assert_status(contracts, 201, "create subject")
                created = await client.post(
                    "/api/study-log",
                    json={"discipline": "direito civil", "subject": "contratos", "duration_minutes": 25},
                )
                body = created.json()
                self.assertEqual(body["discipline"], "Direito Civil")
                self.assertEqual(body["subject"], "Contratos")
                self.assertEqual(body["subject_id"], contracts.json()["id"])

                options = await client.get("/api/study-log/options")
                assert_status(options, 200, "form options")
                by_name = {item["name"]: item for item in options.json()["disciplines"]}
                self.assertIn("Contratos", [s["name"] for s in by_name["Direito Civil"]["subjects"]])
                self.assertEqual(by_name["Direito Civil"]["kind"], "discipline")
                self.assertEqual(by_name["Programação"]["kind"], "programming")
                self.assertEqual(by_name["Inglês"]["kind"], "language")
                self.assertTrue(options.json()["ai_available"])

        run(scenario())

    def test_no_sheet_without_a_key_or_without_material(self) -> None:
        async def scenario() -> None:
            async with api_client(SECONDARY[0]) as client:
                created = await client.post("/api/study-log", json={"discipline": "História", "content": "Revolução"})
                refused = await client.post(f"/api/study-log/{created.json()['id']}/summary")
                assert_status(refused, 422, "no AI key")
                self.assertIn("Configuração de IA", refused.json()["detail"])
                options = await client.get("/api/study-log/options")
                self.assertFalse(options.json()["ai_available"])
            async with api_client(PRIMARY[0]) as client:
                timed = await client.post("/api/study-log", json={"discipline": "História", "duration_minutes": 15})
                nothing = await client.post(f"/api/study-log/{timed.json()['id']}/summary")
                assert_status(nothing, 422, "no material")

        run(scenario())


class ArrivingOnTheirOwnTests(unittest.TestCase):
    def test_a_topic_follows_its_status_and_title(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                subject = await client.post("/api/coding/subjects", json={"name": "AWS Developer"})
                subject_id = subject.json()["id"]
                topic = await client.post(
                    f"/api/coding/subjects/{subject_id}/topics",
                    json={"title": "Lambda: Event Source Mapping", "generate_ai": False},
                )
                topic_id = topic.json()["id"]
                await client.put(
                    f"/api/coding/topics/{topic_id}",
                    json={
                        "ai_content": {
                            "sections": [{"title": "Filas", "body": "Lambda lê SQS.", "code_example": ""}],
                            "quiz": [],
                            "flashcards": [],
                        }
                    },
                )
                self.assertEqual(entries_from("topic", topic_id), [], "not studied yet")

                studied = await client.put(f"/api/coding/topics/{topic_id}", json={"status": "studied"})
                assert_status(studied, 200, "mark studied")
                [entry] = entries_from("topic", topic_id)
                self.assertEqual(entry.discipline, "Programação")
                self.assertEqual(entry.subject, "AWS Developer")
                self.assertEqual(entry.subject_id, subject_id)
                self.assertEqual(entry.title, "Lambda: Event Source Mapping")
                self.assertIsNone(study_log_activity(entry.id or 0), "the topic's own event already counts")

                await client.put(f"/api/coding/topics/{topic_id}", json={"status": "mastered"})
                await client.put(f"/api/coding/topics/{topic_id}", json={"title": "Lambda e SQS"})
                [entry] = entries_from("topic", topic_id)
                self.assertEqual(entry.title, "Lambda e SQS")

                detail = await client.get(f"/api/study-log/{entry.id}")
                body = detail.json()
                self.assertIn("tab=coding", body["open_href"])
                self.assertIn(f"topic_id={topic_id}", body["open_href"])
                self.assertTrue(body["can_summarize"], "the topic's lesson is the material")

                timed = await client.put(f"/api/study-log/{entry.id}", json={"duration_minutes": 35})
                assert_status(timed, 200, "add time to a topic entry")
                self.assertEqual(study_log_activity(entry.id or 0).duration_seconds, 35 * 60)

                await client.put(f"/api/coding/topics/{topic_id}", json={"status": "not_started"})
                self.assertEqual(entries_from("topic", topic_id), [], "setting it back was a correction")
                self.assertIsNone(study_log_activity(entry.id or 0))

        run(scenario())

    def test_a_general_topic_goes_under_its_discipline(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                discipline = await client.post("/api/general/disciplines", json={"name": "Direito Penal"})
                in_penal = f"?discipline_id={discipline.json()['id']}"
                subject = await client.post(f"/api/general/subjects{in_penal}", json={"name": "Parte Geral"})
                topic = await client.post(
                    f"/api/general/subjects/{subject.json()['id']}/topics{in_penal}",
                    json={"title": "Tipicidade", "generate_ai": False},
                )
                assert_status(topic, 201, "create general topic")
                topic_id = topic.json()["id"]
                marked = await client.put(f"/api/general/topics/{topic_id}{in_penal}", json={"status": "studied"})
                assert_status(marked, 200, "mark general topic studied")
                [entry] = entries_from("topic", topic_id)
                self.assertEqual(entry.discipline, "Direito Penal")
                self.assertEqual(entry.subject, "Parte Geral")
                detail = await client.get(f"/api/study-log/{entry.id}")
                self.assertIn("tab=diverse", detail.json()["open_href"])
                self.assertIn(f"discipline_id={discipline.json()['id']}", detail.json()["open_href"])

        run(scenario())

    def test_a_finished_lesson_arrives_once(self) -> None:
        async def scenario() -> None:
            lesson_id = seed_lesson("Greetings")
            async with api_client(PRIMARY[0]) as client:
                for attempt in range(2):
                    done = await client.post(f"/api/lesson/complete?lesson_id={lesson_id}")
                    assert_status(done, 200, f"complete lesson {attempt}")
                [entry] = entries_from("lesson", lesson_id)
                self.assertEqual(entry.discipline, "Inglês")
                self.assertEqual(entry.subject, "Saudações")
                self.assertEqual(entry.title, "Greetings")
                detail = await client.get(f"/api/study-log/{entry.id}")
                self.assertEqual(detail.json()["open_href"], f"/lesson?lessonId={lesson_id}")
                self.assertTrue(detail.json()["can_summarize"])

                with patch.object(
                    main.phrase_generation_service, "generate_json_text", return_value=sheet_json()
                ) as generate:
                    sheet = await client.post(f"/api/study-log/{entry.id}/summary")
                assert_status(sheet, 200, "sheet from the lesson phrases")
                self.assertIn("Good morning = Bom dia", generate.call_args.kwargs["prompt"])

        run(scenario())

    def test_the_old_note_field_still_lands_in_the_log(self) -> None:
        async def scenario() -> None:
            async with api_client(SECONDARY[0]) as client:
                day = main.activity_today().isoformat()
                saved = await client.put(
                    f"/api/study/day/{day}", json={"studied_text": "Revisei verbos\nfiz exercícios"}
                )
                assert_status(saved, 200, "old client saves a note")
                day_id = saved.json()["id"]
                [entry] = entries_from("day_note", day_id)
                self.assertEqual(entry.discipline, "Anotações do dia")
                self.assertEqual(entry.title, "Revisei verbos")
                self.assertEqual(entry.content, "Revisei verbos\nfiz exercícios")

                await client.put(f"/api/study/day/{day}", json={"studied_text": "Outra anotação"})
                [entry] = entries_from("day_note", day_id)
                self.assertEqual(entry.content, "Outra anotação")

                await client.put(f"/api/study/day/{day}", json={"studied_text": ""})
                self.assertEqual(entries_from("day_note", day_id), [])

        run(scenario())


class IsolationTests(unittest.TestCase):
    def test_another_account_cannot_reach_an_entry(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                created = await client.post("/api/study-log", json={"discipline": "Segredo", "content": "privado"})
                entry_id = created.json()["id"]
            async with api_client(SECONDARY[0]) as client:
                for response, label in (
                    (await client.get(f"/api/study-log/{entry_id}"), "read"),
                    (await client.put(f"/api/study-log/{entry_id}", json={"title": "x"}), "edit"),
                    (await client.post(f"/api/study-log/{entry_id}/summary"), "summarize"),
                    (await client.delete(f"/api/study-log/{entry_id}"), "delete"),
                ):
                    assert_status(response, 404, f"foreign {label}")
                listing = await client.get("/api/study-log")
                self.assertNotIn(entry_id, [item["id"] for item in listing.json()])
                options = await client.get("/api/study-log/options")
                self.assertNotIn("Segredo", [item["name"] for item in options.json()["disciplines"]])
            async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as anonymous:
                assert_status(await anonymous.get("/api/study-log"), 401, "signed out")

        run(scenario())

    def test_account_export_and_deletion_cover_the_log(self) -> None:
        async def scenario() -> None:
            async with api_client(LEAVING[0]) as client:
                created = await client.post("/api/study-log", json={"discipline": "Artes", "duration_minutes": 20})
                assert_status(created, 201, "entry before leaving")
            with Session(main.engine) as session:
                user = session.exec(select(User).where(User.email == LEAVING[0])).one()
                child_ids = [child.id for child in session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id))]
                exported = account_data.export_account(session, user)
                self.assertTrue(any(row["discipline"] == "Artes" for row in exported["study_log_entries"]))
                account_data.delete_account(session, user)
            with Session(main.engine) as session:
                left = session.exec(select(StudyLogEntry).where(StudyLogEntry.child_id.in_(child_ids))).all()
            self.assertEqual(left, [])

        run(scenario())


if __name__ == "__main__":
    unittest.main(verbosity=2)
