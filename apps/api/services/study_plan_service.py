"""Study plans: a strategy for one goal, drafted by the AI or from a model.

Everything here is pure: the endpoints fetch the data, this module decides what
a usable plan looks like and what the AI is asked. That keeps the one part that
talks to a provider (``generate_json_text``) out of the logic worth testing.

The method the AI is asked to follow is the one that makes a plan worth having:
name the biggest bottleneck, rank priorities by how much they close it, prefer
turning existing knowledge into proof over studying more, make every item
checkable, and say what to leave alone for now.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from services.ai_flashcard_service import normalize_front
from services.audience import audience_note, content_rule


OBJECTIVE_AREAS = ("free", "language", "coding", "diverse", "exam")
# What a model or a person may plausibly write instead of the area ids. Keys
# are written as people write them and folded the same way the input is.
AREA_ALIASES = {
    normalize_front(alias): area
    for alias, area in {
        "idioma": "language",
        "idiomas": "language",
        "inglês": "language",
        "english": "language",
        "languages": "language",
        "programação": "coding",
        "programming": "coding",
        "code": "coding",
        "gerais": "diverse",
        "general": "diverse",
        "other": "diverse",
        "subjects": "diverse",
        "simulado": "exam",
        "simulados": "exam",
        "exams": "exam",
        "certification": "exam",
        "livre": "free",
        "career": "free",
    }.items()
}

MAX_PRIORITIES = 10
MAX_ITEMS_PER_PRIORITY = 6
MAX_AVOID = 8
MAX_PATH_STEPS = 12
MAX_PROFILE_CHARS = 4000
MAX_SNAPSHOT_LINES = 24

TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "content" / "plan-templates"


@dataclass(frozen=True)
class PlanItemDraft:
    title: str
    notes: str | None = None
    area: str = "free"
    weight: int = 1


@dataclass(frozen=True)
class PlanPriorityDraft:
    title: str
    why: str | None = None
    icon_emoji: str | None = None
    items: tuple[PlanItemDraft, ...] = ()
    # Revision only: the label (P1, P2...) of the current priority this continues.
    continues: str | None = None


@dataclass(frozen=True)
class PlanDraft:
    title: str
    diagnosis: str
    priorities: tuple[PlanPriorityDraft, ...]
    focus: str | None = None
    avoid: tuple[tuple[str, str | None], ...] = ()
    shortest_path: tuple[str, ...] = ()


@dataclass(frozen=True)
class PlanTemplate:
    slug: str
    title: str
    summary: str
    draft: PlanDraft


@dataclass(frozen=True)
class CurrentPriority:
    """A priority of the plan being revised, as the AI will see it."""

    label: str
    objective_id: int
    title: str
    percent: int
    items: tuple[tuple[str, bool], ...] = field(default_factory=tuple)


# ── Normalization ─────────────────────────────────────────────────────────────

def _limited_text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit].rstrip()


def _optional_text(value: Any, limit: int) -> str | None:
    text = _limited_text(value, limit)
    return text or None


def normalize_area(value: Any) -> str:
    key = normalize_front(value)
    if key in OBJECTIVE_AREAS:
        return key
    return AREA_ALIASES.get(key, "free")


def normalize_weight(value: Any) -> int:
    try:
        weight = int(round(float(value)))
    except (TypeError, ValueError):
        return 1
    return max(1, min(10, weight))


def _normalize_item(raw: Any) -> PlanItemDraft | None:
    if isinstance(raw, str):
        raw = {"title": raw}
    if not isinstance(raw, Mapping):
        return None
    title = _limited_text(raw.get("title") or raw.get("task"), 200)
    if not normalize_front(title):
        return None
    return PlanItemDraft(
        title=title,
        notes=_optional_text(raw.get("notes") or raw.get("how"), 1000),
        area=normalize_area(raw.get("area")),
        weight=normalize_weight(raw.get("weight", 1)),
    )


def _normalize_priority(raw: Any, allowed_continues: set[str]) -> PlanPriorityDraft | None:
    if not isinstance(raw, Mapping):
        return None
    title = _limited_text(raw.get("title"), 120)
    if not normalize_front(title):
        return None

    items: list[PlanItemDraft] = []
    seen: set[str] = set()
    for raw_item in raw.get("items") or []:
        item = _normalize_item(raw_item)
        if item is None:
            continue
        key = normalize_front(item.title)
        if key in seen:
            continue
        seen.add(key)
        items.append(item)
        if len(items) >= MAX_ITEMS_PER_PRIORITY:
            break

    continues = _limited_text(raw.get("continues"), 12).upper() or None
    if continues not in allowed_continues:
        continues = None
    # A new priority with nothing to do is not a priority. A continued one may
    # add nothing: its existing items carry on.
    if not items and continues is None:
        return None

    return PlanPriorityDraft(
        title=title,
        why=_optional_text(raw.get("why") or raw.get("rationale"), 500),
        icon_emoji=_optional_text(raw.get("icon_emoji") or raw.get("emoji"), 10),
        items=tuple(items),
        continues=continues,
    )


def validate_plan_draft(
    raw: Any,
    *,
    allowed_continues: Iterable[str] = (),
) -> PlanDraft:
    """Turn whatever the AI (or a model file) sent into a plan, or refuse it.

    Limits are enforced by trimming rather than failing, because a plan with
    seven good items is more useful than an error about the eighth. What cannot
    be repaired — no title, no diagnosis, no usable priority — raises ValueError.
    """

    if not isinstance(raw, Mapping):
        raise ValueError("The plan must be a JSON object")

    title = _limited_text(raw.get("title"), 120)
    if not normalize_front(title):
        raise ValueError("The plan needs a title")
    diagnosis = _limited_text(raw.get("diagnosis"), 1000)
    if not normalize_front(diagnosis):
        raise ValueError("The plan needs a diagnosis")

    allowed = {label.upper() for label in allowed_continues}
    priorities: list[PlanPriorityDraft] = []
    seen_titles: set[str] = set()
    used_continues: set[str] = set()
    raw_priorities = raw.get("priorities")
    for raw_priority in raw_priorities if isinstance(raw_priorities, list) else []:
        priority = _normalize_priority(raw_priority, allowed - used_continues)
        if priority is None:
            continue
        key = normalize_front(priority.title)
        if key in seen_titles:
            continue
        seen_titles.add(key)
        if priority.continues:
            used_continues.add(priority.continues)
        priorities.append(priority)
        if len(priorities) >= MAX_PRIORITIES:
            break
    if not priorities:
        raise ValueError("The plan needs at least one priority with items")

    avoid: list[tuple[str, str | None]] = []
    seen_avoid: set[str] = set()
    raw_avoid = raw.get("avoid")
    for entry in raw_avoid if isinstance(raw_avoid, list) else []:
        if isinstance(entry, str):
            entry = {"title": entry}
        if not isinstance(entry, Mapping):
            continue
        avoid_title = _limited_text(entry.get("title"), 160)
        key = normalize_front(avoid_title)
        if not key or key in seen_avoid:
            continue
        seen_avoid.add(key)
        avoid.append((avoid_title, _optional_text(entry.get("reason"), 300)))
        if len(avoid) >= MAX_AVOID:
            break

    path: list[str] = []
    raw_path = raw.get("shortest_path")
    for step in raw_path if isinstance(raw_path, list) else []:
        text = _limited_text(step, 120)
        if normalize_front(text):
            path.append(text)
        if len(path) >= MAX_PATH_STEPS:
            break

    return PlanDraft(
        title=title,
        diagnosis=diagnosis,
        focus=_optional_text(raw.get("focus"), 300),
        priorities=tuple(priorities),
        avoid=tuple(avoid),
        shortest_path=tuple(path),
    )


def parse_plan_response(
    text: str,
    *,
    allowed_continues: Iterable[str] = (),
) -> PlanDraft:
    """Parse a provider's answer, tolerating the code fences some models add."""

    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else ""
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("The answer has no JSON object")
    try:
        payload = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError("The answer is not valid JSON") from exc
    return validate_plan_draft(payload, allowed_continues=allowed_continues)


def draft_to_payload(draft: PlanDraft, *, source: str) -> dict[str, Any]:
    """The draft in the shape PlanDraftSchema accepts (``continues`` left out)."""

    return {
        "title": draft.title,
        "diagnosis": draft.diagnosis,
        "focus": draft.focus,
        "priorities": [
            {
                "title": priority.title,
                "why": priority.why,
                "icon_emoji": priority.icon_emoji,
                "items": [
                    {
                        "title": item.title,
                        "notes": item.notes,
                        "area": item.area,
                        "weight": item.weight,
                    }
                    for item in priority.items
                ],
            }
            for priority in draft.priorities
        ],
        "avoid": [{"title": title, "reason": reason} for title, reason in draft.avoid],
        "shortest_path": list(draft.shortest_path),
        "source": source,
    }


# ── Progress ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PriorityProgress:
    objective_id: int
    plan_order: int | None
    percent: int
    item_count: int
    active: bool


def plan_progress(priorities: Sequence[PriorityProgress]) -> tuple[int, int | None, int]:
    """(overall percent, next objective id, achieved count) for one plan.

    The overall number is the plain mean of the active priorities, the same
    rule the objectives board uses, so the two never disagree. The next step is
    the first active priority, in plan order, that is not finished — the thing
    to work on now.
    """

    active = sorted(
        (priority for priority in priorities if priority.active),
        key=lambda priority: (
            priority.plan_order is None,
            priority.plan_order or 0,
            priority.objective_id,
        ),
    )
    if not active:
        return 0, None, 0
    finished = [priority for priority in active if priority.item_count > 0 and priority.percent >= 100]
    pending = [priority for priority in active if priority not in finished]
    overall = round(sum(priority.percent for priority in active) / len(active))
    return overall, (pending[0].objective_id if pending else None), len(finished)


# ── Ready-made models ─────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def load_plan_templates() -> dict[str, PlanTemplate]:
    """Every model in content/plan-templates, validated like an AI answer."""

    templates: dict[str, PlanTemplate] = {}
    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        slug = _limited_text(payload.get("slug") or path.stem, 60)
        templates[slug] = PlanTemplate(
            slug=slug,
            title=_limited_text(payload.get("title"), 120),
            summary=_limited_text(payload.get("summary"), 300),
            draft=validate_plan_draft(payload.get("draft")),
        )
    return templates


# ── What the AI is told ───────────────────────────────────────────────────────

def build_learner_snapshot(
    *,
    target_language: str | None = None,
    language_level: int | None = None,
    streak_days: int = 0,
    last_study_date: date | None = None,
    active_days_30: int = 0,
    activities_30: int = 0,
    question_subjects: Sequence[tuple[str, int, int]] = (),
    coding_subjects: Sequence[tuple[str, int, int]] = (),
    exams: Sequence[tuple[str, int | None, int]] = (),
    leetcode_categories: Sequence[tuple[str, int]] = (),
    objectives: Sequence[tuple[str, int]] = (),
) -> list[str]:
    """Short lines describing the learner's recorded study.

    The same lines are shown on screen before anything is sent, so they are
    written for the person as much as for the model. The learner's name is
    deliberately absent: the plan does not need it.
    """

    lines: list[str] = []
    if target_language:
        level = f" (nível {language_level} no app)" if language_level else ""
        lines.append(f"Idioma em estudo: {target_language}{level}.")
    if streak_days or last_study_date:
        last = f", último estudo em {last_study_date.isoformat()}" if last_study_date else ""
        lines.append(f"Sequência atual: {streak_days} dias{last}.")
    if activities_30:
        lines.append(
            f"Últimos 30 dias: {activities_30} atividades registradas em {active_days_30} dias diferentes."
        )
    if question_subjects:
        parts = []
        for name, correct, wrong in list(question_subjects)[:6]:
            total = correct + wrong
            accuracy = round(correct * 100 / total) if total else 0
            parts.append(f"{name} ({total} respondidas, {accuracy}% de acerto)")
        lines.append("Questões por matéria: " + "; ".join(parts) + ".")
    if coding_subjects:
        parts = [
            f"{name} ({studied} de {total} tópicos estudados)"
            for name, studied, total in list(coding_subjects)[:8]
        ]
        lines.append("Matérias de programação: " + "; ".join(parts) + ".")
    if exams:
        parts = []
        for title, best, attempts in list(exams)[:5]:
            if attempts:
                parts.append(f"{title} (melhor nota {best if best is not None else 0}%, {attempts} tentativas)")
            else:
                parts.append(f"{title} (ainda sem tentativa)")
        lines.append("Simulados: " + "; ".join(parts) + ".")
    if leetcode_categories:
        parts = [f"{category} ({count})" for category, count in list(leetcode_categories)[:8]]
        lines.append("Métodos de LeetCode treinados: " + ", ".join(parts) + ".")
    if objectives:
        parts = [f"{title} ({percent}%)" for title, percent in list(objectives)[:8]]
        lines.append("Objetivos ativos: " + "; ".join(parts) + ".")
    return lines[:MAX_SNAPSHOT_LINES]


PLAN_JSON_SHAPE = """{
  "title": "short plan title",
  "diagnosis": "the single biggest bottleneck, in one or two sentences",
  "focus": "the positioning or thesis the whole plan serves",
  "priorities": [
    {
      "title": "short priority title",
      "why": "why this closes the bottleneck",
      "icon_emoji": "one emoji",
      "items": [
        {"title": "concrete, checkable task", "notes": "how to do it", "area": "free", "weight": 3}
      ]
    }
  ],
  "avoid": [{"title": "what not to prioritize now", "reason": "why it can wait"}],
  "shortest_path": ["first step", "second step"]
}"""


def build_plan_prompts(
    *,
    goal: str,
    profile: str | None,
    weekly_hours: int | None,
    target_date: date | None,
    snapshot: Sequence[str],
    base_language: str,
    age_group: str | None,
    today: date,
    current_plan: tuple[str, Sequence[CurrentPriority]] | None = None,
) -> tuple[str, str]:
    """The system and user prompts for a new plan or a revision."""

    language = _limited_text(base_language, 40) or "Portuguese"
    system_parts = [
        "You are a pragmatic study and career strategist inside a learning app. "
        "You turn one goal into a short, ordered plan the learner can execute and measure.",
        "Method:\n"
        "1. Diagnose the single biggest bottleneck between where the learner is and the goal. "
        "Say it plainly. It is often not missing knowledge: it can be how the learner presents "
        "what they know, proof of experience, process, or practice under realistic conditions.\n"
        "2. Rank priorities by how much each one closes that bottleneck, not by how interesting "
        "the topic is. Prefer actions that turn what the learner already knows into visible proof "
        "over accumulating more study.\n"
        "3. Every item must be concrete and checkable, with numbers where they help "
        "(\"write 8 STAR stories\", \"solve 20 Easy/Medium array problems\", "
        "\"send 5 applications per day for two weeks\"). Never write vague items such as \"study more\".\n"
        "4. Fit the plan to the weekly hours and the deadline when they are given. "
        "Fewer priorities done well beat a long list.\n"
        "5. List what NOT to prioritize now, each with the reason: things that feel productive "
        "but do not move this goal.\n"
        "6. Give the shortest path as an ordered list of short steps.",
        audience_note(age_group),
        content_rule(age_group),
        f"Write every human-readable string in {language}, with correct spelling and accents. "
        "Keep titles under 60 characters and notes under 160 characters.",
        "Areas: language = language study in this app; coding = programming; "
        "diverse = other school or exam subjects; exam = timed practice tests; "
        "free = anything else (CV, LinkedIn, applications, reading, projects).",
        "Use 4 to 8 priorities with 2 to 5 items each. Weight goes from 1 for a small task "
        "to 10 for the largest one.",
        "Return only a JSON object with this shape:\n" + PLAN_JSON_SHAPE,
    ]
    if current_plan is not None:
        system_parts.append(
            "This is a REVISION of the learner's current plan. Each current priority has a "
            "label such as P1. For every priority you keep, add \"continues\": \"<label>\" and "
            "list only NEW items to add: the existing items stay automatically, done or not, so "
            "never repeat them. Priorities you leave out will be offered for archiving. You may "
            "add new priorities (without \"continues\") and change the order. Base the revision "
            "on the progress shown: finished work should move the plan forward, and a stalled "
            "priority may need smaller items."
        )
    system = "\n\n".join(part for part in system_parts if part)

    profile_text = str(profile or "").strip()[:MAX_PROFILE_CHARS]
    user_parts = [
        f"Today: {today.isoformat()}",
        f"Goal: {_limited_text(goal, 500)}",
        f"Weekly hours available: {weekly_hours if weekly_hours else 'not informed'}",
        f"Deadline: {target_date.isoformat() if target_date else 'none'}",
        "About the learner, in their own words:\n<<<\n"
        + (profile_text or "(not informed)")
        + "\n>>>",
        "What the app has recorded about the learner:\n"
        + ("\n".join(f"- {line}" for line in snapshot) if snapshot else "(not shared by the learner)"),
    ]
    if current_plan is not None:
        diagnosis, priorities = current_plan
        described = [f"Current diagnosis: {_limited_text(diagnosis, 1000) or '(none)'}"]
        for priority in priorities:
            described.append(f"{priority.label}. {priority.title} - {priority.percent}% done")
            for title, done in priority.items:
                described.append(f"   [{'x' if done else ' '}] {title}")
        user_parts.append("Current plan:\n" + "\n".join(described))
    return system, "\n\n".join(user_parts)
