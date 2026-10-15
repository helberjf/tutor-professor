from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlmodel import Session, select

from models.database import LessonItem, LessonQuestion, ReviewItem

# What a card with no language of its own teaches. Every row written before
# review items carried a language was English, so that is what they answer to.
DEFAULT_TARGET_LANGUAGE = "English"


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
    target_language: str = DEFAULT_TARGET_LANGUAGE,
) -> ReviewItem:
    statement = select(ReviewItem).where(
        ReviewItem.child_id == child_id,
        ReviewItem.word_en == word_en,
        ReviewItem.target_language == target_language,
    )
    review_item = session.exec(statement).first()

    if review_item is None:
        review_item = ReviewItem(
            child_id=child_id,
            word_en=word_en,
            word_pt=word_pt,
            target_language=target_language,
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
    target_language: str = DEFAULT_TARGET_LANGUAGE,
) -> list[ReviewItem]:
    seeded_items: list[ReviewItem] = []
    for lesson_item in lesson_items:
        review_item = get_or_create_review_item(
            session=session,
            child_id=child_id,
            word_en=lesson_item.word_en,
            word_pt=lesson_item.word_pt,
            target_language=target_language,
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
    target_language: str = DEFAULT_TARGET_LANGUAGE,
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
            target_language=target_language,
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


def _child_review_items(
    session: Session,
    child_id: int,
    target_language: str | None,
) -> list[ReviewItem]:
    """Every vocabulary card of this child, narrowed to one language when asked.

    ``None`` means "whatever the child has ever learned" and is what callers
    outside the study queue (statistics, exports) want.
    """

    statement = select(ReviewItem).where(ReviewItem.child_id == child_id)
    if target_language:
        statement = statement.where(ReviewItem.target_language == target_language)
    return list(session.exec(statement).all())


def get_due_review_items(
    session: Session,
    child_id: int,
    limit: int = 5,
    target_language: str | None = None,
) -> list[ReviewItem]:
    now = datetime.utcnow()
    all_items = _child_review_items(session, child_id, target_language)
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


def count_due_review_items(
    session: Session,
    child_id: int,
    target_language: str | None = None,
) -> int:
    now = datetime.utcnow()
    statement = select(func.count(ReviewItem.id)).where(
        ReviewItem.child_id == child_id,
        ReviewItem.next_review <= now,
    )
    if target_language:
        statement = statement.where(ReviewItem.target_language == target_language)
    return int(session.exec(statement).one())


def build_review_cards(
    session: Session,
    child_id: int,
    limit: int = 5,
    target_language: str | None = None,
) -> list[dict[str, object]]:
    due_items = get_due_review_items(
        session=session, child_id=child_id, limit=limit, target_language=target_language
    )
    if not due_items:
        return []

    all_items = _child_review_items(session, child_id, target_language)
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


def count_due_mixed_review_items(
    session: Session,
    child_id: int,
    *,
    now: datetime | None = None,
    target_language: str | None = None,
) -> int:
    reviewed_at = _utc_naive(now or datetime.utcnow())
    vocabulary_statement = select(func.count(ReviewItem.id)).where(
        ReviewItem.child_id == child_id,
        ReviewItem.next_review <= reviewed_at,
    )
    question_statement = select(func.count(LessonQuestion.id)).where(
        LessonQuestion.child_id == child_id,
        LessonQuestion.next_review <= reviewed_at,
    )
    if target_language:
        vocabulary_statement = vocabulary_statement.where(
            ReviewItem.target_language == target_language
        )
        question_statement = question_statement.where(
            LessonQuestion.target_language == target_language
        )
    vocabulary_due = session.exec(vocabulary_statement).one()
    question_due = session.exec(question_statement).one()
    return int(vocabulary_due) + int(question_due)


def build_mixed_review_cards(
    session: Session,
    child_id: int,
    limit: int = 5,
    *,
    now: datetime | None = None,
    target_language: str | None = None,
) -> list[dict[str, object]]:
    """Return one priority-sorted, child-owned queue across both language card types.

    ``target_language`` keeps the queue on the language being studied now. A
    child who moved from English to French should meet French cards, not the
    English backlog their old lessons left due.
    """
    if limit <= 0:
        return []

    reviewed_at = _utc_naive(now or datetime.utcnow())
    vocabulary_statement = select(ReviewItem).where(
        ReviewItem.child_id == child_id,
        ReviewItem.next_review <= reviewed_at,
    )
    question_statement = select(LessonQuestion).where(
        LessonQuestion.child_id == child_id,
        LessonQuestion.next_review <= reviewed_at,
    )
    if target_language:
        vocabulary_statement = vocabulary_statement.where(
            ReviewItem.target_language == target_language
        )
        question_statement = question_statement.where(
            LessonQuestion.target_language == target_language
        )
    vocabulary = session.exec(vocabulary_statement).all()
    questions = session.exec(question_statement).all()

    vocabulary_by_priority = sorted(
        (
            (compute_review_priority(item, now=reviewed_at), item)
            for item in vocabulary
        ),
        key=lambda candidate: (-candidate[0], candidate[1].id or 0),
    )
    candidates: list[tuple[float, str, ReviewItem | LessonQuestion]] = [
        (priority, "vocabulary", item)
        for priority, item in vocabulary_by_priority
    ]
    candidates.extend(
        (compute_review_priority(question, now=reviewed_at), "lesson_question", question)
        for question in questions
    )
    selected = sorted(
        candidates,
        key=lambda candidate: (
            -candidate[0],
            candidate[1],
            candidate[2].id or 0,
        ),
    )[:limit]

    rng = random.Random(child_id + len(vocabulary))
    cards: list[dict[str, object]] = []
    vocabulary_options = [item for _, item in vocabulary_by_priority]
    for _, card_type, item in selected:
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
                    "prompt_translation": question.front_translation,
                    "supporting_example_translation": question.supporting_example_translation,
                    "difficulty_score": question.difficulty_score,
                    "error_count": question.error_count,
                }
            )
            continue

        review_item = item
        assert isinstance(review_item, ReviewItem)
        distractors: list[str] = []
        for candidate in vocabulary_options:
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
