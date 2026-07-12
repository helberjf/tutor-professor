"""Prompting and validation for canonical language lesson questions."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Mapping

from sqlmodel import Session

from models.database import LessonQuestion
from services.ai_flashcard_service import normalize_front, sanitize_context, validate_card_batch


ALLOWED_LANGUAGE_QUESTION_TYPES = (
    "vocabulary",
    "translation",
    "sentence_completion",
    "grammar",
    "comprehension",
    "contextual_usage",
)
MAX_LESSON_QUESTIONS = 200
MAX_EXISTING_FRONTS_IN_PROMPT = 100
MAX_LANGUAGE_QUESTION_PROMPT_CHARS = 40_000
_MAX_ITEM_SECTION_CHARS = 6_000
_MAX_BREAKDOWN_SECTION_CHARS = 8_000


@dataclass(frozen=True)
class ValidatedLanguageQuestion:
    front: str
    back: str
    question_type: str
    supporting_example: str | None = None


def front_key_for(front: str) -> str:
    """Return the database identity for an accent/punctuation-insensitive front."""
    return hashlib.sha256(normalize_front(front).encode("utf-8")).hexdigest()


def _bounded_prompt_value(value: Any, *, depth: int = 0, list_limit: int = 30) -> Any:
    if depth >= 4:
        if isinstance(value, Mapping):
            return {"truncated": True}
        if isinstance(value, (list, tuple)):
            return ["truncated"]
        return sanitize_context(value)[:300]
    if isinstance(value, Mapping):
        return {
            sanitize_context(key)[:80]: _bounded_prompt_value(
                item, depth=depth + 1, list_limit=list_limit
            )
            for key, item in list(value.items())[:20]
        }
    if isinstance(value, (list, tuple)):
        return [
            _bounded_prompt_value(item, depth=depth + 1, list_limit=list_limit)
            for item in value[:list_limit]
        ]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return sanitize_context(value)[:300]


def _json_for_prompt(value: Any, limit: int, *, list_limit: int = 30) -> str:
    encoded = json.dumps(
        _bounded_prompt_value(value, list_limit=list_limit),
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return encoded[:limit]


def build_language_questions_prompt(
    *,
    lesson_title: str,
    theme: str,
    objective: str,
    target_language: str,
    base_language: str,
    lesson_items: Iterable[Mapping[str, Any]],
    phrase_breakdowns: Iterable[Mapping[str, Any]],
    existing_fronts: Iterable[str],
    context: str | None,
) -> str:
    """Build a language-aware prompt without trusting client language labels."""
    sanitized_context = sanitize_context(context)
    allowed_types = ", ".join(ALLOWED_LANGUAGE_QUESTION_TYPES)
    retained_fronts = [
        sanitize_context(front)[:160]
        for front in list(existing_fronts)[-MAX_EXISTING_FRONTS_IN_PROMPT:]
    ]
    prompt = (
        "Crie exatamente 5 perguntas de estudo unicas para a licao abaixo. "
        "Use o idioma-alvo nas perguntas/respostas quando pedagogicamente adequado e "
        "o idioma-base para instrucoes, explicacoes e traducoes.\n"
        f"Titulo: {sanitize_context(lesson_title)[:200]}\n"
        f"Tema: {sanitize_context(theme)[:200]}\n"
        f"Objetivo: {sanitize_context(objective)[:1000]}\n"
        f"Idioma-alvo: {sanitize_context(target_language)[:40]}\n"
        f"Idioma-base: {sanitize_context(base_language)[:40]}\n"
        f"Itens da licao: {_json_for_prompt(list(lesson_items), _MAX_ITEM_SECTION_CHARS)}\n"
        "Detalhamento das frases: "
        f"{_json_for_prompt(list(phrase_breakdowns), _MAX_BREAKDOWN_SECTION_CHARS)}\n"
        "Perguntas existentes (nao repetir): "
        f"{_json_for_prompt(retained_fronts, 20_000, list_limit=MAX_EXISTING_FRONTS_IN_PROMPT)}\n"
        f"Contexto adicional: {sanitized_context or 'Nenhum contexto adicional.'}\n"
        f"Tipos permitidos: {allowed_types}. Use pelo menos 3 tipos distintos.\n"
        "Retorne somente JSON valido neste formato: "
        '{"questions":[{"front":"...","back":"...","question_type":"grammar",'
        '"supporting_example":"... ou null"}]}. '
        "Cada front deve ter no maximo 500 caracteres, cada back 2000 e cada exemplo 1000."
    )
    return prompt[:MAX_LANGUAGE_QUESTION_PROMPT_CHARS]


def _raw_text(raw: Mapping[str, Any], primary: str, fallback: str | None = None) -> str:
    value = raw.get(primary)
    if value is None and fallback is not None:
        value = raw.get(fallback)
    return str(value or "").strip()


def validate_language_question_batch(
    raw_questions: Iterable[object], existing_fronts: Iterable[str]
) -> list[ValidatedLanguageQuestion]:
    """Validate the full five-question batch before any database mutation."""
    questions = list(raw_questions)
    for raw in questions:
        if not isinstance(raw, Mapping):
            raise ValueError("Each question must be a JSON object")
        for field in ("front", "back", "question_type"):
            if not isinstance(raw.get(field), str):
                raise ValueError(f"{field} must be a string")
        if raw.get("supporting_example") is not None and not isinstance(
            raw.get("supporting_example"), str
        ):
            raise ValueError("supporting_example must be a string or null")
        front = _raw_text(raw, "front")
        back = _raw_text(raw, "back")
        question_type = _raw_text(raw, "question_type")
        example = _raw_text(raw, "supporting_example")
        if len(front) > 500:
            raise ValueError("Question front must have at most 500 characters")
        if len(back) > 2000:
            raise ValueError("Question back must have at most 2000 characters")
        if len(question_type) > 40:
            raise ValueError("Question type must have at most 40 characters")
        if len(example) > 1000:
            raise ValueError("Supporting example must have at most 1000 characters")
        if question_type not in ALLOWED_LANGUAGE_QUESTION_TYPES:
            raise ValueError(f"Unsupported question type: {question_type or '(empty)'}")
        if not front.endswith(("?", "？")):
            raise ValueError("Each item must be written as a question")

    validated_cards = validate_card_batch(questions, existing_fronts)
    question_types = {card.question_type for card in validated_cards}
    if len(question_types) < 3:
        raise ValueError("Language question batches require at least three distinct types")

    return [
        ValidatedLanguageQuestion(
            front=card.front,
            back=card.back,
            question_type=card.question_type or "",
            supporting_example=(
                _raw_text(raw, "supporting_example") or None
                if isinstance(raw, Mapping)
                else None
            ),
        )
        for raw, card in zip(questions, validated_cards)
    ]


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def register_lesson_question_attempt(
    *,
    session: Session,
    child_id: int,
    lesson_question_id: int,
    correct: bool,
    now: datetime | None = None,
) -> LessonQuestion:
    """Apply the vocabulary review schedule to one child-owned lesson question."""
    question = session.get(LessonQuestion, lesson_question_id)
    if question is None or question.child_id != child_id:
        raise ValueError("Lesson question not found")

    reviewed_at = _utc_naive(now or datetime.utcnow())
    question.last_reviewed = reviewed_at
    question.attempt_count += 1

    if correct:
        question.correct_count += 1
        question.streak += 1
        question.difficulty_score = max(
            0.1,
            question.difficulty_score - 0.12 - min(question.streak, 3) * 0.03,
        )
        schedule_hours = [4, 12, 24, 72, 168]
        base_hours = schedule_hours[min(question.streak - 1, len(schedule_hours) - 1)]
        spacing_multiplier = max(0.5, 1.15 - question.difficulty_score)
        question.next_review = reviewed_at + timedelta(hours=base_hours * spacing_multiplier)
    else:
        question.error_count += 1
        question.streak = 0
        question.difficulty_score = min(1.0, question.difficulty_score + 0.25)
        retry_minutes = 5 if question.error_count >= 3 else 15
        question.next_review = reviewed_at + timedelta(minutes=retry_minutes)

    session.add(question)
    return question
