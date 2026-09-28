"""The study log, phase 2: search, rename and merge, the notebook and the review mode.

Pinned here:

* search finds words in the text and in the sheet, whatever the accents, and
  says where it found them;
* renaming a discipline or a subject moves every entry, merges into a name
  already in use, and keeps the activity log and the curriculum links in step;
* the notebook joins the sheets of a discipline or a subject in reading order,
  with the sheets' headings moved under their entry, and lists what is missing;
* the review queue asks the questions of the sheets that went longest without
  a review, and each review is recorded as study.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="study-log-phase2-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'test.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "study-log-phase2-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["AUTH_RATE_LIMIT"] = "500"
os.environ["AI_RATE_LIMIT"] = "500"

sys.path.insert(0, str(API))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import DailyActivity, StudyLogEntry  # noqa: E402
from services import study_log_service  # noqa: E402


PASSWORD = "Secret@123"
PRIMARY = ("phase2-primary@example.com", "52998224725", "Lia")
SECONDARY = ("phase2-secondary@example.com", "39053344705", "Bia")

SHEET = """## Em uma frase
A Constituição está acima das leis.

## Perguntas para se testar
1. **O que é controle difuso?** Feito por qualquer juiz, no caso concreto.
2. **Quem julga ADI?**
   O STF, em abstrato.
3. Vale para todos? Sim, erga omnes.

## Pontos de atenção
- Não confunda difuso com concentrado?
"""

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
        for email, cpf, child_name in (PRIMARY, SECONDARY):
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
    _seeded = True


def run(coroutine):
    asyncio.run(seed_accounts())
    return asyncio.run(coroutine)


async def create_entry(client: httpx.AsyncClient, **payload) -> dict:
    response = await client.post("/api/study-log", json=payload)
    assert_status(response, 201, f"create {payload.get('discipline')}")
    return response.json()


async def set_sheet(client: httpx.AsyncClient, entry_id: int, sheet: str = SHEET) -> dict:
    response = await client.put(f"/api/study-log/{entry_id}", json={"summary": sheet})
    assert_status(response, 200, "save sheet")
    return response.json()


def entry_row(entry_id: int) -> StudyLogEntry:
    with Session(main.engine) as session:
        return session.get(StudyLogEntry, entry_id)


def activities_for(entry_id: int, activity_type: str) -> list[DailyActivity]:
    with Session(main.engine) as session:
        return list(
            session.exec(
                select(DailyActivity).where(
                    DailyActivity.activity_type == activity_type,
                    DailyActivity.activity_id == entry_id,
                )
            ).all()
        )


class ReviewQuestionTests(unittest.TestCase):
    def test_questions_come_from_their_section_in_any_of_the_formats(self) -> None:
        questions = study_log_service.extract_review_questions(SHEET)
        self.assertEqual(
            [(item.question, item.answer) for item in questions],
            [
                ("O que é controle difuso?", "Feito por qualquer juiz, no caso concreto."),
                ("Quem julga ADI?", "O STF, em abstrato."),
                ("Vale para todos?", "Sim, erga omnes."),
            ],
            "the section ends at the next heading, and answers on the next line are read",
        )

    def test_english_sheets_and_sheets_without_questions(self) -> None:
        english = "## Questions to test yourself\n1. **What is it?** A check.\n- no question here\n"
        self.assertEqual(
            [(item.question, item.answer) for item in study_log_service.extract_review_questions(english)],
            [("What is it?", "A check.")],
        )
        self.assertEqual(study_log_service.extract_review_questions("## Em uma frase\nNada."), [])
        self.assertEqual(study_log_service.extract_review_questions(None), [])


class SearchHelperTests(unittest.TestCase):
    def test_folding_keeps_the_length_so_matches_point_back(self) -> None:
        text = "Lição de Ação — Çedilha"
        self.assertEqual(len(study_log_service.fold_for_search(text)), len(text))
        self.assertEqual(study_log_service.fold_for_search("Lição"), "licao")

    def test_words_matches_and_snippets(self) -> None:
        self.assertEqual(study_log_service.search_words("  Lição  a  difuso "), ["licao", "difuso"])
        self.assertTrue(study_log_service.matches_search(("Uma lição", None, "sobre controle DIFUSO"), ["licao", "difuso"]))
        self.assertFalse(study_log_service.matches_search(("Uma lição",), ["licao", "penal"]))
        text = "Início. " + "x " * 80 + "## Controle **difuso**: qualquer juiz decide no caso. " + "y " * 80
        snippet = study_log_service.search_snippet(text, ["difuso"])
        self.assertIn("Controle difuso: qualquer juiz", snippet)
        self.assertTrue(snippet.startswith("…") and snippet.endswith("…"))
        self.assertIsNone(study_log_service.search_snippet("nada aqui", ["difuso"]))


class NotebookBuilderTests(unittest.TestCase):
    def test_a_discipline_notebook_nests_each_sheet_under_its_entry(self) -> None:
        entries = [
            study_log_service.NotebookEntry("Controle", "Constitucional", date(2026, 9, 20), 40, "# Controle\n## Em uma frase\nIdeia."),
            study_log_service.NotebookEntry("Leitura solta", None, date(2026, 9, 21), None, None),
        ]
        content = study_log_service.build_notebook(
            discipline="Direito", subject=None, entries=entries, base_language="Portuguese"
        )
        lines = content.splitlines()
        self.assertEqual(lines[0], "# Caderno de Direito")
        self.assertIn("## Constitucional", lines)
        self.assertIn("### Controle", lines)
        self.assertIn("*20/09/2026 · 40 min*", lines)
        self.assertIn("#### Em uma frase", lines, "the sheet's headings move under the entry")
        self.assertNotIn("# Controle", lines, "the sheet's own title line is dropped")
        self.assertIn("## Sem matéria", lines)
        self.assertIn("*Ainda sem ficha.*", lines)

    def test_a_subject_notebook_has_no_subject_sections(self) -> None:
        entries = [study_log_service.NotebookEntry("Tipicidade", "Penal", date(2026, 9, 22), 90, "## Em uma frase\nIdeia.")]
        content = study_log_service.build_notebook(
            discipline="Direito", subject="Penal", entries=entries, base_language="English"
        )
        lines = content.splitlines()
        self.assertEqual(lines[0], "# Notebook: Direito › Penal")
        self.assertIn("## Tipicidade", lines)
        self.assertIn("*2026-09-22 · 1h 30min*", lines)
        self.assertIn("### Em uma frase", lines)


class SearchApiTests(unittest.TestCase):
    def test_search_finds_text_and_sheet_words_without_accents(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                lesson = await create_entry(
                    client, discipline="Direito", content="A lição de hoje: controle difuso e concentrado."
                )
                chemistry = await create_entry(client, discipline="Química", content="Ligações covalentes.")
                sheet_only = await create_entry(client, discipline="Direito", duration_minutes=20)
                await set_sheet(client, sheet_only["id"], "## Em uma frase\nA supremacia da Constituição.")

                found = await client.get("/api/study-log/search", params={"q": "licao DIFUSO"})
                assert_status(found, 200, "search text")
                hits = {item["id"]: item for item in found.json()}
                self.assertIn(lesson["id"], hits)
                self.assertNotIn(chemistry["id"], hits)
                self.assertEqual(hits[lesson["id"]]["field"], "content")
                self.assertIn("lição", hits[lesson["id"]]["snippet"])

                by_sheet = await client.get("/api/study-log/search", params={"q": "supremacia"})
                self.assertEqual([(item["id"], item["field"]) for item in by_sheet.json()], [(sheet_only["id"], "summary")])
                by_discipline = await client.get("/api/study-log/search", params={"q": "quimica"})
                self.assertEqual([item["id"] for item in by_discipline.json()], [chemistry["id"]])
                self.assertEqual((await client.get("/api/study-log/search", params={"q": "a"})).json(), [])
            async with api_client(SECONDARY[0]) as client:
                # A word only the first account wrote.
                other = await client.get("/api/study-log/search", params={"q": "covalentes"})
                assert_status(other, 200, "search from another account")
                self.assertEqual(other.json(), [], "another account finds nothing of this one")
            async with httpx.AsyncClient(transport=transport(), base_url="http://testserver") as anonymous:
                assert_status(await anonymous.get("/api/study-log/search", params={"q": "difuso"}), 401, "signed out")

        run(scenario())


class RenameApiTests(unittest.TestCase):
    def test_renaming_onto_an_existing_discipline_merges_and_relinks(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                discipline = await client.post("/api/general/disciplines", json={"name": "Direito Público"})
                in_public = f"?discipline_id={discipline.json()['id']}"
                subject = await client.post(f"/api/general/subjects{in_public}", json={"name": "Administrativo"})
                assert_status(subject, 201, "curriculum subject")
                existing = await create_entry(client, discipline="Direito Público", duration_minutes=10)
                moved = await create_entry(
                    client, discipline="Adm", subject="administrativo", content="Atos administrativos."
                )
                self.assertIsNone(moved["subject_id"], "no curriculum subject under the old name")

                merged = await client.post(
                    "/api/study-log/disciplines/rename", json={"from_name": "adm", "to_name": "direito publico"}
                )
                assert_status(merged, 200, "merge disciplines")
                self.assertEqual(merged.json(), {"updated": 1, "name": "Direito Público"})
                row = entry_row(moved["id"])
                self.assertEqual(row.discipline, "Direito Público")
                self.assertEqual(row.subject, "Administrativo")
                self.assertEqual(row.subject_id, subject.json()["id"], "linked to the curriculum of the new name")
                self.assertEqual(entry_row(existing["id"]).discipline, "Direito Público")

                respelled = await client.post(
                    "/api/study-log/disciplines/rename",
                    json={"from_name": "Direito Público", "to_name": "Direito público"},
                )
                self.assertEqual(respelled.json()["updated"], 2)
                self.assertEqual(entry_row(existing["id"]).discipline, "Direito público", "a respelling is taken as typed")

                reading = await create_entry(client, discipline="Leituras", content="Clean Code, cap. 2.")
                self.assertEqual(activities_for(reading["id"], "study_log")[0].result_details["area"], "diverse")
                await client.post(
                    "/api/study-log/disciplines/rename", json={"from_name": "Leituras", "to_name": "programação"}
                )
                activity = activities_for(reading["id"], "study_log")[0]
                self.assertEqual(activity.result_details["discipline"], "Programação")
                self.assertEqual(activity.result_details["area"], "coding", "the objective area follows the new name")

                missing = await client.post(
                    "/api/study-log/disciplines/rename", json={"from_name": "Nada", "to_name": "Outra"}
                )
                assert_status(missing, 404, "unknown discipline")
                blank = await client.post(
                    "/api/study-log/disciplines/rename", json={"from_name": "Programação", "to_name": "  "}
                )
                assert_status(blank, 422, "blank new name")

        run(scenario())

    def test_subjects_rename_merge_file_and_clear(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                first = await create_entry(client, discipline="História", subject="Brasil Colônia", duration_minutes=5)
                second = await create_entry(client, discipline="História", subject="Colônia", duration_minutes=5)
                loose = await create_entry(client, discipline="História", duration_minutes=5)

                merged = await client.post(
                    "/api/study-log/subjects/rename",
                    json={"discipline": "historia", "from_name": "colonia", "to_name": "brasil colonia"},
                )
                assert_status(merged, 200, "merge subjects")
                self.assertEqual(merged.json()["name"], "Brasil Colônia")
                self.assertEqual(entry_row(second["id"]).subject, "Brasil Colônia")
                self.assertFalse(entry_row(second["id"]).subject_is_auto)

                filed = await client.post(
                    "/api/study-log/subjects/rename",
                    json={"discipline": "História", "from_name": "", "to_name": "Império"},
                )
                self.assertEqual(filed.json(), {"updated": 1, "name": "Império"})
                self.assertEqual(entry_row(loose["id"]).subject, "Império", "entries without a subject get one")

                cleared = await client.post(
                    "/api/study-log/subjects/rename",
                    json={"discipline": "História", "from_name": "Império", "to_name": ""},
                )
                self.assertEqual(cleared.json(), {"updated": 1, "name": None})
                self.assertIsNone(entry_row(loose["id"]).subject)
                self.assertEqual(entry_row(first["id"]).subject, "Brasil Colônia")

        run(scenario())


class NotebookApiTests(unittest.TestCase):
    def test_the_notebook_joins_sheets_and_lists_what_is_missing(self) -> None:
        async def scenario() -> None:
            async with api_client(PRIMARY[0]) as client:
                with_sheet = await create_entry(
                    client, discipline="Filosofia", subject="Ética", content="Kant e o dever.", studied_on="2026-09-20"
                )
                await set_sheet(client, with_sheet["id"], "## Em uma frase\nO dever pelo dever.")
                text_only = await create_entry(client, discipline="Filosofia", subject="Ética", content="Aristóteles.")
                time_only = await create_entry(client, discipline="Filosofia", duration_minutes=15)

                notebook = await client.get("/api/study-log/notebook", params={"discipline": "filosofia"})
                assert_status(notebook, 200, "discipline notebook")
                body = notebook.json()
                self.assertEqual(body["title"], "Caderno de Filosofia")
                self.assertEqual((body["entry_count"], body["summarized_count"]), (3, 1))
                self.assertEqual(
                    {(item["id"], item["can_summarize"]) for item in body["pending"]},
                    {(text_only["id"], True), (time_only["id"], False)},
                )
                content = body["content"].splitlines()
                self.assertLess(content.index("## Ética"), content.index("## Sem matéria"))
                self.assertIn("#### Em uma frase", content)
                self.assertIn("O dever pelo dever.", content)

                subject = await client.get(
                    "/api/study-log/notebook", params={"discipline": "Filosofia", "subject": "etica"}
                )
                self.assertEqual(subject.json()["title"], "Caderno de Filosofia › Ética")
                self.assertEqual(subject.json()["entry_count"], 2)
                assert_status(
                    await client.get("/api/study-log/notebook", params={"discipline": "Nada"}), 404, "empty discipline"
                )
            async with api_client(SECONDARY[0]) as client:
                assert_status(
                    await client.get("/api/study-log/notebook", params={"discipline": "Filosofia"}),
                    404,
                    "another account's notebook",
                )

        run(scenario())


class ReviewApiTests(unittest.TestCase):
    def test_the_queue_starts_from_what_went_longest_without_review(self) -> None:
        async def scenario() -> None:
            async with api_client(SECONDARY[0]) as client:
                older = await create_entry(client, discipline="Biologia", content="Células.", studied_on="2026-09-01")
                newer = await create_entry(client, discipline="Biologia", content="Mitose.", studied_on="2026-09-10")
                no_questions = await create_entry(client, discipline="Biologia", content="Meiose.")
                other = await create_entry(client, discipline="Física", content="Inércia.")
                for entry in (older, newer, other):
                    await set_sheet(client, entry["id"])
                await set_sheet(client, no_questions["id"], "## Em uma frase\nSem perguntas.")

                queue = await client.get("/api/study-log/review", params={"discipline": "biologia"})
                assert_status(queue, 200, "review queue")
                self.assertEqual([item["id"] for item in queue.json()], [older["id"], newer["id"]])
                self.assertEqual(len(queue.json()[0]["questions"]), 3)

                reviewed = await client.post(f"/api/study-log/{older['id']}/review", json={"known": 2, "total": 3})
                assert_status(reviewed, 200, "record review")
                body = reviewed.json()
                self.assertEqual((body["review_count"], body["last_review_score"]), (1, 67))
                self.assertIsNotNone(body["last_reviewed_at"])
                again = await client.get("/api/study-log/review", params={"discipline": "Biologia"})
                self.assertEqual([item["id"] for item in again.json()], [newer["id"], older["id"]])

                single = await client.get("/api/study-log/review", params={"entry_id": other["id"]})
                self.assertEqual([item["id"] for item in single.json()], [other["id"]])
                everything = await client.get("/api/study-log/review", params={"limit": 1})
                self.assertEqual(len(everything.json()), 1)

                [activity] = activities_for(older["id"], "study_log_review")
                self.assertEqual(activity.result_details["total"], 3)
                self.assertEqual(activity.result_details["area"], "diverse")
                today = (await client.get("/api/activity/today")).json()
                self.assertIn("Revisão: Células.", [item["activity_title"] for item in today["activities"]])
                self.assertIn("review", today["activities_by_type"])
                self.assertGreaterEqual(today["questions_answered"], 3, "reviewed questions count in the dashboard")

                listing = await client.get("/api/study-log")
                row = next(item for item in listing.json() if item["id"] == older["id"])
                self.assertEqual((row["review_count"], row["last_review_score"]), (1, 67))

                too_many = await client.post(f"/api/study-log/{older['id']}/review", json={"known": 4, "total": 3})
                assert_status(too_many, 422, "more known than asked")
            async with api_client(PRIMARY[0]) as client:
                foreign = await client.post(f"/api/study-log/{older['id']}/review", json={"known": 1, "total": 1})
                assert_status(foreign, 404, "another account's review")
                self.assertEqual(
                    (await client.get("/api/study-log/review", params={"entry_id": older["id"]})).json(), []
                )

        run(scenario())


if __name__ == "__main__":
    unittest.main(verbosity=2)
