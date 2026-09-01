"""Scoring and composition for the simulado (exam) mode.

The questions mode measures a question over its lifetime; an exam measures a
sitting. So the pieces here are all about one attempt: which questions it draws
from the pool, whether each answer is right, and what the sitting scored.

Everything in this module is pure. The database work lives in main.py.
"""
from __future__ import annotations

import random
import re
from datetime import datetime
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from services.coding_service import programming_question_key

# The AWS associate exams pass at 72% and give roughly two minutes per question.
DEFAULT_PASSING_PERCENT = 72
SECONDS_PER_QUESTION = 120

# Label used when a simulado has no per-domain blueprint, which is the general case.
DEFAULT_DOMAIN = "Geral"

MIN_OPTIONS = 4
MAX_OPTIONS = 6
RESPONSE_TYPES = {"single", "multiple"}
DIFFICULTIES = {"easy", "medium", "hard"}

_OPTION_LABEL_ONLY_RE = re.compile(r"^[A-Fa-f][\).:\-]?$")


@dataclass(frozen=True)
class ValidatedExamQuestion:
    domain: str
    question: str
    question_key: str
    options: list[str]
    correct_options: list[str]
    response_type: str
    explanation: str
    reference_url: str | None
    difficulty: str


# ── Scoring ───────────────────────────────────────────────────────────────────

def _normalize_option(value: object) -> str:
    return " ".join(str(value or "").split()).casefold()


def grade_answer(selected: Iterable[object], correct: Iterable[object]) -> bool:
    """All or nothing, like the real exam: the sets must match exactly.

    Comparing sets also means a repeated selection cannot stand in for a second
    answer, and option order never decides a grade.
    """
    selected_set = {option for option in map(_normalize_option, selected) if option}
    correct_set = {option for option in map(_normalize_option, correct) if option}
    if not correct_set:
        return False
    return selected_set == correct_set


def score_percent(correct: int, total: int) -> int:
    if total <= 0:
        return 0
    return round(max(0, correct) * 100 / total)


def has_passed(percent: int, passing_percent: int = DEFAULT_PASSING_PERCENT) -> bool:
    return percent >= passing_percent


def build_domain_breakdown(questions: Sequence[Any], correct_ids: set[int]) -> dict[str, dict[str, int]]:
    """Per-domain totals for the result screen.

    A domain that was drawn but never answered correctly still reports zero, so
    the weak area shows up instead of disappearing from the chart.
    """
    breakdown: dict[str, dict[str, int]] = {}
    for question in questions:
        domain = str(getattr(question, "domain", "") or DEFAULT_DOMAIN)
        bucket = breakdown.setdefault(domain, {"total": 0, "correct": 0})
        bucket["total"] += 1
        if getattr(question, "id", None) in correct_ids:
            bucket["correct"] += 1
    return breakdown


def duration_minutes_for(question_count: int) -> int:
    return max(1, round(question_count * SECONDS_PER_QUESTION / 60))


def remaining_seconds(started_at: datetime, duration_minutes: int, now: datetime) -> int:
    """Time left in a sitting, measured from when it started.

    The clock belongs to the attempt, not to the screen. Deriving it from
    started_at is what lets someone close the exam by accident, come back, and
    find the same countdown instead of a fresh one.
    """
    if duration_minutes <= 0:
        return 0
    elapsed = (now - started_at).total_seconds()
    return max(0, int(duration_minutes * 60 - elapsed))


# ── Blueprint ─────────────────────────────────────────────────────────────────

def normalize_domains(domains: object) -> list[dict[str, Any]]:
    """Validate a blueprint and rescale its weights to sum to 1.

    An empty blueprint is legal and means "no blueprint": a general simulado just
    shuffles its pool. Only a malformed domain is an error.
    """
    if domains is None:
        return []
    if not isinstance(domains, (list, tuple)):
        raise ValueError("Os dominios do simulado devem ser uma lista.")
    if not domains:
        return []

    normalized: list[dict[str, Any]] = []
    for entry in domains:
        if not isinstance(entry, Mapping):
            raise ValueError("Cada dominio deve ser um objeto com nome e peso.")
        name = " ".join(str(entry.get("name") or "").split())
        if not name:
            raise ValueError("Todo dominio precisa de um nome.")
        try:
            weight = float(entry.get("weight"))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Peso invalido para o dominio {name}.") from exc
        if weight <= 0:
            raise ValueError(f"O peso do dominio {name} deve ser maior que zero.")
        normalized.append({"name": name, "weight": weight})

    if len({domain["name"] for domain in normalized}) != len(normalized):
        raise ValueError("Os dominios do simulado nao podem se repetir.")

    total = sum(domain["weight"] for domain in normalized)
    return [{"name": domain["name"], "weight": domain["weight"] / total} for domain in normalized]


def sample_by_blueprint(
    pool: Sequence[Any],
    domains: object,
    count: int,
    *,
    rng: random.Random | None = None,
) -> list[Any]:
    """Draw one sitting from the pool, respecting the blueprint weights.

    A domain with fewer questions than its quota contributes everything it has
    and the shortfall is filled from the rest of the pool, so a thin pool yields
    a shorter exam instead of repeating questions.
    """
    generator = rng or random.Random()
    if count <= 0 or not pool:
        return []

    normalized = normalize_domains(domains)
    if not normalized:
        # General simulado: no blueprint, so the whole pool is one bag.
        shuffled = list(pool)
        generator.shuffle(shuffled)
        return shuffled[:count]

    by_domain: dict[str, list[Any]] = {domain["name"]: [] for domain in normalized}
    leftovers: list[Any] = []
    for question in pool:
        bucket = by_domain.get(str(getattr(question, "domain", "") or ""))
        if bucket is None:
            leftovers.append(question)
        else:
            bucket.append(question)

    drawn: list[Any] = []
    taken: set[int] = set()
    for domain in normalized:
        available = by_domain[domain["name"]]
        quota = min(len(available), round(domain["weight"] * count))
        for question in generator.sample(available, quota) if quota else []:
            drawn.append(question)
            taken.add(id(question))

    if len(drawn) < count:
        remaining = [question for question in list(pool) + leftovers if id(question) not in taken]
        # dedupe while preserving the pool's own order before shuffling
        unique_remaining = list({id(question): question for question in remaining}.values())
        generator.shuffle(unique_remaining)
        drawn.extend(unique_remaining[: count - len(drawn)])

    generator.shuffle(drawn)
    return drawn[:count]


# ── Question validation ───────────────────────────────────────────────────────

def _clean(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit].strip()


def _record(raw: object) -> Mapping[str, object]:
    if isinstance(raw, Mapping):
        return raw
    model_dump = getattr(raw, "model_dump", None)
    if callable(model_dump):
        return model_dump()
    raise ValueError("Cada questao do simulado deve ser um objeto JSON.")


def validate_exam_question_batch(
    raw_questions: Sequence[object],
    *,
    domains: object,
    existing_questions: Sequence[str],
) -> list[ValidatedExamQuestion]:
    """The exam contract: 4-6 complete options, a matching answer key, a domain."""
    if not isinstance(raw_questions, (list, tuple)) or not raw_questions:
        raise ValueError("Envie pelo menos uma questao de simulado.")

    # With no blueprint the domain is a free label, kept only for the breakdown.
    blueprint = normalize_domains(domains)
    domain_names = {domain["name"].casefold() for domain in blueprint}
    existing_keys = {programming_question_key(question) for question in existing_questions}
    batch_keys: set[str] = set()
    validated: list[ValidatedExamQuestion] = []

    for raw in raw_questions:
        record = _record(raw)

        domain = _clean(record.get("domain"), 120) or DEFAULT_DOMAIN
        if blueprint and domain.casefold() not in domain_names:
            raise ValueError(f"Dominio fora do blueprint do simulado: {domain}")

        question = _clean(record.get("question"), 1000)
        explanation = _clean(record.get("explanation"), 2000)
        if not question or not explanation:
            raise ValueError("Questao e explicacao do simulado nao podem ficar vazias.")

        raw_options = record.get("options")
        if not isinstance(raw_options, (list, tuple)):
            raise ValueError("As alternativas do simulado devem ser uma lista.")
        options = [_clean(option, 500) for option in raw_options]
        if not (MIN_OPTIONS <= len(options) <= MAX_OPTIONS):
            raise ValueError(
                f"Cada questao precisa de {MIN_OPTIONS} a {MAX_OPTIONS} alternativas, recebeu {len(options)}."
            )
        if any(not option for option in options):
            raise ValueError("Nenhuma alternativa pode ficar vazia.")
        if any(_OPTION_LABEL_ONLY_RE.fullmatch(option) for option in options):
            raise ValueError("As alternativas devem trazer o texto da resposta, nao apenas a letra.")
        if len({option.casefold() for option in options}) != len(options):
            raise ValueError("As alternativas de uma questao nao podem se repetir.")

        raw_correct = record.get("correct_options")
        if not isinstance(raw_correct, (list, tuple)):
            raise ValueError("A chave de resposta do simulado deve ser uma lista.")
        by_fold = {option.casefold(): option for option in options}
        correct_options: list[str] = []
        for entry in raw_correct:
            match = by_fold.get(_clean(entry, 500).casefold())
            if match is None:
                raise ValueError("Toda resposta correta deve ser uma das alternativas da questao.")
            if match not in correct_options:
                correct_options.append(match)
        if not correct_options:
            raise ValueError("Toda questao do simulado precisa de pelo menos uma resposta correta.")
        if len(correct_options) == len(options):
            raise ValueError("Uma questao nao pode ter todas as alternativas corretas.")

        response_type = _clean(record.get("response_type"), 20).lower() or (
            "multiple" if len(correct_options) > 1 else "single"
        )
        if response_type not in RESPONSE_TYPES:
            raise ValueError(f"Tipo de resposta invalido: {response_type}")
        if response_type == "single" and len(correct_options) != 1:
            raise ValueError("Uma questao de resposta unica precisa de exatamente uma correta.")
        if response_type == "multiple" and len(correct_options) < 2:
            raise ValueError("Uma questao de multipla resposta precisa de pelo menos duas corretas.")

        difficulty = _clean(record.get("difficulty"), 20).lower() or "medium"
        if difficulty not in DIFFICULTIES:
            raise ValueError(f"Dificuldade invalida: {difficulty}")

        question_key = programming_question_key(question)
        if not question_key or question_key in existing_keys or question_key in batch_keys:
            raise ValueError("As questoes do simulado nao podem se repetir.")
        batch_keys.add(question_key)

        reference_url = _clean(record.get("reference_url"), 500) or None
        validated.append(
            ValidatedExamQuestion(
                domain=domain,
                question=question,
                question_key=question_key,
                options=options,
                correct_options=correct_options,
                response_type=response_type,
                explanation=explanation,
                reference_url=reference_url,
                difficulty=difficulty,
            )
        )

    return validated
