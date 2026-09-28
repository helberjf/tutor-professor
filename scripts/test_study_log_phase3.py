"""The study log, phase 3: the analysis of a period.

Pinned here:

* the numbers of a period (time, study days, streaks and gaps, weekdays,
  disciplines, sheets, reviews, the previous period) are computed by the app,
  and only the time the learner logged counts as time;
* the AI receives those numbers as facts plus one line per entry, and its
  answer is read tolerantly;
* an analysis is stored with its numbers, one per period — analysing the same
  days again replaces it — and belongs to its account only;
* no provider call is made for an empty period or without a key.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="study-log-phase3-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'test.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "study-log-phase3-secret"
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
from starlette.requests import Request  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import ChildProfile, StudyLogAnalysis, User  # noqa: E402
from services import account_data, study_log_service  # noqa: E402
from services.study_log_service import PeriodEntry, PeriodReview  # noqa: E402


PASSWORD = "Secret@123"
PRIMARY = ("phase3-primary@example.com", "52998224725", "Lia")
SECONDARY = ("phase3-secondary@example.com", "39053344705", "Bia")
LEAVING = ("phase3-leaving@example.com", "11144477735", "Rui")

SHEET = """## Em uma frase
A Constituição está acima das leis e todo juiz pode deixar de aplicar uma lei inconstitucional.

## Perguntas para se testar
1. **O que é controle difuso?** Feito por qualquer juiz, no caso concreto.
2. **Quem julga ADI?** O STF.
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
        for email in (PRIMARY[0], LEAVING[0]):
            login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
            assert_status(login, 200, f"login {email} for AI config")
            settings = await client.put(
                "/api/ai/settings",
                json={"provider": "gemini", "api_key": "fake-test-key", "model": "gemini-2.5-flash"},
            )
            assert_status(settings, 200, "save fake AI config")
            await client.post("/api/auth/logout")
    _seeded = True


def run(coroutine):
    asyncio.run(seed_accounts())
    return asyncio.run(coroutine)


def analysis_json(*, title: str = "Semana de Direito", analysis: str | None = None) -> str:
    return json.dumps(
        {
            "title": title,
            "analysis": analysis
            or "# Título repetido\n## Resumo do período\nUma boa semana.\n## Próximos passos\n- Revisar.",
        }
    )


def entry(day: date, minutes: int | None = None, discipline: str = "Direito", subject: str | None = None, **extra) -> PeriodEntry:
    return PeriodEntry(
        studied_on=day,
        title=extra.pop("title", f"Estudo de {day.isoformat()}"),
        discipline=discipline,
        subject=subject,
        duration_minutes=minutes,
        **extra,
    )


MONDAY = date(2026, 9, 21)


class PeriodStatsTests(unittest.TestCase):
    def stats(self, entries, previous=(), reviews=()):
        return study_log_service.period_stats(
            start=MONDAY,
            end=MONDAY + timedelta(days=6),
            entries=entries,
            previous=previous,
            reviews=reviews,
        )

    def test_days_streaks_gaps_and_weekdays(self) -> None:
        stats = self.stats(
            [
                entry(MONDAY, 30),
                entry(MONDAY + timedelta(days=1), 20),
                entry(MONDAY + timedelta(days=1), None, title="Tópico marcado"),
                entry(MONDAY + timedelta(days=2), 10),
                entry(MONDAY + timedelta(days=4), 40),
                entry(MONDAY + timedelta(days=9), 500, title="fora do período"),
            ]
        )
        self.assertEqual(stats["days"], 7)
        self.assertEqual(stats["entry_count"], 5)
        self.assertEqual(stats["total_minutes"], 100)
        self.assertEqual(stats["study_days"], 4)
        self.assertEqual(stats["average_minutes_per_study_day"], 25)
        self.assertEqual(stats["longest_streak"], 3)
        self.assertEqual(stats["longest_gap"], 2, "Saturday and Sunday")
        self.assertEqual(len(stats["daily"]), 7)
        self.assertEqual(stats["daily"][1], {"date": "2026-09-22", "minutes": 20, "entries": 2})
        self.assertEqual(stats["weekdays"][0], {"minutes": 30, "entries": 1})
        self.assertEqual(stats["weekdays"][6], {"minutes": 0, "entries": 0})

    def test_the_previous_period_has_the_same_length(self) -> None:
        self.assertEqual(
            study_log_service.previous_period(MONDAY, MONDAY + timedelta(days=6)),
            (date(2026, 9, 14), date(2026, 9, 20)),
        )
        stats = self.stats(
            [entry(MONDAY, 30)],
            previous=[entry(date(2026, 9, 14), 15), entry(date(2026, 9, 14), 15), entry(date(2026, 9, 1), 99)],
        )
        self.assertEqual(
            stats["previous"],
            {"start": "2026-09-14", "end": "2026-09-20", "total_minutes": 30, "entry_count": 2, "study_days": 1},
        )

    def test_disciplines_group_by_name_and_order_by_time(self) -> None:
        stats = self.stats(
            [
                entry(MONDAY, 20, discipline="Programming", subject="DVA-C02"),
                entry(MONDAY + timedelta(days=1), 30, discipline="Programação", subject="dva-c02"),
                entry(MONDAY + timedelta(days=1), 5, discipline="Programação"),
                entry(MONDAY, 60, discipline="Direito", subject="Constitucional"),
            ]
        )
        names = [group["name"] for group in stats["disciplines"]]
        self.assertEqual(names, ["Direito", "Programação"], "by time; the newest spelling names the group")
        programming = stats["disciplines"][1]
        self.assertEqual((programming["minutes"], programming["entries"]), (55, 3))
        self.assertEqual(
            [(subject["name"], subject["minutes"]) for subject in programming["subjects"]],
            [("dva-c02", 50), (None, 5)],
            "the entries without a subject come last",
        )

    def test_sheets_and_reviews(self) -> None:
        stats = self.stats(
            [
                entry(MONDAY, 10, title="Sem revisão", has_summary=True),
                entry(MONDAY, 10, title="Fraca", has_summary=True, last_review_score=50),
                entry(MONDAY, 10, title="No limite", has_summary=True, last_review_score=70),
                entry(MONDAY, 10, title="Só tempo"),
            ],
            reviews=[PeriodReview(MONDAY, known=3, total=4), PeriodReview(MONDAY, known=9, total=3)],
        )
        self.assertEqual(stats["sheets"], {"with_sheet": 3, "without_sheet": 1})
        reviews = stats["reviews"]
        self.assertEqual((reviews["sessions"], reviews["questions"], reviews["known"]), (2, 7, 6))
        self.assertEqual(reviews["score"], 86, "known never counts more than the questions asked")
        self.assertEqual(reviews["never_reviewed"], 1)
        self.assertEqual([weak["title"] for weak in reviews["weak"]], ["Fraca"], "70% is not weak")

    def test_an_empty_period_is_all_zeros(self) -> None:
        stats = self.stats([])
        self.assertEqual((stats["entry_count"], stats["study_days"], stats["longest_streak"]), (0, 0, 0))
        self.assertEqual(stats["longest_gap"], 7)
        self.assertIsNone(stats["reviews"]["score"])
        json.dumps(stats)  # stored as JSON as it is

    def test_the_excerpt_says_what_an_entry_was_about(self) -> None:
        self.assertEqual(
            study_log_service.entry_excerpt(SHEET, "texto"),
            "A Constituição está acima das leis e todo juiz pode deixar de aplicar uma lei inconstitucional.",
        )
        self.assertEqual(study_log_service.entry_excerpt(None, "# Aula\n\nPrimeira linha\nsegunda"), "Primeira linha segunda")
        long_text = "palavra " * 100
        excerpt = study_log_service.entry_excerpt("", long_text)
        self.assertTrue(excerpt.endswith("…"))
        self.assertLessEqual(len(excerpt), study_log_service.ANALYSIS_EXCERPT_CHARS + 1)
        self.assertNotIn("palavr…", excerpt, "cut at a word boundary")
        self.assertIsNone(study_log_service.entry_excerpt(None, "  "))


class AnalysisPromptTests(unittest.TestCase):
    def test_the_prompt_carries_the_numbers_and_the_entries(self) -> None:
        entries = [
            entry(MONDAY, 40, subject="Constitucional", title="Controle de constitucionalidade", excerpt="Supremacia da Constituição.", has_summary=True, last_review_score=67),
            entry(MONDAY + timedelta(days=2), None, discipline="Programação", title="Lambda"),
        ]
        stats = study_log_service.period_stats(
            start=MONDAY, end=MONDAY + timedelta(days=6), entries=entries, previous=[], reviews=[]
        )
        system, prompt = study_log_service.build_analysis_prompts(
            stats=stats, entries=entries, base_language="Portuguese", age_group="18+"
        )
        for heading in ("Resumo do período", "Ritmo e constância", "O que revisar", "Próximos passos"):
            self.assertIn(heading, system)
        self.assertIn("never invent a number", system)
        self.assertIn("in Portuguese", system)
        self.assertIn("on 2 of 7 days", prompt)
        self.assertIn("Previous 7 days (2026-09-14 to 2026-09-20)", prompt)
        self.assertIn("Discipline Direito: 40 min, 1 entries — Constitucional 40 min, 1 entries.", prompt)
        self.assertIn(
            "- 2026-09-21 · Direito › Constitucional · Controle de constitucionalidade · 40 min · sheet, last review 67%\n"
            "  Supremacia da Constituição.",
            prompt,
        )
        self.assertIn("carry no minutes", prompt)
        self.assertIn("· Lambda · no sheet", prompt, "the model is told which entries lack a sheet")
        self.assertIn("Days without any entry: 5", prompt)
        self.assertIn('"registro"', system, "the app's words in Portuguese")
        self.assertLess(prompt.index("Controle de constitucionalidade"), prompt.index("Lambda"), "oldest first")

        system_en, _ = study_log_service.build_analysis_prompts(
            stats=stats, entries=entries, base_language="English", age_group="18+"
        )
        self.assertIn("Period summary", system_en)
        self.assertIn("translated into English", system_en)

    def test_a_long_period_lists_the_most_recent_entries(self) -> None:
        total = study_log_service.MAX_ANALYSIS_ENTRIES_IN_PROMPT + 10
        entries = [entry(date(2026, 1, 1) + timedelta(days=offset), 10, title=f"Item {offset}") for offset in range(total)]
        stats = study_log_service.period_stats(
            start=date(2026, 1, 1), end=date(2026, 12, 31), entries=entries, previous=[], reviews=[]
        )
        _, prompt = study_log_service.build_analysis_prompts(
            stats=stats, entries=entries, base_language="Portuguese", age_group="18+"
        )
        self.assertIn(f"Only the {study_log_service.MAX_ANALYSIS_ENTRIES_IN_PROMPT} most recent of {total}", prompt)
        self.assertIn(f"· Item {total - 1} ·", prompt)
        self.assertIn("· Item 10 ·", prompt)
        self.assertNotIn("· Item 9 ·", prompt, "the oldest ones are left out")

    def test_the_answer_is_read_tolerantly(self) -> None:
        result = study_log_service.parse_analysis_response("```json\n" + analysis_json(title="  Uma   semana ") + "\n```")
        self.assertEqual(result.title, "Uma semana")
        self.assertTrue(result.analysis.startswith("## Resumo do período"), "the repeated title goes")
        self.assertIsNone(study_log_service.parse_analysis_response(analysis_json(title="")).title)
        for broken in ("sem json", "{nada", json.dumps({"title": "x", "analysis": " "}), "[1, 2]"):
            with self.assertRaises(ValueError):
                study_log_service.parse_analysis_response(broken)


class AnalysisApiTests(unittest.TestCase):
    def test_period_numbers_come_from_the_accounts_own_log(self) -> None:
        async def scenario() -> None:
            # A week nobody else in this suite writes in.
            start = date(2025, 3, 3)
            week = {"start": start.isoformat(), "end": (start + timedelta(days=6)).isoformat()}
            today = main.activity_today().isoformat()
            async with api_client(PRIMARY[0]) as client:
                for offset, minutes in ((1, 30), (1, 20), (3, 45), (-2, 25)):
                    created = await client.post(
                        "/api/study-log",
                        json={
                            "discipline": "Geografia",
                            "subject": "Relevo",
                            "duration_minutes": minutes,
                            "studied_on": (start + timedelta(days=offset)).isoformat(),
                        },
                    )
                    assert_status(created, 201, "entry for the period")

                response = await client.get("/api/study-log/period", params=week)
                assert_status(response, 200, "period numbers")
                stats = response.json()
                self.assertEqual(stats["days"], 7)
                self.assertEqual(stats["entry_count"], 3)
                self.assertEqual(stats["total_minutes"], 95)
                self.assertEqual(stats["study_days"], 2)
                self.assertEqual(stats["previous"]["total_minutes"], 25, "the entry two days before")
                self.assertEqual(stats["disciplines"][0]["subjects"][0]["name"], "Relevo")

                with_sheet = await client.post(
                    "/api/study-log",
                    json={
                        "discipline": "Geografia",
                        "title": "Placas",
                        "content": "Placas tectônicas.",
                        "studied_on": (start + timedelta(days=4)).isoformat(),
                    },
                )
                entry_id = with_sheet.json()["id"]
                await client.put(f"/api/study-log/{entry_id}", json={"summary": SHEET})
                before = (await client.get("/api/study-log/period", params={"start": today, "end": today})).json()
                reviewed = await client.post(f"/api/study-log/{entry_id}/review", json={"known": 1, "total": 2})
                assert_status(reviewed, 200, "review today")
                after = (await client.get("/api/study-log/period", params={"start": today, "end": today})).json()
                self.assertEqual(after["reviews"]["sessions"], before["reviews"]["sessions"] + 1, "reviews count on the day they happen")
                self.assertEqual(after["reviews"]["questions"], before["reviews"]["questions"] + 2)

                reviewed_week = (await client.get("/api/study-log/period", params=week)).json()
                self.assertEqual(reviewed_week["sheets"], {"with_sheet": 1, "without_sheet": 3})
                self.assertEqual(reviewed_week["reviews"]["weak"], [
                    {"title": "Placas", "discipline": "Geografia", "subject": None, "score": 50}
                ])

                backwards = await client.get(
                    "/api/study-log/period", params={"start": week["end"], "end": week["start"]}
                )
                assert_status(backwards, 422, "end before start")
                too_long = await client.get(
                    "/api/study-log/period", params={"start": "2024-01-01", "end": week["end"]}
                )
                assert_status(too_long, 422, "more than a year")

            async with api_client(SECONDARY[0]) as client:
                other = await client.get("/api/study-log/period", params=week)
                assert_status(other, 200, "other account's numbers")
                self.assertEqual(other.json()["entry_count"], 0)

        run(scenario())

    def test_an_analysis_is_written_stored_and_replaced_per_period(self) -> None:
        async def scenario() -> None:
            today = main.activity_today()
            start, end = today - timedelta(days=29), today
            async with api_client(PRIMARY[0]) as client:
                created = await client.post(
                    "/api/study-log",
                    json={"discipline": "História", "title": "Revolução Francesa", "duration_minutes": 50},
                )
                assert_status(created, 201, "entry to analyse")

                with patch.object(
                    main.phrase_generation_service, "generate_json_text", return_value=analysis_json()
                ) as generate:
                    first = await client.post(
                        "/api/study-log/analyses", json={"start": start.isoformat(), "end": end.isoformat()}
                    )
                    assert_status(first, 200, "write the analysis")
                    self.assertIn("Revolução Francesa", generate.call_args.kwargs["prompt"])
                    self.assertIn("Resumo do período", generate.call_args.kwargs["system_text"])
                body = first.json()
                self.assertEqual(body["title"], "Semana de Direito")
                self.assertTrue(body["content"].startswith("## Resumo do período"))
                self.assertEqual(body["period_start"], start.isoformat())
                self.assertGreaterEqual(body["stats"]["entry_count"], 1)
                self.assertEqual(body["stats"]["days"], 30)

                with patch.object(
                    main.phrase_generation_service,
                    "generate_json_text",
                    return_value=analysis_json(title="", analysis="## Resumo do período\nRefeita."),
                ):
                    again = await client.post(
                        "/api/study-log/analyses", json={"start": start.isoformat(), "end": end.isoformat()}
                    )
                assert_status(again, 200, "analyse the same period again")
                self.assertEqual(again.json()["id"], body["id"], "one analysis per period")
                self.assertEqual(again.json()["content"], "## Resumo do período\nRefeita.")
                self.assertTrue(again.json()["title"].startswith("Análise de "), "a title even without the AI's")

                with patch.object(
                    main.phrase_generation_service, "generate_json_text", return_value=analysis_json(title="Hoje")
                ):
                    other_period = await client.post(
                        "/api/study-log/analyses", json={"start": today.isoformat(), "end": today.isoformat()}
                    )
                assert_status(other_period, 200, "another period")
                listed = await client.get("/api/study-log/analyses")
                assert_status(listed, 200, "list analyses")
                self.assertEqual([item["title"] for item in listed.json()[:2]], ["Hoje", again.json()["title"]])
                self.assertNotIn("content", listed.json()[0], "the list stays light")

                opened = await client.get(f"/api/study-log/analyses/{body['id']}")
                assert_status(opened, 200, "open an analysis")
                self.assertEqual(opened.json()["stats"]["days"], 30)

            async with api_client(SECONDARY[0]) as client:
                assert_status(await client.get(f"/api/study-log/analyses/{body['id']}"), 404, "another account's")
                assert_status(await client.delete(f"/api/study-log/analyses/{body['id']}"), 404, "cannot delete it")
                self.assertEqual((await client.get("/api/study-log/analyses")).json(), [])

            async with api_client(PRIMARY[0]) as client:
                deleted = await client.delete(f"/api/study-log/analyses/{body['id']}")
                assert_status(deleted, 204, "delete an analysis")
                assert_status(await client.get(f"/api/study-log/analyses/{body['id']}"), 404, "deleted")

        run(scenario())

    def test_no_call_for_an_empty_period_or_without_a_key(self) -> None:
        async def scenario() -> None:
            far = date(2020, 1, 1)
            with patch.object(main.phrase_generation_service, "generate_json_text") as generate:
                async with api_client(PRIMARY[0]) as client:
                    empty = await client.post(
                        "/api/study-log/analyses", json={"start": far.isoformat(), "end": (far + timedelta(days=6)).isoformat()}
                    )
                    assert_status(empty, 422, "nothing logged in the period")
                async with api_client(SECONDARY[0]) as client:
                    created = await client.post("/api/study-log", json={"discipline": "Artes", "duration_minutes": 10})
                    assert_status(created, 201, "entry without a key")
                    today = main.activity_today().isoformat()
                    refused = await client.post("/api/study-log/analyses", json={"start": today, "end": today})
                    assert_status(refused, 422, "no AI key")
                    self.assertIn("IA", refused.json()["detail"])
            self.assertEqual(generate.call_count, 0)

        run(scenario())

    def test_writing_an_analysis_counts_against_the_ai_rate_limit(self) -> None:
        def request(method: str) -> Request:
            return Request(
                {
                    "type": "http",
                    "method": method,
                    "scheme": "http",
                    "server": ("testserver", 80),
                    "path": "/api/study-log/analyses",
                    "query_string": b"",
                    "headers": [],
                }
            )

        self.assertTrue(main._is_ai_request(request("POST")))
        self.assertFalse(main._is_ai_request(request("GET")), "reading the list is free")

    def test_account_export_and_deletion_cover_the_analyses(self) -> None:
        async def scenario() -> None:
            today = main.activity_today().isoformat()
            async with api_client(LEAVING[0]) as client:
                await client.post("/api/study-log", json={"discipline": "Artes", "duration_minutes": 20})
                with patch.object(main.phrase_generation_service, "generate_json_text", return_value=analysis_json()):
                    written = await client.post("/api/study-log/analyses", json={"start": today, "end": today})
                assert_status(written, 200, "analysis before leaving")
            with Session(main.engine) as session:
                user = session.exec(select(User).where(User.email == LEAVING[0])).one()
                child_ids = [child.id for child in session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id))]
                exported = account_data.export_account(session, user)
                self.assertEqual([row["title"] for row in exported["study_log_analyses"]], ["Semana de Direito"])
                account_data.delete_account(session, user)
            with Session(main.engine) as session:
                left = session.exec(select(StudyLogAnalysis).where(StudyLogAnalysis.child_id.in_(child_ids))).all()
            self.assertEqual(left, [])

        run(scenario())


if __name__ == "__main__":
    unittest.main(verbosity=2)
