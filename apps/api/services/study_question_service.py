"""Multiple-choice question generation for study areas outside programming.

The programming curriculum generates questions from a saved topic lesson
(``coding_service``). Diverse subjects and English lessons have no such lesson
object, so the caller passes whatever study material it already has as plain
text and this module turns it into the same validated question shape.
"""
from __future__ import annotations

import json

from services.ai_flashcard_service import sanitize_context
from services.coding_service import (
    MAX_EXISTING_QUESTION_PROMPTS,
    ValidatedProgrammingQuestion,
    validate_programming_question_batch,
)
from services.phrase_generator_service import AIProviderConfig, PhraseGenerationService

QUESTIONS_PER_BATCH = 5
MAX_SOURCE_CONTENT_CHARS = 6000

AREA_LABELS = {
    "diverse": "matéria de estudo livre",
    "english": "aula de inglês",
}

_phrase_service = PhraseGenerationService()

_SYSTEM_TEXT = (
    "You are an expert educator building exam-style practice questions. "
    "Return ONLY valid JSON with no markdown fences, no commentary, and no extra keys. "
    "The JSON must match the schema exactly."
)

_QUESTIONS_PROMPT_TEMPLATE = """\
Create exactly {expected_count} multiple-choice questions for the study material below.

Area: {area_label}
Subject: {subject_name}
Topic: {topic_title}

Study material:
{source_content}

Existing question prompts (do not repeat or paraphrase these):
{existing_questions}

User instructions:
{user_context}

Return a JSON object with exactly this schema:
{{
  "questions": [
    {{
      "question": "string",
      "options": ["primeira alternativa completa", "segunda alternativa completa", "terceira alternativa completa", "quarta alternativa completa"],
      "correct_option": "exact text of the correct option",
      "explanation": "string"
    }}
  ]
}}

Rules:
- Return exactly {expected_count} questions
- Each question must have exactly 4 options
- Each option must be a complete answer text, never only a label such as "A", "B", "C", or "D"
- correct_option must exactly match one of the complete option texts, never only the option letter
- Test what the study material actually teaches, never unrelated material
- Avoid existing prompts and close paraphrases
- The explanation must say why the correct option is correct, not merely restate it
- Prefer reasoning, application and common pitfalls over pure definitions
{language_rule}
"""

_LANGUAGE_RULES = {
    "diverse": "- All text must be in Portuguese (Brazil)",
    "english": (
        "- Questions, options and explanations are for a Portuguese-speaking learner of English: "
        "write the explanation in Portuguese (Brazil) and keep the English being taught in English"
    ),
}


def build_source_content(blocks: list[str]) -> str:
    """Join study material blocks into the bounded text handed to the model."""
    cleaned = [" ".join(str(block).split()) for block in blocks]
    joined = "\n".join(block for block in cleaned if block)
    if not joined:
        return "(sem material salvo; gere questões introdutórias sobre o tópico)"
    return joined[:MAX_SOURCE_CONTENT_CHARS]


def build_questions_prompt(
    *,
    area: str,
    subject_name: str,
    topic_title: str,
    source_content: str,
    existing_questions: list[str],
    user_context: str,
    expected_count: int = QUESTIONS_PER_BATCH,
) -> str:
    bounded_questions = [
        " ".join(str(question).split())[:240]
        for question in existing_questions[-MAX_EXISTING_QUESTION_PROMPTS:]
    ]
    return _QUESTIONS_PROMPT_TEMPLATE.format(
        expected_count=expected_count,
        area_label=AREA_LABELS.get(area, AREA_LABELS["diverse"]),
        subject_name=" ".join(str(subject_name).split())[:200],
        topic_title=" ".join(str(topic_title).split())[:300],
        source_content=source_content or "(sem material salvo)",
        existing_questions="\n".join(bounded_questions) or "(nenhuma)",
        user_context=sanitize_context(user_context) or "(nenhuma)",
        language_rule=_LANGUAGE_RULES.get(area, _LANGUAGE_RULES["diverse"]),
    )


def generate_study_questions(
    *,
    area: str,
    subject_name: str,
    topic_title: str,
    source_content: str,
    existing_questions: list[str],
    user_context: str,
    ai_config: AIProviderConfig,
    expected_count: int = QUESTIONS_PER_BATCH,
) -> list[dict]:
    prompt = build_questions_prompt(
        area=area,
        subject_name=subject_name,
        topic_title=topic_title,
        source_content=source_content,
        existing_questions=existing_questions,
        user_context=user_context,
        expected_count=expected_count,
    )
    raw = _phrase_service.generate_json_text(
        system_text=_SYSTEM_TEXT,
        prompt=prompt,
        temperature=0.6,
        ai_config=ai_config,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("IA retornou JSON invalido para as questoes do simulado.") from exc
    questions = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(questions, list):
        raise RuntimeError("IA nao retornou uma lista de questoes.")
    return questions


def validate_study_question_batch(
    raw_questions: list[object],
    *,
    expected_count: int = QUESTIONS_PER_BATCH,
    existing_questions: list[str],
) -> list[ValidatedProgrammingQuestion]:
    """Same contract as the programming batch: 4 complete options, unique prompts."""
    return validate_programming_question_batch(
        raw_questions,
        expected_count=expected_count,
        existing_questions=existing_questions,
    )
