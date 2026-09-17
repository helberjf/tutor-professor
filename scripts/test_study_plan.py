"""Study plans: the strategy behind "Criar plano", and what it may never do.

A plan is only useful if it survives contact with a real model and a real
learner, so these checks pin:

  - what counts as a usable AI answer, and how a sloppy one is repaired;
  - the ready-made models, which must work with no AI at all;
  - that drafting never stores anything, and accepting stores only what was kept;
  - the plan's percentage and "próximo passo", computed from its objectives;
  - that a revision adds and reorders but never removes finished work;
  - the AI gates (no key, no credits, unusable answer) and the objective limit;
  - that one account never reaches another's plan, and that plans leave with the
    account.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-study-plan-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'test.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret-for-study-plans"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["AUTH_RATE_LIMIT"] = "500"
os.environ["AI_RATE_LIMIT"] = "500"
os.environ.pop("ADMIN_EMAIL", None)

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402
from starlette.requests import Request  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from services.study_plan_service import (  # noqa: E402
    CurrentPriority,
    PriorityProgress,
    build_learner_snapshot,
    build_plan_prompts,
    load_plan_templates,
    parse_plan_response,
    plan_progress,
    validate_plan_draft,
)

PASSWORD = "Senha@Forte123"
ACCOUNT_A = ("plano-a@example.com", "52998224725", "Ana")
ACCOUNT_B = ("plano-b@example.com", "39053344705", "Bruno")
ACCOUNT_C = ("plano-c@example.com", "11144477735", "Caio")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def expect_value_error(raw: object, message: str, **kwargs) -> None:
    try:
        validate_plan_draft(raw, **kwargs)
    except ValueError:
        return
    raise AssertionError(message)


def priority(title: str, items: list, **extra) -> dict:
    return {"title": title, "why": f"Porque {title}", "items": items, **extra}


# ── Pure rules ────────────────────────────────────────────────────────────────

def test_validation() -> None:
    expect_value_error(["not", "an", "object"], "a list is not a plan")
    expect_value_error({"diagnosis": "x", "priorities": [priority("p", ["i"])]}, "a plan needs a title")
    expect_value_error({"title": "x", "priorities": [priority("p", ["i"])]}, "a plan needs a diagnosis")
    expect_value_error(
        {"title": "x", "diagnosis": "y", "priorities": [priority("sem itens", [])]},
        "a plan whose only priority has no items is unusable",
    )

    draft = validate_plan_draft(
        {
            "title": "  Vaga   internacional ",
            "diagnosis": "Gargalo claro",
            "priorities": [
                priority(
                    "Currículo",
                    [
                        {"title": "Bullets XYZ", "area": "Inglês", "weight": "7.6"},
                        {"title": "bullets xyz", "area": "free"},  # duplicate, accent/case-insensitive
                        {"title": "Números", "area": "astrologia", "weight": 99},
                        {"title": "PDF", "weight": "muito"},
                        "Revisar com alguém fluente",
                    ],
                ),
                priority("curriculo", ["repetida"]),  # duplicate priority title
                priority("Vazia", []),  # dropped: nothing to do
                priority("Programação", [{"title": "LeetCode", "area": "PROGRAMAÇÃO"}]),
            ],
            "avoid": ["Kubernetes", {"title": "kubernetes"}, {"title": "Outra linguagem", "reason": "dilui"}],
            "shortest_path": ["CV", "", "   ", "LinkedIn"],
        }
    )
    require(draft.title == "Vaga internacional", f"titles are trimmed, got {draft.title!r}")
    require([p.title for p in draft.priorities] == ["Currículo", "Programação"], f"got {draft.priorities}")
    items = draft.priorities[0].items
    require([item.title for item in items] == ["Bullets XYZ", "Números", "PDF", "Revisar com alguém fluente"], f"got {items}")
    require(items[0].area == "language" and items[0].weight == 8, f"alias and rounding, got {items[0]}")
    require(items[1].area == "free" and items[1].weight == 10, f"unknown area and clamp, got {items[1]}")
    require(items[2].weight == 1, f"a weight that is not a number is 1, got {items[2]}")
    require(draft.priorities[1].items[0].area == "coding", "accented alias must map to coding")
    require([title for title, _ in draft.avoid] == ["Kubernetes", "Outra linguagem"], f"got {draft.avoid}")
    require(draft.shortest_path == ("CV", "LinkedIn"), f"empty steps are dropped, got {draft.shortest_path}")

    many = validate_plan_draft(
        {
            "title": "Muitos",
            "diagnosis": "d",
            "priorities": [priority(f"Prioridade {n}", [f"item {m}" for m in range(9)]) for n in range(14)],
        }
    )
    require(len(many.priorities) == 10, f"at most 10 priorities, got {len(many.priorities)}")
    require(all(len(p.items) == 6 for p in many.priorities), "at most 6 items per priority")

    revision = validate_plan_draft(
        {
            "title": "Revisão",
            "diagnosis": "d",
            "priorities": [
                {"title": "Mantida sem novidade", "continues": "p1", "items": []},
                {"title": "Tenta repetir P1", "continues": "P1", "items": ["nova"]},
                {"title": "Inventa P9", "continues": "P9", "items": ["outra"]},
            ],
        },
        allowed_continues=["P1", "P2"],
    )
    require(revision.priorities[0].continues == "P1", "a continued priority may add nothing")
    require(revision.priorities[1].continues is None, "one label is continued once; the second becomes new")
    require(revision.priorities[2].continues is None, "an unknown label is ignored")

    fenced = parse_plan_response(
        "```json\n" + json.dumps({"title": "T", "diagnosis": "D", "priorities": [priority("P", ["i"])]}) + "\n```"
    )
    require(fenced.title == "T", "code fences around the JSON must be tolerated")
    for garbage in ("", "sem json aqui", "{quebrado"):
        try:
            parse_plan_response(garbage)
        except ValueError:
            continue
        raise AssertionError(f"{garbage!r} must be refused")


def test_progress_rule() -> None:
    require(plan_progress([]) == (0, None, 0), "an empty plan is 0% with no next step")
    overall, next_id, achieved = plan_progress(
        [
            PriorityProgress(objective_id=30, plan_order=3, percent=0, item_count=2, active=True),
            PriorityProgress(objective_id=10, plan_order=1, percent=100, item_count=3, active=True),
            PriorityProgress(objective_id=20, plan_order=2, percent=50, item_count=2, active=True),
            PriorityProgress(objective_id=40, plan_order=4, percent=0, item_count=1, active=False),
        ]
    )
    require(overall == 50, f"archived priorities do not count, got {overall}")
    require(next_id == 20, f"the next step is the first unfinished one in plan order, got {next_id}")
    require(achieved == 1, f"one priority is finished, got {achieved}")
    _, next_id, _ = plan_progress([PriorityProgress(1, 1, 100, 2, True)])
    require(next_id is None, "a finished plan has no next step")


def test_templates_and_prompts() -> None:
    templates = load_plan_templates()
    require(
        {"vaga-internacional-dev", "certificacao", "fluencia-entrevista"} <= set(templates),
        f"the ready-made models must all load, got {sorted(templates)}",
    )
    career = templates["vaga-internacional-dev"]
    require(len(career.draft.priorities) == 10, "the career model keeps its ten priorities")
    require(career.draft.avoid and career.draft.shortest_path, "the model says what to avoid and the path")

    lines = build_learner_snapshot(
        target_language="English",
        language_level=3,
        streak_days=4,
        last_study_date=date(2026, 9, 16),
        active_days_30=12,
        activities_30=40,
        question_subjects=[("AWS", 30, 10)],
        coding_subjects=[("React", 3, 10)],
        exams=[("DVA-C02", 68, 2), ("SAA", None, 0)],
        leetcode_categories=[("Two Pointers", 5)],
        objectives=[("CV", 40)],
    )
    text = "\n".join(lines)
    for fragment in ("nível 3", "Sequência atual: 4 dias", "40 respondidas, 75% de acerto", "3 de 10 tópicos", "melhor nota 68%", "ainda sem tentativa", "Two Pointers (5)", "CV (40%)"):
        require(fragment in text, f"the snapshot should say {fragment!r}:\n{text}")
    require(build_learner_snapshot() == [], "nothing recorded means nothing to send")

    system, prompt = build_plan_prompts(
        goal="Vaga internacional",
        profile="Dev full-stack com projetos em Next.js",
        weekly_hours=10,
        target_date=date(2026, 12, 1),
        snapshot=lines,
        base_language="Portuguese",
        age_group="18+",
        today=date(2026, 9, 17),
    )
    require("Portuguese" in system and "biggest bottleneck" in system, "the method and language are stated")
    require("adult" in system.casefold(), "an adult band is described as an adult")
    require("REVISION" not in system, "a new plan is not a revision")
    for fragment in ("Goal: Vaga internacional", "Weekly hours available: 10", "Deadline: 2026-12-01", "Next.js", "75% de acerto"):
        require(fragment in prompt, f"the prompt should carry {fragment!r}")

    minor_system, private_prompt = build_plan_prompts(
        goal="Passar de ano",
        profile=None,
        weekly_hours=None,
        target_date=None,
        snapshot=[],
        base_language="Portuguese",
        age_group="10-12",
        today=date(2026, 9, 17),
        current_plan=(
            "Falta rotina",
            [CurrentPriority("P1", 7, "Rotina", 50, (("Estudar 20 min", True), ("Revisar", False)))],
        ),
    )
    require("age-appropriate" in minor_system, "a minor gets the content rules a minor needs")
    require("REVISION" in minor_system, "a revision says so")
    require("(not shared by the learner)" in private_prompt, "history left out is said to be left out")
    require("P1. Rotina - 50% done" in private_prompt and "[x] Estudar 20 min" in private_prompt, "the current plan is described")


def test_generate_path_is_rate_limited_as_ai() -> None:
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "server": ("testserver", 80),
        "path": "/api/objectives/plan/generate",
        "query_string": b"",
        "headers": [],
    }
    require(main._is_ai_request(Request(scope)), "plan generation must count against the AI rate limit")


# ── Over HTTP ─────────────────────────────────────────────────────────────────

async def sign_in(client: httpx.AsyncClient, account: tuple[str, str, str]) -> dict[str, str]:
    email, cpf, first_name = account
    await client.post(
        "/api/auth/register",
        json={"first_name": first_name, "last_name": "Plano", "email": email, "cpf": cpf, "password": PASSWORD},
    )
    approve_all_accounts(main)
    enable_all_modules(main)
    login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    require(login.status_code == 200, f"login failed: {login.text}")
    return {"Authorization": f"Bearer {login.json()['token']}"}


def canned_plan(**overrides) -> str:
    body = {
        "title": "Plano da IA",
        "diagnosis": "O gargalo é apresentar o que já sabe.",
        "focus": "Full-stack TypeScript",
        "priorities": [
            priority("CV em inglês", [{"title": "Bullets XYZ", "area": "free", "weight": 3}]),
            priority("Entrevistas", [{"title": "1 simulada por semana", "area": "language", "weight": 5}]),
        ],
        "avoid": [{"title": "Kubernetes", "reason": "Não é o gargalo."}],
        "shortest_path": ["CV", "Entrevistas"],
    }
    body.update(overrides)
    return json.dumps(body)


class FakeProvider:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.answer = canned_plan()
        self.error: Exception | None = None

    def __call__(self, *, system_text, prompt, temperature, ai_config=None, timeout_seconds=None):
        self.calls.append({"system": system_text, "prompt": prompt, "timeout": timeout_seconds})
        if self.error is not None:
            raise self.error
        if ai_config is not None and ai_config.on_success is not None:
            ai_config.on_success()
        return self.answer


def count_rows(model, **filters) -> int:
    with Session(main.engine) as session:
        query = select(model)
        for column, value in filters.items():
            query = query.where(getattr(model, column) == value)
        return len(session.exec(query).all())


async def run_http() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    fake = FakeProvider()
    main.phrase_generation_service.generate_json_text = fake

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await sign_in(client, ACCOUNT_A)

        # ── No AI configured: the context says so and the models still work ─────
        context = await client.get("/api/objectives/plan/context", headers=headers)
        require(context.status_code == 200, f"context failed: {context.text}")
        body = context.json()
        require(body["ai_available"] is False and body["ai_unavailable_reason"] == "no_config", f"got {body}")
        require(isinstance(body["snapshot"], list) and body["last_form"] is None, f"got {body}")

        refused = await client.post("/api/objectives/plan/generate", headers=headers, json={"goal": "Vaga"})
        require(refused.status_code == 403, f"no key must be refused, got {refused.status_code}")
        require("modelo pronto" in refused.json()["detail"], "the refusal points to the ready-made models")
        require(not fake.calls, "no provider call without a configured key")

        templates = await client.get("/api/objectives/plan/templates", headers=headers)
        require(len(templates.json()) >= 3, f"got {templates.json()}")
        missing = await client.get("/api/objectives/plan/templates/nao-existe", headers=headers)
        require(missing.status_code == 404, "an unknown model is a 404")
        template = await client.get("/api/objectives/plan/templates/vaga-internacional-dev", headers=headers)
        draft = template.json()
        require(draft["source"] == "template:vaga-internacional-dev" and len(draft["priorities"]) == 10, f"got {draft}")

        # ── Accepting keeps only the priorities the learner chose ─────────────
        kept = dict(draft, priorities=draft["priorities"][:6])
        target = (date.today() + timedelta(days=60)).isoformat()
        created = await client.post(
            "/api/objectives/plans",
            headers=headers,
            json={"goal": "Vaga internacional full-stack", "profile": "5 anos de React", "weekly_hours": 12, "target_date": target, "draft": kept},
        )
        require(created.status_code == 201, f"create plan failed: {created.text}")
        plan = created.json()
        plan_id = plan["id"]
        require(plan["active_count"] == 6 and plan["progress_percent"] == 0, f"got {plan}")
        require([o["plan_order"] for o in plan["objectives"]] == [1, 2, 3, 4, 5, 6], "priorities keep their order")
        require(plan["next_objective_id"] == plan["objectives"][0]["id"], "the first priority is the next step")
        require(plan["source"] == "template:vaga-internacional-dev" and plan["avoid"] and plan["shortest_path"], f"got {plan}")
        require(plan["objectives"][0]["description"], "the priority's reason becomes the objective description")

        listed = await client.get("/api/objectives", headers=headers)
        require(sum(1 for o in listed.json() if o["plan_id"] == plan_id) == 6, "plan priorities are ordinary objectives")

        forged = dict(kept, source="template:../../etc")
        forged_plan = await client.post("/api/objectives/plans", headers=headers, json={"goal": "x", "draft": forged})
        require(forged_plan.json()["source"] == "ai", f"an unknown model is not stored as a source, got {forged_plan.text}")
        await client.delete(f"/api/objectives/plans/{forged_plan.json()['id']}?delete_objectives=true", headers=headers)
        bad_items = dict(kept, priorities=[dict(kept["priorities"][0], items=[])])
        empty = await client.post("/api/objectives/plans", headers=headers, json={"goal": "x", "draft": bad_items})
        require(empty.status_code == 422, "a new priority without items is refused")

        # ── Progress and the next step follow the checklists ──────────────────
        first = plan["objectives"][0]
        for item in first["items"]:
            await client.put(f"/api/objectives/items/{item['id']}", headers=headers, json={"done": True})
        plans = (await client.get("/api/objectives/plans", headers=headers)).json()
        current = next(p for p in plans if p["id"] == plan_id)
        require(current["progress_percent"] == round(100 / 6), f"got {current['progress_percent']}")
        require(current["achieved_count"] == 1, f"got {current}")
        require(current["next_objective_id"] == plan["objectives"][1]["id"], "the next step moves on")

        context = (await client.get("/api/objectives/plan/context", headers=headers)).json()
        require(context["last_form"]["goal"] == "Vaga internacional full-stack", "the last answers are offered again")
        require(context["last_form"]["profile"] == "5 anos de React", f"got {context['last_form']}")

        # ── With a key: drafting calls the AI and stores nothing ───────────────
        saved = await client.put("/api/ai/settings", headers=headers, json={"provider": "gemini", "api_key": "chave-falsa"})
        require(saved.status_code == 200, f"saving AI settings failed: {saved.text}")
        require((await client.get("/api/objectives/plan/context", headers=headers)).json()["ai_available"], "a key opens the AI path")

        plans_before = count_rows(main.StudyPlan)
        objectives_before = count_rows(main.Objective)
        generated = await client.post(
            "/api/objectives/plan/generate",
            headers=headers,
            json={"goal": "Vaga internacional", "profile": "React e Node", "weekly_hours": 8},
        )
        require(generated.status_code == 200, f"generate failed: {generated.text}")
        require(generated.json()["title"] == "Plano da IA" and generated.json()["source"] == "ai", f"got {generated.json()}")
        require(count_rows(main.StudyPlan) == plans_before and count_rows(main.Objective) == objectives_before, "a draft stores nothing")
        require(fake.calls[-1]["timeout"] == main.PLAN_GENERATION_TIMEOUT_SECONDS, "the generation has its own timeout")
        require("React e Node" in fake.calls[-1]["prompt"], "the learner's own words reach the AI")
        require("(not shared by the learner)" not in fake.calls[-1]["prompt"], "history is shared by default")

        await client.post(
            "/api/objectives/plan/generate",
            headers=headers,
            json={"goal": "Vaga internacional", "include_app_history": False},
        )
        require("(not shared by the learner)" in fake.calls[-1]["prompt"], "switching history off keeps it out of the prompt")
        require("Objetivos ativos" not in fake.calls[-1]["prompt"], "no recorded data may leak when history is off")

        fake.answer = "isto não é um plano"
        unusable = await client.post("/api/objectives/plan/generate", headers=headers, json={"goal": "x"})
        require(unusable.status_code == 502 and "modelo pronto" in unusable.json()["detail"], f"got {unusable.text}")
        fake.error = RuntimeError("Gemini recusou a chamada.")
        failed = await client.post("/api/objectives/plan/generate", headers=headers, json={"goal": "x"})
        require(failed.status_code == 502 and "Gemini" in failed.json()["detail"], f"got {failed.text}")
        fake.error = None

        # ── Revision: reorder, add, archive — never lose finished work ─────────
        p1, p2, p3 = plan["objectives"][0], plan["objectives"][1], plan["objectives"][2]
        fake.answer = canned_plan(
            title="Plano revisado",
            diagnosis="Agora o gargalo é entrevista.",
            priorities=[
                {"title": p2["title"], "continues": "P2", "items": [p2["items"][0]["title"], "Item novo de P2"]},
                priority("Prioridade nova", ["Primeiro passo novo"]),
                {"title": p1["title"], "continues": "P1", "items": ["Item novo de P1"]},
            ],
        )
        revision = await client.post(
            "/api/objectives/plan/generate",
            headers=headers,
            json={"goal": "Vaga internacional full-stack", "plan_id": plan_id},
        )
        require(revision.status_code == 200, f"revision draft failed: {revision.text}")
        revised_draft = revision.json()
        require("REVISION" in fake.calls[-1]["system"], "a revision is asked as a revision")
        require(f"P1. {p1['title']} - 100% done" in fake.calls[-1]["prompt"], "the AI sees the progress")
        require(revised_draft["plan_id"] == plan_id, f"got {revised_draft}")
        require(
            [p["objective_id"] for p in revised_draft["priorities"]] == [p2["id"], None, p1["id"]],
            f"continued priorities point at their objectives, got {revised_draft['priorities']}",
        )
        repeated = next(p for p in revised_draft["priorities"] if p.get("objective_id") == p2["id"])
        require(
            [item["title"] for item in repeated["items"]] == ["Item novo de P2"],
            f"an item the priority already has is not offered as new, got {repeated['items']}",
        )
        dropped = revised_draft["dropped_objective_ids"]
        require(set(dropped) == {o["id"] for o in plan["objectives"][2:]}, f"got {dropped}")

        mismatch = await client.post(
            f"/api/objectives/plans/{plan_id}/revise",
            headers=headers,
            json={"draft": dict(revised_draft, priorities=[dict(revised_draft["priorities"][0], objective_id=999999)])},
        )
        require(mismatch.status_code == 422, "continuing an objective outside the plan is refused")

        applied = await client.post(
            f"/api/objectives/plans/{plan_id}/revise",
            headers=headers,
            json={"draft": revised_draft, "archive_objective_ids": [p3["id"]]},
        )
        require(applied.status_code == 200, f"applying the revision failed: {applied.text}")
        revised = applied.json()
        require(revised["revision"] == 2 and revised["revised_at"], f"got {revised}")
        require(revised["title"] == "Plano revisado" and revised["diagnosis"].startswith("Agora"), f"got {revised}")
        active = [o for o in revised["objectives"] if o["status"] == "active"]
        require(
            [o["title"] for o in active[:3]] == [p2["title"], "Prioridade nova", p1["title"]],
            f"the revision's order wins, got {[o['title'] for o in active]}",
        )
        require([o["plan_order"] for o in active] == [1, 2, 3, 4, 5, 6], f"got {[o['plan_order'] for o in active]}")
        require(p3["id"] in {o["id"] for o in revised["objectives"] if o["status"] == "archived"}, "the dropped priority is archived")
        kept_p1 = next(o for o in revised["objectives"] if o["id"] == p1["id"])
        require(
            sum(1 for item in kept_p1["items"] if item["done"]) == len(p1["items"]),
            "finished items survive a revision",
        )
        require(kept_p1["items"][-1]["title"] == "Item novo de P1" and kept_p1["achieved_at"] is None, "a new item reopens the priority")
        kept_p2 = next(o for o in revised["objectives"] if o["id"] == p2["id"])
        require(len(kept_p2["items"]) == len(p2["items"]) + 1, "an existing item is not added twice")

        # ── No credits left on the platform key ────────────────────────────────
        os.environ["GEMINI_API_KEY"] = "chave-da-plataforma"
        await client.put("/api/ai/settings", headers=headers, json={"provider": "gemini", "use_global_key": True})
        with Session(main.engine) as session:
            user = session.exec(select(main.User).where(main.User.email == ACCOUNT_A[0])).one()
            user.ai_credits = 0
            user.ai_daily_credit_limit = 0
            user.ai_credits_reset_date = main.activity_today()
            session.add(user)
            session.commit()
        calls = len(fake.calls)
        broke = await client.post("/api/objectives/plan/generate", headers=headers, json={"goal": "x"})
        require(broke.status_code == 402, f"no credits is a 402, got {broke.status_code}")
        require(len(fake.calls) == calls, "no provider call without credits")
        context = (await client.get("/api/objectives/plan/context", headers=headers)).json()
        require(context["ai_unavailable_reason"] == "no_credits", f"got {context}")
        os.environ["GEMINI_API_KEY"] = ""

        # ── Archive, then delete keeping or dropping the objectives ─────────────
        archived = await client.put(f"/api/objectives/plans/{plan_id}", headers=headers, json={"status": "archived"})
        require(archived.json()["status"] == "archived", f"got {archived.text}")
        require(all(p["id"] != plan_id for p in (await client.get("/api/objectives/plans", headers=headers)).json()), "archived plans leave the list")
        with_archived = (await client.get("/api/objectives/plans?include_archived=true", headers=headers)).json()
        require(any(p["id"] == plan_id for p in with_archived), "archived plans are kept")
        loose = (await client.get("/api/objectives", headers=headers)).json()
        require(all(o["plan_id"] != plan_id for o in loose), "an archived plan takes its priorities out of the list")
        summary = (await client.get("/api/objectives/summary", headers=headers)).json()
        require(all(o["plan_id"] != plan_id for o in summary["objectives"]), "and out of the dashboard summary")
        everything = (await client.get("/api/objectives?include_archived=true", headers=headers)).json()
        require(any(o["plan_id"] == plan_id for o in everything), "they are still there when archived items are shown")
        restored = await client.put(f"/api/objectives/plans/{plan_id}", headers=headers, json={"status": "active"})
        require(restored.json()["status"] == "active", f"got {restored.text}")
        require(
            any(o["plan_id"] == plan_id for o in (await client.get("/api/objectives", headers=headers)).json()),
            "reactivating the plan brings its priorities back",
        )

        objective_ids = {o["id"] for o in revised["objectives"]}
        removed = await client.delete(f"/api/objectives/plans/{plan_id}", headers=headers)
        require(removed.status_code == 204, f"delete plan failed: {removed.text}")
        with Session(main.engine) as session:
            survivors = [session.get(main.Objective, objective_id) for objective_id in objective_ids]
        require(all(o is not None and o.plan_id is None for o in survivors), "deleting a plan keeps its objectives, unlinked")

        second = await client.post(
            "/api/objectives/plans",
            headers=headers,
            json={"goal": "Certificação", "draft": (await client.get("/api/objectives/plan/templates/certificacao", headers=headers)).json()},
        )
        second_id = second.json()["id"]
        second_objectives = [o["id"] for o in second.json()["objectives"]]
        dropped_all = await client.delete(f"/api/objectives/plans/{second_id}?delete_objectives=true", headers=headers)
        require(dropped_all.status_code == 204, f"got {dropped_all.text}")
        require(all(count_rows(main.Objective, id=objective_id) == 0 for objective_id in second_objectives), "delete_objectives removes them")
        require(count_rows(main.ObjectiveItem, objective_id=second_objectives[0]) == 0, "and their items")

        # A plan to prove the account export and erasure below.
        leaving = await client.post("/api/objectives/plans", headers=headers, json={"goal": "Sair", "draft": kept})
        leaving_id = leaving.json()["id"]

    # ── Another account reaches none of it; no session reaches nothing ─────────
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as intruder:
        other = await sign_in(intruder, ACCOUNT_B)
        require((await intruder.get("/api/objectives/plans", headers=other)).json() == [], "a fresh account has no plans")
        for method, path, payload in (
            ("PUT", f"/api/objectives/plans/{leaving_id}", {"title": "invadido"}),
            ("DELETE", f"/api/objectives/plans/{leaving_id}", None),
            ("POST", f"/api/objectives/plans/{leaving_id}/revise", {"draft": kept}),
        ):
            response = await intruder.request(method, path, headers=other, json=payload)
            require(response.status_code == 404, f"{method} {path} leaked: {response.status_code}")
        await intruder.put("/api/ai/settings", headers=other, json={"provider": "gemini", "api_key": "outra"})
        foreign = await intruder.post("/api/objectives/plan/generate", headers=other, json={"goal": "x", "plan_id": leaving_id})
        require(foreign.status_code == 404, f"revising another account's plan leaked: {foreign.status_code}")

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as anonymous:
        for path in ("/api/objectives/plans", "/api/objectives/plan/context", "/api/objectives/plan/templates"):
            response = await anonymous.get(path)
            require(response.status_code == 401, f"{path} answered {response.status_code} without a session")

    # ── The objective limit counts the priorities a plan would create ──────────
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as crowded:
        crowd = await sign_in(crowded, ACCOUNT_C)
        await crowded.get("/api/objectives/plan/context", headers=crowd)  # creates the default profile
        children = (await crowded.get("/api/parent/children", headers=crowd)).json()
        with Session(main.engine) as session:
            for n in range(main.MAX_OBJECTIVES_PER_CHILD - 2):
                session.add(main.Objective(child_id=children[0]["id"], title=f"Objetivo {n}"))
            session.commit()
        too_many = await crowded.post("/api/objectives/plans", headers=crowd, json={"goal": "x", "draft": kept})
        require(too_many.status_code == 422, f"six more objectives must not fit, got {too_many.status_code}")
        require("Desmarque" in too_many.json()["detail"], f"the message says what to do, got {too_many.text}")
        require(count_rows(main.StudyPlan, child_id=children[0]["id"]) == 0, "a refused plan stores nothing")

    # ── Plans leave with the account ────────────────────────────────────────────
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as owner:
        headers = await sign_in(owner, ACCOUNT_A)
        export = (await owner.get("/api/account/export", headers=headers)).json()
        require(any(p["id"] == leaving_id for p in export["study_plans"]), "the export includes the plans")
        deleted = await owner.post("/api/account/delete", headers=headers, json={"password": PASSWORD})
        require(deleted.status_code == 200, f"account deletion failed: {deleted.text}")
        require(count_rows(main.StudyPlan, id=leaving_id) == 0, "deleting the account deletes its plans")


def run() -> None:
    test_validation()
    test_progress_rule()
    test_templates_and_prompts()
    test_generate_path_is_rate_limited_as_ai()
    asyncio.run(run_http())
    print("Study plan checks passed.")


if __name__ == "__main__":
    run()
