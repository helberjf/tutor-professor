"""Export and erasure of one account's data.

The LGPD gives the person behind an account the right to a copy of their data
and the right to have it deleted, and this app is about children, which is the
category where that matters most. Both rights are useless if honouring them
means the owner running SQL by hand, so they are endpoints.

Deletion order is written out rather than left to database cascades: the schema
has no ON DELETE CASCADE, so a child row deleted first would leave every lesson,
flashcard and attempt behind as orphans that nobody would ever notice.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from sqlmodel import Session, select

from models.database import (
    AuthToken,
    Book,
    BookPage,
    ChildLessonProgress,
    ChildProfile,
    CodingDay,
    CodingDeckConfig,
    CodingReviewItem,
    DailyActivity,
    DiverseDay,
    Exam,
    ExamAttempt,
    ExamAttemptAnswer,
    ExamQuestion,
    LeetCodeMethod,
    Lesson,
    LessonItem,
    LessonQuestion,
    ProgrammingFlashcard,
    ProgrammingQuestion,
    ProgrammingSubject,
    ProgrammingTopic,
    QuizAttempt,
    ReviewItem,
    StudyDay,
    StudyQuestion,
    Subscription,
    UsageRecord,
    User,
    UserAISettings,
    UserSession,
)


def _rows(session: Session, model, column, values: Iterable) -> list:
    values = list(values)
    if not values:
        return []
    return list(session.exec(select(model).where(column.in_(values))).all())


def _dump(records: Iterable) -> list[dict[str, Any]]:
    return [record.model_dump() for record in records]


def child_ids_for_user(session: Session, user_id: int) -> list[int]:
    return [
        child.id
        for child in session.exec(
            select(ChildProfile).where(ChildProfile.user_id == user_id)
        ).all()
        if child.id is not None
    ]


def export_account(session: Session, user: User) -> dict[str, Any]:
    """Everything stored about this account, as plain JSON-ready data.

    The password hash and the stored AI key are deliberately left out: an export
    lands in a downloads folder or an inbox, and neither belongs there. The AI
    settings are included without the key itself.
    """

    assert user.id is not None
    children = list(
        session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).all()
    )
    child_ids = [child.id for child in children if child.id is not None]
    lessons = _rows(session, Lesson, Lesson.child_id, child_ids)
    lesson_ids = [lesson.id for lesson in lessons if lesson.id is not None]
    books = _rows(session, Book, Book.child_id, child_ids)
    book_ids = [book.id for book in books if book.id is not None]
    subjects = _rows(session, ProgrammingSubject, ProgrammingSubject.child_id, child_ids)
    subject_ids = [subject.id for subject in subjects if subject.id is not None]
    topics = _rows(session, ProgrammingTopic, ProgrammingTopic.subject_id, subject_ids)
    exams = _rows(session, Exam, Exam.child_id, child_ids)
    exam_ids = [exam.id for exam in exams if exam.id is not None]
    attempts = _rows(session, ExamAttempt, ExamAttempt.exam_id, exam_ids)
    attempt_ids = [attempt.id for attempt in attempts if attempt.id is not None]

    ai_settings = session.exec(
        select(UserAISettings).where(UserAISettings.user_id == user.id)
    ).first()

    return {
        "exported_at": datetime.utcnow().isoformat(),
        "account": {
            "id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "status": user.status,
            "created_at": user.created_at.isoformat(),
            "email_verified_at": (
                user.email_verified_at.isoformat() if user.email_verified_at else None
            ),
            "enabled_modules": user.enabled_modules or {},
            "ai_credits": user.ai_credits,
            "ai_credits_used": user.ai_credits_used,
        },
        "ai_settings": (
            {
                "provider": ai_settings.provider,
                "model": ai_settings.model,
                "base_url": ai_settings.base_url,
                "use_global_key": ai_settings.use_global_key,
                # The key itself is never exported.
                "has_api_key": bool(ai_settings.api_key_encrypted),
            }
            if ai_settings
            else None
        ),
        "subscription": _dump(
            session.exec(select(Subscription).where(Subscription.user_id == user.id)).all()
        ),
        "usage": _dump(
            session.exec(select(UsageRecord).where(UsageRecord.user_id == user.id)).all()
        ),
        "children": _dump(children),
        "lessons": _dump(lessons),
        "lesson_items": _dump(_rows(session, LessonItem, LessonItem.lesson_id, lesson_ids)),
        "lesson_questions": _dump(
            _rows(session, LessonQuestion, LessonQuestion.child_id, child_ids)
        ),
        "lesson_progress": _dump(
            _rows(session, ChildLessonProgress, ChildLessonProgress.child_id, child_ids)
        ),
        "review_items": _dump(_rows(session, ReviewItem, ReviewItem.child_id, child_ids)),
        "quiz_attempts": _dump(_rows(session, QuizAttempt, QuizAttempt.child_id, child_ids)),
        "study_days": _dump(_rows(session, StudyDay, StudyDay.child_id, child_ids)),
        "diverse_days": _dump(_rows(session, DiverseDay, DiverseDay.child_id, child_ids)),
        "coding_days": _dump(_rows(session, CodingDay, CodingDay.child_id, child_ids)),
        "books": _dump(books),
        "book_pages": _dump(_rows(session, BookPage, BookPage.book_id, book_ids)),
        "programming_subjects": _dump(subjects),
        "programming_topics": _dump(topics),
        "programming_flashcards": _dump(
            _rows(session, ProgrammingFlashcard, ProgrammingFlashcard.child_id, child_ids)
        ),
        "programming_questions": _dump(
            _rows(session, ProgrammingQuestion, ProgrammingQuestion.child_id, child_ids)
        ),
        "study_questions": _dump(
            _rows(session, StudyQuestion, StudyQuestion.child_id, child_ids)
        ),
        "coding_review_items": _dump(
            _rows(session, CodingReviewItem, CodingReviewItem.child_id, child_ids)
        ),
        "coding_deck_configs": _dump(
            _rows(session, CodingDeckConfig, CodingDeckConfig.child_id, child_ids)
        ),
        "daily_activity": _dump(
            _rows(session, DailyActivity, DailyActivity.child_id, child_ids)
        ),
        "leetcode_methods": _dump(
            _rows(session, LeetCodeMethod, LeetCodeMethod.child_id, child_ids)
        ),
        "exams": _dump(exams),
        "exam_questions": _dump(_rows(session, ExamQuestion, ExamQuestion.exam_id, exam_ids)),
        "exam_attempts": _dump(attempts),
        "exam_attempt_answers": _dump(
            _rows(session, ExamAttemptAnswer, ExamAttemptAnswer.attempt_id, attempt_ids)
        ),
    }


def delete_account(session: Session, user: User) -> dict[str, int]:
    """Erase the account and everything under it. Returns rows removed per table.

    Deepest rows first: an attempt answer points at an attempt, which points at
    an exam, which points at a child. Deleting the child first would leave the
    rest unreachable and undeleted.
    """

    assert user.id is not None
    deleted: dict[str, int] = {}

    def remove(model, column, values) -> None:
        records = _rows(session, model, column, values)
        if not records:
            return
        for record in records:
            session.delete(record)
        deleted[model.__name__] = deleted.get(model.__name__, 0) + len(records)

    child_ids = child_ids_for_user(session, user.id)
    lesson_ids = [
        lesson.id for lesson in _rows(session, Lesson, Lesson.child_id, child_ids) if lesson.id
    ]
    book_ids = [book.id for book in _rows(session, Book, Book.child_id, child_ids) if book.id]
    subject_ids = [
        subject.id
        for subject in _rows(session, ProgrammingSubject, ProgrammingSubject.child_id, child_ids)
        if subject.id
    ]
    topic_ids = [
        topic.id
        for topic in _rows(session, ProgrammingTopic, ProgrammingTopic.subject_id, subject_ids)
        if topic.id
    ]
    exam_ids = [exam.id for exam in _rows(session, Exam, Exam.child_id, child_ids) if exam.id]
    attempt_ids = [
        attempt.id
        for attempt in _rows(session, ExamAttempt, ExamAttempt.exam_id, exam_ids)
        if attempt.id
    ]

    remove(ExamAttemptAnswer, ExamAttemptAnswer.attempt_id, attempt_ids)
    remove(ExamAttempt, ExamAttempt.exam_id, exam_ids)
    remove(ExamQuestion, ExamQuestion.exam_id, exam_ids)
    remove(Exam, Exam.child_id, child_ids)

    remove(CodingReviewItem, CodingReviewItem.child_id, child_ids)
    remove(CodingDeckConfig, CodingDeckConfig.child_id, child_ids)
    remove(ProgrammingQuestion, ProgrammingQuestion.child_id, child_ids)
    remove(ProgrammingFlashcard, ProgrammingFlashcard.child_id, child_ids)
    remove(ProgrammingTopic, ProgrammingTopic.id, topic_ids)
    remove(ProgrammingSubject, ProgrammingSubject.child_id, child_ids)

    remove(BookPage, BookPage.book_id, book_ids)
    remove(Book, Book.child_id, child_ids)

    remove(LessonItem, LessonItem.lesson_id, lesson_ids)
    remove(LessonQuestion, LessonQuestion.child_id, child_ids)
    remove(ChildLessonProgress, ChildLessonProgress.child_id, child_ids)
    remove(QuizAttempt, QuizAttempt.child_id, child_ids)
    remove(Lesson, Lesson.child_id, child_ids)

    remove(StudyQuestion, StudyQuestion.child_id, child_ids)
    remove(ReviewItem, ReviewItem.child_id, child_ids)
    remove(StudyDay, StudyDay.child_id, child_ids)
    remove(DiverseDay, DiverseDay.child_id, child_ids)
    remove(CodingDay, CodingDay.child_id, child_ids)
    remove(DailyActivity, DailyActivity.child_id, child_ids)
    remove(LeetCodeMethod, LeetCodeMethod.child_id, child_ids)

    remove(ChildProfile, ChildProfile.user_id, [user.id])

    remove(UsageRecord, UsageRecord.user_id, [user.id])
    remove(Subscription, Subscription.user_id, [user.id])
    remove(UserAISettings, UserAISettings.user_id, [user.id])
    remove(AuthToken, AuthToken.user_id, [user.id])
    remove(UserSession, UserSession.user_id, [user.id])

    session.delete(user)
    deleted["User"] = 1
    session.commit()
    return deleted
