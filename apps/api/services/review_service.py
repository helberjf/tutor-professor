from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from models.database import LessonItem, LessonQuestion, ReviewItem


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def compute_review_priority(
    review_item: ReviewItem | LessonQuestion,
    now: datetime | None = None,
) -> float:
    now = _utc_naive(now or datetime.utcnow())
    next_review = _utc_naive(review_item.next_review)
    overdue_hours = 0.0
    if next_review <= now:
        overdue_hours = (now - next_review).total_seconds() / 3600

    return (
        review_item.difficulty_score * 5
        + review_item.error_count * 1.8
        + max(review_item.attempt_count - review_item.correct_count, 0) * 0.5
        + min(overdue_hours, 12)
        - review_item.streak * 0.35
    )


def get_or_create_review_item(
    session: Session,
    child_id: int,
    word_en: str,
    word_pt: str,
) -> ReviewItem:
    statement = select(ReviewItem).where(
        ReviewItem.child_id == child_id,
        ReviewItem.word_en == word_en,
    )
    review_item = session.exec(statement).first()

    if review_item is None:
        review_item = ReviewItem(
            child_id=child_id,
            word_en=word_en,
            word_pt=word_pt,
            difficulty_score=0.45,
            next_review=datetime.utcnow(),
        )
        session.add(review_item)
        session.flush()
    elif review_item.word_pt != word_pt:
        review_item.word_pt = word_pt

    return review_item


def seed_review_items_for_lesson(
    session: Session,
    child_id: int,
    lesson_items: list[LessonItem],
) -> list[ReviewItem]:
    seeded_items: list[ReviewItem] = []
    for lesson_item in lesson_items:
        review_item = get_or_create_review_item(
            session=session,
            child_id=child_id,
            word_en=lesson_item.word_en,
            word_pt=lesson_item.word_pt,
        )
        seeded_items.append(review_item)

    return seeded_items


def register_review_attempt(
    session: Session,
    child_id: int,
    word_en: str,
    word_pt: str,
    correct: bool,
    review_item_id: int | None = None,
) -> ReviewItem:
    review_item = None
    if review_item_id is not None:
        review_item = session.get(ReviewItem, review_item_id)
        if review_item is None or review_item.child_id != child_id:
            raise ValueError("Review item not found")

    if review_item is None:
        review_item = get_or_create_review_item(
            session=session,
            child_id=child_id,
            word_en=word_en,
            word_pt=word_pt,
        )

    now = datetime.utcnow()
    review_item.last_reviewed = now
    review_item.attempt_count += 1

    if correct:
        review_item.correct_count += 1
        review_item.streak += 1
        review_item.difficulty_score = max(
            0.1,
            review_item.difficulty_score - 0.12 - min(review_item.streak, 3) * 0.03,
        )

        schedule_hours = [4, 12, 24, 72, 168]
        base_hours = schedule_hours[min(review_item.streak - 1, len(schedule_hours) - 1)]
        spacing_multiplier = max(0.5, 1.15 - review_item.difficulty_score)
        review_item.next_review = now + timedelta(hours=base_hours * spacing_multiplier)
    else:
        review_item.error_count += 1
        review_item.streak = 0
        review_item.difficulty_score = min(1.0, review_item.difficulty_score + 0.25)
        retry_minutes = 5 if review_item.error_count >= 3 else 15
        review_item.next_review = now + timedelta(minutes=retry_minutes)

    session.add(review_item)
    return review_item


def get_due_review_items(session: Session, child_id: int, limit: int = 5) -> list[ReviewItem]:
    now = datetime.utcnow()
    all_items = session.exec(
        select(ReviewItem).where(ReviewItem.child_id == child_id)
    ).all()
    if not all_items:
        return []

    due_items = [item for item in all_items if item.next_review <= now]
    candidate_items = due_items or list(all_items)

    sorted_items = sorted(
        candidate_items,
        key=lambda item: compute_review_priority(item, now=now),
        reverse=True,
    )
    return sorted_items[:limit]


def count_due_review_items(session: Session, child_id: int) -> int:
    now = datetime.utcnow()
    review_items = session.exec(
        select(ReviewItem).where(ReviewItem.child_id == child_id)
    ).all()
    return sum(1 for item in review_items if item.next_review <= now)


def build_review_cards(session: Session, child_id: int, limit: int = 5) -> list[dict[str, object]]:
    due_items = get_due_review_items(session=session, child_id=child_id, limit=limit)
    if not due_items:
        return []

    all_items = session.exec(
        select(ReviewItem).where(ReviewItem.child_id == child_id)
    ).all()
    rng = random.Random(child_id + len(all_items))

    cards: list[dict[str, object]] = []
    for review_item in due_items:
        distractors: list[str] = []
        for candidate in sorted(
            all_items,
            key=lambda item: compute_review_priority(item),
            reverse=True,
        ):
            if candidate.id == review_item.id:
                continue
            if candidate.word_pt in distractors:
                continue
            distractors.append(candidate.word_pt)
            if len(distractors) == 2:
                break

        options = [review_item.word_pt, *distractors]
        if len(options) == 1:
            options.append("Ainda vou aprender")

        rng.shuffle(options)
        cards.append(
            {
                "review_item_id": review_item.id or 0,
                "word_en": review_item.word_en,
                "word_pt": review_item.word_pt,
                "prompt": f"O que significa {review_item.word_en}?",
                "options": options,
                "difficulty_score": review_item.difficulty_score,
                "error_count": review_item.error_count,
            }
        )

    return cards


def count_due_mixed_review_items(
    session: Session,
    child_id: int,
    *,
    now: datetime | None = None,
) -> int:
    reviewed_at = _utc_naive(now or datetime.utcnow())
    vocabulary = session.exec(
        select(ReviewItem).where(ReviewItem.child_id == child_id)
    ).all()
    questions = session.exec(
        select(LessonQuestion).where(LessonQuestion.child_id == child_id)
    ).all()
    return sum(
        1
        for item in [*vocabulary, *questions]
        if _utc_naive(item.next_review) <= reviewed_at
    )


def build_mixed_review_cards(
    session: Session,
    child_id: int,
    limit: int = 5,
    *,
    now: datetime | None = None,
) -> list[dict[str, object]]:
    """Return one priority-sorted, child-owned queue across both language card types."""
    if limit <= 0:
        return []

    reviewed_at = _utc_naive(now or datetime.utcnow())
    vocabulary = session.exec(
        select(ReviewItem).where(ReviewItem.child_id == child_id)
    ).all()
    questions = session.exec(
        select(LessonQuestion).where(LessonQuestion.child_id == child_id)
    ).all()

    candidates: list[tuple[str, ReviewItem | LessonQuestion]] = [
        ("vocabulary", item)
        for item in vocabulary
        if _utc_naive(item.next_review) <= reviewed_at
    ]
    candidates.extend(
        ("lesson_question", question)
        for question in questions
        if _utc_naive(question.next_review) <= reviewed_at
    )
    selected = sorted(
        candidates,
        key=lambda candidate: (
            -compute_review_priority(candidate[1], now=reviewed_at),
            candidate[0],
            candidate[1].id or 0,
        ),
    )[:limit]

    rng = random.Random(child_id + len(vocabulary))
    cards: list[dict[str, object]] = []
    for card_type, item in selected:
        if card_type == "lesson_question":
            question = item
            assert isinstance(question, LessonQuestion)
            cards.append(
                {
                    "card_type": "lesson_question",
                    "lesson_question_id": question.id or 0,
                    "lesson_id": question.lesson_id,
                    "prompt": question.front,
                    "answer": question.back,
                    "question_type": question.question_type,
                    "supporting_example": question.supporting_example,
                    "difficulty_score": question.difficulty_score,
                    "error_count": question.error_count,
                }
            )
            continue

        review_item = item
        assert isinstance(review_item, ReviewItem)
        distractors: list[str] = []
        for candidate in sorted(
            vocabulary,
            key=lambda value: (
                -compute_review_priority(value, now=reviewed_at),
                value.id or 0,
            ),
        ):
            if candidate.id == review_item.id or candidate.word_pt in distractors:
                continue
            distractors.append(candidate.word_pt)
            if len(distractors) == 2:
                break
        options = [review_item.word_pt, *distractors]
        if len(options) == 1:
            options.append("Ainda vou aprender")
        rng.shuffle(options)
        cards.append(
            {
                "card_type": "vocabulary",
                "review_item_id": review_item.id or 0,
                "word_en": review_item.word_en,
                "word_pt": review_item.word_pt,
                "prompt": f"O que significa {review_item.word_en}?",
                "answer": review_item.word_pt,
                "options": options,
                "difficulty_score": review_item.difficulty_score,
                "error_count": review_item.error_count,
            }
        )

    return cards
