from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlmodel import Session, select

from models.database import CodingReviewItem, ProgrammingFlashcard
from schemas.schemas import CodingReviewCardSchema, TopicAIContentSchema
from services.phrase_generator_service import AIProviderConfig, PhraseGenerationService

_phrase_service = PhraseGenerationService()

VALID_TOPIC_STATUSES = {"not_started", "studied", "mastered"}


# ── SM-2 helpers ──────────────────────────────────────────────────────────────

def compute_coding_review_priority(item: CodingReviewItem, now: datetime | None = None) -> float:
    now = now or datetime.utcnow()
    overdue_hours = 0.0
    if item.next_review <= now:
        overdue_hours = (now - item.next_review).total_seconds() / 3600
    return (
        item.difficulty_score * 5
        + item.error_count * 1.8
        + max(item.attempt_count - item.correct_count, 0) * 0.5
        + min(overdue_hours, 12)
        - item.streak * 0.35
    )


def register_coding_review_attempt(
    session: Session,
    child_id: int,
    review_item_id: int,
    correct: bool,
) -> CodingReviewItem:
    item = session.get(CodingReviewItem, review_item_id)
    if item is None or item.child_id != child_id:
        raise ValueError(f"CodingReviewItem {review_item_id} not found for child {child_id}")
    now = datetime.utcnow()
    item.last_reviewed = now
    item.attempt_count += 1
    if correct:
        item.correct_count += 1
        item.streak += 1
        item.difficulty_score = max(
            0.1,
            item.difficulty_score - 0.12 - min(item.streak, 3) * 0.03,
        )
        schedule_hours = [4, 12, 24, 72, 168]
        base_hours = schedule_hours[min(item.streak - 1, len(schedule_hours) - 1)]
        spacing_multiplier = max(0.5, 1.15 - item.difficulty_score)
        item.next_review = now + timedelta(hours=base_hours * spacing_multiplier)
    else:
        item.error_count += 1
        item.streak = 0
        item.difficulty_score = min(1.0, item.difficulty_score + 0.25)
        retry_minutes = 5 if item.error_count >= 3 else 15
        item.next_review = now + timedelta(minutes=retry_minutes)
    session.add(item)
    return item


def build_coding_review_cards(
    session: Session,
    child_id: int,
    subject_id: int | None = None,
    limit: int = 20,
) -> list[CodingReviewCardSchema]:
    now = datetime.utcnow()
    items = session.exec(
        select(CodingReviewItem).where(
            CodingReviewItem.child_id == child_id,
            CodingReviewItem.next_review <= now,
        )
    ).all()
    if subject_id is not None:
        filtered = []
        for item in items:
            fc = session.get(ProgrammingFlashcard, item.flashcard_id)
            if fc and fc.subject_id == subject_id:
                filtered.append(item)
        items = filtered
    items_sorted = sorted(items, key=lambda i: compute_coding_review_priority(i, now), reverse=True)
    cards: list[CodingReviewCardSchema] = []
    for item in items_sorted[:limit]:
        fc = session.get(ProgrammingFlashcard, item.flashcard_id)
        if fc is None:
            continue
        cards.append(
            CodingReviewCardSchema(
                review_item_id=item.id or 0,
                flashcard_id=fc.id or 0,
                subject_id=fc.subject_id,
                front=fc.front,
                back=fc.back,
                code_example=fc.code_example,
                difficulty_score=item.difficulty_score,
                error_count=item.error_count,
            )
        )
    return cards


def count_due_coding_items(session: Session, child_id: int, subject_id: int | None = None) -> int:
    return len(build_coding_review_cards(session, child_id, subject_id=subject_id))


def seed_coding_review_item(session: Session, child_id: int, flashcard_id: int) -> CodingReviewItem:
    existing = session.exec(
        select(CodingReviewItem).where(
            CodingReviewItem.child_id == child_id,
            CodingReviewItem.flashcard_id == flashcard_id,
        )
    ).first()
    if existing:
        return existing
    item = CodingReviewItem(
        flashcard_id=flashcard_id,
        child_id=child_id,
        next_review=datetime.utcnow(),
    )
    session.add(item)
    return item


# ── AI generation ─────────────────────────────────────────────────────────────

_SYSTEM_TEXT = (
    "You are an expert programming educator. "
    "Return ONLY valid JSON with no markdown fences, no commentary, and no extra keys. "
    "The JSON must match the schema exactly."
)

_TOPIC_PROMPT_TEMPLATE = """\
Create educational content for a programming topic.

Subject: {subject_name}
Topic: {topic_title}

Return a JSON object with exactly this schema:
{{
  "sections": [
    {{ "title": "string", "body": "string (markdown-style text OK)", "code_example": "string or null" }}
  ],
  "quiz": [
    {{
      "id": 1,
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_option": "exact text of the correct option",
      "explanation": "string"
    }}
  ],
  "flashcards": [
    {{ "front": "string (concept or question, max 120 chars)", "back": "string (explanation, max 400 chars)", "code_example": "string or null" }}
  ]
}}

Rules:
- sections: 3 to 5 items (introduction, key concepts, code examples, when to use, common pitfalls)
- quiz: exactly 5 questions with 4 options each
- flashcards: 5 to 8 items covering key concepts
- All explanatory text in Portuguese (Brazil); code and technical identifiers stay in English
- code_example uses the programming language of the subject
"""


def generate_topic_ai_content(
    *,
    subject_name: str,
    topic_title: str,
    ai_config: AIProviderConfig,
) -> TopicAIContentSchema:
    prompt = _TOPIC_PROMPT_TEMPLATE.format(
        subject_name=subject_name,
        topic_title=topic_title,
    )
    raw = _phrase_service.generate_json_text(
        system_text=_SYSTEM_TEXT,
        prompt=prompt,
        temperature=0.7,
        ai_config=ai_config,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("IA retornou JSON inválido para o conteúdo do tópico.") from exc
    return TopicAIContentSchema.model_validate(data)
