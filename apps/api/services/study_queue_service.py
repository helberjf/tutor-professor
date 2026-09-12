"""The one queue behind "Estudar agora" and "Continuar de onde parou".

Before this, four separate review queues existed (language review, coding review,
the FSRS deck and "modo questoes") and nothing added them up, so the student had to
decide what to study before studying anything — a decision taken three times, on
three screens, before the first question.

This module answers that question once: given a student, return the cards to
answer next, in order, as plain JSON-able dicts that a `StudySession` can store
and hand back unchanged when the student comes back.

Two rules matter more than the mix:

* **Nothing already mastered comes back.** A question answered right twice, whose
  last answer was also right, is done. That is `is_mastered`, and it is the same
  rule the frontend applies in `lib/question-queue.ts`.
* **The queue is a snapshot.** It is built once, stored, and replayed from the
  stored position. Rebuilding it on every visit would move the card the student
  was looking at.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Sequence

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from models.database import LessonItem, StudyQuestion
from services.review_service import build_mixed_review_cards, count_due_mixed_review_items

# A session the student can finish in one sitting. Longer queues were the reason
# review felt like homework; this is about five to eight minutes of work.
DEFAULT_QUEUE_LIMIT = 12
MAX_LESSON_CARDS = 3
MAX_REVIEW_CARDS = 6

# Answered right this many times, with the last answer also right, and the
# question stops coming back.
MASTERY_CORRECT_COUNT = 2


def is_mastered(question: StudyQuestion) -> bool:
    """True when the question has been answered right enough times to retire it."""

    if question.correct_count < MASTERY_CORRECT_COUNT:
        return False
    # A question answered right twice and then missed is not mastered: the last
    # answer is the one that says what the student knows today.
    if question.last_selected_option is None:
        return True
    return question.last_selected_option == question.correct_option


def practice_sort_key(question: StudyQuestion) -> tuple[int, int, float, int]:
    """Order for practice: never seen, then missed, then merely seen.

    Inside a group the most-missed question comes first, and among equals the one
    left alone longest. Ties fall back to the id so the order is stable.
    """

    if question.attempt_count <= 0:
        group = 0
    elif question.last_selected_option is not None and question.last_selected_option != question.correct_option:
        group = 1
    elif not is_mastered(question):
        group = 2
    else:
        group = 3

    last_answered = question.last_answered_at.timestamp() if question.last_answered_at else 0.0
    return (group, -question.error_count, last_answered, question.id or 0)


def select_pending_questions(
    questions: Iterable[StudyQuestion],
    *,
    limit: int | None = None,
    include_mastered: bool = False,
) -> list[StudyQuestion]:
    """The questions still worth answering, hardest-owed first."""

    candidates = [
        question
        for question in questions
        if include_mastered or not is_mastered(question)
    ]
    candidates.sort(key=practice_sort_key)
    return candidates if limit is None else candidates[:limit]


def count_pending_questions(session: Session, child_id: int) -> int:
    """How many saved questions the student has not mastered yet.

    Counted in SQL rather than by loading every row: the home screen asks for this
    on every visit, and a student who has been studying for a while has hundreds of
    questions. The condition is `is_mastered` negated, and the two must stay in
    step — a question is still owed when it has fewer than two correct answers, or
    when the last answer was wrong.
    """

    statement = select(func.count(StudyQuestion.id)).where(
        StudyQuestion.child_id == child_id,
        or_(
            StudyQuestion.correct_count < MASTERY_CORRECT_COUNT,
            and_(
                StudyQuestion.last_selected_option.is_not(None),
                StudyQuestion.last_selected_option != StudyQuestion.correct_option,
            ),
        ),
    )
    return int(session.exec(statement).one())


def _lesson_cards(
    *,
    lesson_id: int,
    lesson_title: str,
    items: Sequence[LessonItem],
    limit: int,
) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for item in items[:limit]:
        cards.append(
            {
                "kind": "lesson_item",
                "ref_id": item.id or 0,
                "lesson_id": lesson_id,
                "source_label": "Licao de hoje",
                "topic_title": lesson_title,
                "prompt": item.word_en,
                "answer": item.word_pt,
                "example": item.example_sentence_en or "",
                "example_translation": item.example_sentence_pt or "",
                "audio_text": item.word_en,
            }
        )
    return cards


def _review_cards(session: Session, child_id: int, limit: int, now: datetime | None) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for card in build_mixed_review_cards(session=session, child_id=child_id, limit=limit, now=now):
        if card.get("card_type") == "vocabulary":
            cards.append(
                {
                    "kind": "vocabulary",
                    "ref_id": int(card.get("review_item_id") or 0),
                    "source_label": "Revisao",
                    "topic_title": "Vocabulario",
                    "prompt": str(card.get("prompt") or ""),
                    "answer": str(card.get("answer") or ""),
                    "options": list(card.get("options") or []),
                    "word_en": str(card.get("word_en") or ""),
                    "word_pt": str(card.get("word_pt") or ""),
                    "audio_text": str(card.get("word_en") or ""),
                }
            )
        else:
            cards.append(
                {
                    "kind": "lesson_question",
                    "ref_id": int(card.get("lesson_question_id") or 0),
                    "lesson_id": int(card.get("lesson_id") or 0),
                    "source_label": "Revisao",
                    "topic_title": "Pergunta da licao",
                    "prompt": str(card.get("prompt") or ""),
                    "answer": str(card.get("answer") or ""),
                    "supporting_example": card.get("supporting_example") or "",
                    "prompt_translation": card.get("prompt_translation") or "",
                    "audio_text": str(card.get("supporting_example") or ""),
                }
            )
    return cards


def _question_cards(session: Session, child_id: int, limit: int) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    questions = session.exec(
        select(StudyQuestion).where(StudyQuestion.child_id == child_id)
    ).all()
    return [
        {
            "kind": "study_question",
            "ref_id": question.id or 0,
            "source_label": question.subject_name,
            "topic_title": question.topic_title,
            "prompt": question.question,
            "options": list(question.options or []),
            "correct_option": question.correct_option,
            "explanation": question.explanation,
        }
        for question in select_pending_questions(questions, limit=limit)
    ]


def build_study_queue(
    session: Session,
    *,
    child_id: int,
    lesson_id: int | None = None,
    lesson_title: str = "",
    lesson_items: Sequence[LessonItem] = (),
    limit: int = DEFAULT_QUEUE_LIMIT,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """The next cards to answer: today's lesson, what is due, then what is owed.

    Teaching comes first because a queue that opens with a question about a
    phrase the student has not met yet is how review earns its reputation. The
    caller resolves the lesson (only `main` knows which lesson is current) and
    passes it in, which keeps this module free of the app's routing layer.
    """

    if limit <= 0:
        return []

    queue: list[dict[str, Any]] = []
    if lesson_id and lesson_items:
        queue.extend(
            _lesson_cards(
                lesson_id=lesson_id,
                lesson_title=lesson_title,
                items=lesson_items,
                limit=min(MAX_LESSON_CARDS, limit),
            )
        )

    remaining = limit - len(queue)
    if remaining > 0:
        queue.extend(_review_cards(session, child_id, min(MAX_REVIEW_CARDS, remaining), now))

    remaining = limit - len(queue)
    if remaining > 0:
        queue.extend(_question_cards(session, child_id, remaining))

    return queue[:limit]


def count_queue_sources(
    session: Session,
    *,
    child_id: int,
    lesson_pending: bool,
    now: datetime | None = None,
) -> dict[str, int | bool]:
    """What the home screen needs to say why there is something to do."""

    return {
        "due_review": count_due_mixed_review_items(session=session, child_id=child_id, now=now),
        "pending_questions": count_pending_questions(session=session, child_id=child_id),
        "lesson_pending": bool(lesson_pending),
    }
