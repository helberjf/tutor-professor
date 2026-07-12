"""Prompting and validation for canonical language lesson questions."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

from services.ai_flashcard_service import sanitize_context, validate_card_batch


ALLOWED_LANGUAGE_QUESTION_TYPES = (
    "vocabulary",
    "translation",
    "sentence_completion",
    "grammar",
    "comprehension",
    "contextual_usage",
)


@dataclass(frozen=True)
class ValidatedLanguageQuestion:
    front: str
    back: str
    question_type: str
    supporting_example: str | None = None


def _json_for_prompt(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


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
    return (
        "Crie exatamente 5 perguntas de estudo unicas para a licao abaixo. "
        "Use o idioma-alvo nas perguntas/respostas quando pedagogicamente adequado e "
        "o idioma-base para instrucoes, explicacoes e traducoes.\n"
        f"Titulo: {lesson_title}\n"
        f"Tema: {theme}\n"
        f"Objetivo: {objective}\n"
        f"Idioma-alvo: {target_language}\n"
        f"Idioma-base: {base_language}\n"
        f"Itens da licao: {_json_for_prompt(list(lesson_items))}\n"
        f"Detalhamento das frases: {_json_for_prompt(list(phrase_breakdowns))}\n"
        f"Perguntas existentes (nao repetir): {_json_for_prompt(list(existing_fronts))}\n"
        f"Contexto adicional: {sanitized_context or 'Nenhum contexto adicional.'}\n"
        f"Tipos permitidos: {allowed_types}. Use pelo menos 3 tipos distintos.\n"
        "Retorne somente JSON valido neste formato: "
        '{"questions":[{"front":"...","back":"...","question_type":"grammar",'
        '"supporting_example":"... ou null"}]}. '
        "Cada front deve ter no maximo 500 caracteres, cada back 2000 e cada exemplo 1000."
    )


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
        front = _raw_text(raw, "front", "question")
        back = _raw_text(raw, "back", "answer")
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
