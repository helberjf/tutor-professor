# Coding Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Coding tab in `/study` with a full curriculum system — create programming subjects, add ordered topics with AI-generated lessons + flashcards, and review with SM-2 spaced repetition.

**Architecture:** 4 new SQLModel tables (`ProgrammingSubject`, `ProgrammingTopic`, `ProgrammingFlashcard`, `CodingReviewItem`) + `coding_service.py` for AI content generation and SM-2 logic + 13 FastAPI endpoints under `/api/coding/` + new React components replacing the `CodingTab` body in `study/page.tsx`. All new models use `child_id` (consistent with `CodingDay`, `DiverseDay`, `StudyDay`). Auth uses the existing `require_parent_session` + `get_requested_child` pattern. Old `CodingDay` table and endpoints are untouched (no regression).

**Tech Stack:** Python 3.12 / FastAPI / SQLModel / SQLite + Alembic migrations; Next.js 14 / React / TypeScript / Tailwind CSS; existing `PhraseGenerationService.generate_json_text()` for AI generation; `decrypt_api_key()` + `_get_user_ai_config()` for API key handling (already in `main.py`).

---

## File Map

**Create:**
- `apps/api/alembic/versions/0004_coding_curriculum.py`
- `apps/api/services/coding_service.py`
- `apps/web/src/components/coding/CreateSubjectModal.tsx`
- `apps/web/src/components/coding/CreateTopicModal.tsx`
- `apps/web/src/components/coding/TopicView.tsx`
- `apps/web/src/components/coding/ReviewSession.tsx`
- `apps/web/src/components/coding/CodingCurriculum.tsx`

**Modify:**
- `apps/api/models/database.py` — append 4 new SQLModel tables + `TopicStatus` enum
- `apps/api/schemas/schemas.py` — append ~15 new Pydantic schemas
- `apps/api/main.py` — add imports + 13 new endpoints
- `apps/web/src/lib/api.ts` — add TypeScript interfaces + 13 API functions
- `apps/web/src/app/study/page.tsx` — replace `CodingTab` return body with `CodingCurriculum`

---

### Task 1: Database Models

**Files:**
- Modify: `apps/api/models/database.py`

- [ ] **Step 1: Append 4 new models to database.py**

Append at the **end** of `apps/api/models/database.py`:

```python
from enum import Enum as PyEnum


class TopicStatus(str, PyEnum):
    not_started = "not_started"
    studied = "studied"
    mastered = "mastered"


class ProgrammingSubject(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_emoji: Optional[str] = Field(default=None, max_length=10)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProgrammingTopic(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    subject_id: int = Field(foreign_key="programmingsubject.id", index=True)
    title: str = Field(min_length=1, max_length=200)
    order_index: int = Field(default=0)
    status: str = Field(default="not_started")
    ai_content: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    notes: Optional[str] = Field(default=None, max_length=5000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProgrammingFlashcard(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    topic_id: int = Field(foreign_key="programmingtopic.id", index=True)
    subject_id: int = Field(foreign_key="programmingsubject.id", index=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CodingReviewItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    flashcard_id: int = Field(foreign_key="programmingflashcard.id", index=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    difficulty_score: float = Field(default=0.5)
    attempt_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    error_count: int = Field(default=0)
    streak: int = Field(default=0)
    last_reviewed: Optional[datetime] = Field(default=None)
    next_review: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 2: Verify no import errors**

```bash
cd apps/api && python -c "from models.database import ProgrammingSubject, ProgrammingTopic, ProgrammingFlashcard, CodingReviewItem, TopicStatus; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/api/models/database.py
git commit -m "feat: add ProgrammingSubject, ProgrammingTopic, ProgrammingFlashcard, CodingReviewItem models"
```

---

### Task 2: Alembic Migration

**Files:**
- Create: `apps/api/alembic/versions/0004_coding_curriculum.py`

- [ ] **Step 1: Create migration file**

Create `apps/api/alembic/versions/0004_coding_curriculum.py` with this exact content:

```python
"""coding curriculum tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "programmingsubject",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("icon_emoji", sa.String(length=10), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_programmingsubject_child_id", "programmingsubject", ["child_id"])

    op.create_table(
        "programmingtopic",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("programmingsubject.id"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="not_started"),
        sa.Column("ai_content", sa.JSON(), nullable=True),
        sa.Column("notes", sa.String(length=5000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_programmingtopic_subject_id", "programmingtopic", ["subject_id"])

    op.create_table(
        "programmingflashcard",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("programmingtopic.id"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("programmingsubject.id"), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("front", sa.String(length=500), nullable=False),
        sa.Column("back", sa.String(length=2000), nullable=False),
        sa.Column("code_example", sa.String(length=3000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_programmingflashcard_topic_id", "programmingflashcard", ["topic_id"])
    op.create_index("ix_programmingflashcard_subject_id", "programmingflashcard", ["subject_id"])
    op.create_index("ix_programmingflashcard_child_id", "programmingflashcard", ["child_id"])

    op.create_table(
        "codingreviewitem",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("flashcard_id", sa.Integer(), sa.ForeignKey("programmingflashcard.id"), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("childprofile.id"), nullable=False),
        sa.Column("difficulty_score", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reviewed", sa.DateTime(), nullable=True),
        sa.Column("next_review", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_codingreviewitem_flashcard_id", "codingreviewitem", ["flashcard_id"])
    op.create_index("ix_codingreviewitem_child_id", "codingreviewitem", ["child_id"])


def downgrade() -> None:
    op.drop_index("ix_codingreviewitem_child_id", "codingreviewitem")
    op.drop_index("ix_codingreviewitem_flashcard_id", "codingreviewitem")
    op.drop_table("codingreviewitem")
    op.drop_index("ix_programmingflashcard_child_id", "programmingflashcard")
    op.drop_index("ix_programmingflashcard_subject_id", "programmingflashcard")
    op.drop_index("ix_programmingflashcard_topic_id", "programmingflashcard")
    op.drop_table("programmingflashcard")
    op.drop_index("ix_programmingtopic_subject_id", "programmingtopic")
    op.drop_table("programmingtopic")
    op.drop_index("ix_programmingsubject_child_id", "programmingsubject")
    op.drop_table("programmingsubject")
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && alembic upgrade head
```
Expected: last line contains `Running upgrade 0003 -> 0004`

- [ ] **Step 3: Commit**

```bash
git add apps/api/alembic/versions/0004_coding_curriculum.py
git commit -m "feat: alembic migration 0004 — coding curriculum tables"
```

---

### Task 3: Pydantic Schemas

**Files:**
- Modify: `apps/api/schemas/schemas.py`

- [ ] **Step 1: Append new schemas at end of schemas.py**

Append to the **end** of `apps/api/schemas/schemas.py`:

```python
# ── Coding Curriculum ─────────────────────────────────────────────────────────

class AISectionSchema(BaseModel):
    title: str
    body: str
    code_example: Optional[str] = None


class AIQuizQuestionSchema(BaseModel):
    id: int
    question: str
    options: List[str]
    correct_option: str
    explanation: str


class AIFlashcardDraftSchema(BaseModel):
    front: str
    back: str
    code_example: Optional[str] = None


class TopicAIContentSchema(BaseModel):
    sections: List[AISectionSchema] = Field(default_factory=list)
    quiz: List[AIQuizQuestionSchema] = Field(default_factory=list)
    flashcards: List[AIFlashcardDraftSchema] = Field(default_factory=list)


class ProgrammingSubjectSchema(FromAttributesModel):
    id: int
    child_id: int
    name: str
    description: Optional[str] = None
    icon_emoji: Optional[str] = None
    created_at: datetime
    topic_count: int = 0
    studied_count: int = 0
    due_review_count: int = 0


class CreateProgrammingSubjectSchema(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_emoji: Optional[str] = Field(default=None, max_length=10)


class UpdateProgrammingSubjectSchema(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_emoji: Optional[str] = Field(default=None, max_length=10)


class ProgrammingTopicSchema(FromAttributesModel):
    id: int
    subject_id: int
    title: str
    order_index: int
    status: str
    ai_content: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    flashcard_count: int = 0


class CreateProgrammingTopicSchema(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    order_index: Optional[int] = None
    generate_ai: bool = False


class UpdateProgrammingTopicSchema(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    order_index: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=5000)
    ai_content: Optional[Dict[str, Any]] = None


class ProgrammingFlashcardSchema(FromAttributesModel):
    id: int
    topic_id: int
    subject_id: int
    front: str
    back: str
    code_example: Optional[str] = None
    created_at: datetime


class CreateProgrammingFlashcardSchema(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)


class UpdateProgrammingFlashcardSchema(BaseModel):
    front: Optional[str] = Field(default=None, min_length=1, max_length=500)
    back: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    code_example: Optional[str] = Field(default=None, max_length=3000)


class CodingReviewCardSchema(BaseModel):
    review_item_id: int
    flashcard_id: int
    subject_id: int
    front: str
    back: str
    code_example: Optional[str] = None
    difficulty_score: float
    error_count: int


class CodingReviewSessionSchema(BaseModel):
    total_due: int
    items: List[CodingReviewCardSchema]


class CodingReviewAttemptSchema(BaseModel):
    review_item_id: int
    correct: bool


class CodingReviewResultSchema(BaseModel):
    review_item_id: int
    difficulty_score: float
    next_review: datetime
    error_count: int
    correct_count: int
```

- [ ] **Step 2: Verify schemas import cleanly**

```bash
cd apps/api && python -c "from schemas.schemas import ProgrammingSubjectSchema, ProgrammingTopicSchema, ProgrammingFlashcardSchema, CodingReviewSessionSchema, TopicAIContentSchema; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/api/schemas/schemas.py
git commit -m "feat: add coding curriculum Pydantic schemas"
```

---

### Task 4: Coding Service

**Files:**
- Create: `apps/api/services/coding_service.py`

- [ ] **Step 1: Create the service file**

Create `apps/api/services/coding_service.py` with this exact content:

```python
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
```

- [ ] **Step 2: Verify service imports**

```bash
cd apps/api && python -c "from services.coding_service import generate_topic_ai_content, build_coding_review_cards, register_coding_review_attempt, seed_coding_review_item, count_due_coding_items; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/api/services/coding_service.py
git commit -m "feat: coding_service — SM-2 review logic and AI topic content generation"
```

---

### Task 5: Backend Endpoints

**Files:**
- Modify: `apps/api/main.py`

- [ ] **Step 1: Expand the model import line in main.py**

Find this line (around line 22):
```python
from models.database import AdminFlashcard, Book, BookPage, ChildLessonProgress, ChildProfile, CodingDay, DiverseDay, Lesson, LessonItem, QuizAttempt, ReviewItem, StudyDay, User, UserAISettings, UserSession
```
Replace it with:
```python
from models.database import AdminFlashcard, Book, BookPage, ChildLessonProgress, ChildProfile, CodingDay, CodingReviewItem, DiverseDay, Lesson, LessonItem, ProgrammingFlashcard, ProgrammingSubject, ProgrammingTopic, QuizAttempt, ReviewItem, StudyDay, User, UserAISettings, UserSession
```

- [ ] **Step 2: Add new schema names to the existing schema import block**

Find the `from schemas.schemas import (` block (lines 24–62). Add the following names inside it (anywhere in the list):
```python
    CodingReviewAttemptSchema,
    CodingReviewCardSchema,
    CodingReviewResultSchema,
    CodingReviewSessionSchema,
    CreateProgrammingFlashcardSchema,
    CreateProgrammingSubjectSchema,
    CreateProgrammingTopicSchema,
    ProgrammingFlashcardSchema,
    ProgrammingSubjectSchema,
    ProgrammingTopicSchema,
    TopicAIContentSchema,
    UpdateProgrammingFlashcardSchema,
    UpdateProgrammingSubjectSchema,
    UpdateProgrammingTopicSchema,
```

- [ ] **Step 3: Add coding_service import**

Find this line in `main.py`:
```python
from services.review_service import (
```
Insert BEFORE it:
```python
from services.coding_service import (
    build_coding_review_cards,
    count_due_coding_items,
    generate_topic_ai_content,
    register_coding_review_attempt,
    seed_coding_review_item,
)
```

- [ ] **Step 4: Add all 13 coding endpoints**

Find this comment in `main.py`:
```python
# ── Auth endpoints ────────────────────────────────────────────────────────────
```
Insert the following block **before** it:

```python
# ── Coding Curriculum endpoints ───────────────────────────────────────────────

@app.get("/api/coding/subjects", response_model=list[ProgrammingSubjectSchema])
def list_coding_subjects(request: Request, session: Session = Depends(get_session)) -> list[ProgrammingSubjectSchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subjects = session.exec(select(ProgrammingSubject).where(ProgrammingSubject.child_id == child.id)).all()
    result = []
    for s in subjects:
        topics = session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == s.id)).all()
        result.append(ProgrammingSubjectSchema(
            id=s.id or 0, child_id=s.child_id, name=s.name,
            description=s.description, icon_emoji=s.icon_emoji,
            created_at=s.created_at,
            topic_count=len(topics),
            studied_count=sum(1 for t in topics if t.status in ("studied", "mastered")),
            due_review_count=count_due_coding_items(session, child.id or 0, subject_id=s.id),
        ))
    return result


@app.post("/api/coding/subjects", response_model=ProgrammingSubjectSchema, status_code=201)
def create_coding_subject(
    payload: CreateProgrammingSubjectSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingSubjectSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = ProgrammingSubject(
        child_id=child.id or 0,
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        icon_emoji=(payload.icon_emoji or "").strip() or None,
        created_at=datetime.utcnow(),
    )
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return ProgrammingSubjectSchema(
        id=subject.id or 0, child_id=subject.child_id, name=subject.name,
        description=subject.description, icon_emoji=subject.icon_emoji,
        created_at=subject.created_at,
    )


@app.put("/api/coding/subjects/{subject_id}", response_model=ProgrammingSubjectSchema)
def update_coding_subject(
    subject_id: int,
    payload: UpdateProgrammingSubjectSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingSubjectSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    if payload.name is not None:
        subject.name = payload.name.strip()
    if payload.description is not None:
        subject.description = payload.description.strip() or None
    if payload.icon_emoji is not None:
        subject.icon_emoji = payload.icon_emoji.strip() or None
    session.add(subject)
    session.commit()
    session.refresh(subject)
    topics = session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject.id)).all()
    return ProgrammingSubjectSchema(
        id=subject.id or 0, child_id=subject.child_id, name=subject.name,
        description=subject.description, icon_emoji=subject.icon_emoji,
        created_at=subject.created_at,
        topic_count=len(topics),
        studied_count=sum(1 for t in topics if t.status in ("studied", "mastered")),
        due_review_count=count_due_coding_items(session, child.id or 0, subject_id=subject.id),
    )


@app.delete("/api/coding/subjects/{subject_id}", status_code=204)
def delete_coding_subject(
    subject_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    topics = session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)).all()
    for topic in topics:
        flashcards = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all()
        for fc in flashcards:
            for ri in session.exec(select(CodingReviewItem).where(CodingReviewItem.flashcard_id == fc.id)).all():
                session.delete(ri)
            session.delete(fc)
        session.delete(topic)
    session.delete(subject)
    session.commit()


@app.get("/api/coding/subjects/{subject_id}/topics", response_model=list[ProgrammingTopicSchema])
def list_coding_topics(
    subject_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> list[ProgrammingTopicSchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    topics = sorted(
        session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)).all(),
        key=lambda t: t.order_index,
    )
    return [
        ProgrammingTopicSchema(
            id=t.id or 0, subject_id=t.subject_id, title=t.title,
            order_index=t.order_index, status=t.status,
            ai_content=t.ai_content, notes=t.notes,
            created_at=t.created_at, updated_at=t.updated_at,
            flashcard_count=len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == t.id)).all()),
        )
        for t in topics
    ]


@app.post("/api/coding/subjects/{subject_id}/topics", response_model=ProgrammingTopicSchema, status_code=201)
def create_coding_topic(
    subject_id: int,
    payload: CreateProgrammingTopicSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingTopicSchema:
    user_session = require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    subject = session.get(ProgrammingSubject, subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    existing_count = len(session.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == subject_id)).all())
    order_index = payload.order_index if payload.order_index is not None else existing_count
    now = datetime.utcnow()
    topic = ProgrammingTopic(
        subject_id=subject_id,
        title=payload.title.strip(),
        order_index=order_index,
        status="not_started",
        created_at=now,
        updated_at=now,
    )
    session.add(topic)
    session.commit()
    session.refresh(topic)
    if payload.generate_ai:
        ai_config = _get_user_ai_config(user_session, session)
        if ai_config:
            try:
                content = generate_topic_ai_content(
                    subject_name=subject.name,
                    topic_title=topic.title,
                    ai_config=ai_config,
                )
                topic.ai_content = content.model_dump()
                for fc_draft in content.flashcards:
                    fc = ProgrammingFlashcard(
                        topic_id=topic.id or 0,
                        subject_id=subject_id,
                        child_id=child.id or 0,
                        front=fc_draft.front[:500],
                        back=fc_draft.back[:2000],
                        code_example=(fc_draft.code_example or "")[:3000] or None,
                        created_at=now,
                    )
                    session.add(fc)
                    session.flush()
                    seed_coding_review_item(session, child.id or 0, fc.id or 0)
                topic.updated_at = datetime.utcnow()
                session.add(topic)
                session.commit()
                session.refresh(topic)
            except Exception:
                pass  # topic was saved; AI failed silently — user can retry via /generate
    fc_count = len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all())
    return ProgrammingTopicSchema(
        id=topic.id or 0, subject_id=topic.subject_id, title=topic.title,
        order_index=topic.order_index, status=topic.status,
        ai_content=topic.ai_content, notes=topic.notes,
        created_at=topic.created_at, updated_at=topic.updated_at,
        flashcard_count=fc_count,
    )


@app.put("/api/coding/topics/{topic_id}", response_model=ProgrammingTopicSchema)
def update_coding_topic(
    topic_id: int,
    payload: UpdateProgrammingTopicSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingTopicSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if payload.title is not None:
        topic.title = payload.title.strip()
    if payload.order_index is not None:
        topic.order_index = payload.order_index
    if payload.status is not None:
        from services.coding_service import VALID_TOPIC_STATUSES
        if payload.status not in VALID_TOPIC_STATUSES:
            raise HTTPException(status_code=422, detail="Status inválido. Use: not_started, studied, mastered.")
        topic.status = payload.status
    if payload.notes is not None:
        topic.notes = payload.notes
    if payload.ai_content is not None:
        topic.ai_content = payload.ai_content
    topic.updated_at = datetime.utcnow()
    session.add(topic)
    session.commit()
    session.refresh(topic)
    fc_count = len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all())
    return ProgrammingTopicSchema(
        id=topic.id or 0, subject_id=topic.subject_id, title=topic.title,
        order_index=topic.order_index, status=topic.status,
        ai_content=topic.ai_content, notes=topic.notes,
        created_at=topic.created_at, updated_at=topic.updated_at,
        flashcard_count=fc_count,
    )


@app.delete("/api/coding/topics/{topic_id}", status_code=204)
def delete_coding_topic(
    topic_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    flashcards = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic_id)).all()
    for fc in flashcards:
        for ri in session.exec(select(CodingReviewItem).where(CodingReviewItem.flashcard_id == fc.id)).all():
            session.delete(ri)
        session.delete(fc)
    session.delete(topic)
    session.commit()


@app.post("/api/coding/topics/{topic_id}/generate", response_model=ProgrammingTopicSchema)
def generate_coding_topic_content(
    topic_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingTopicSchema:
    user_session = require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    ai_config = _get_user_ai_config(user_session, session)
    if ai_config is None:
        raise HTTPException(status_code=422, detail="Configuração de IA não encontrada. Configure sua chave de API em Configurações.")
    try:
        content = generate_topic_ai_content(
            subject_name=subject.name,
            topic_title=topic.title,
            ai_config=ai_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    topic.ai_content = content.model_dump()
    topic.updated_at = datetime.utcnow()
    session.add(topic)
    # Only seed flashcards if topic has none yet
    existing_fcs = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic_id)).all()
    if not existing_fcs:
        for fc_draft in content.flashcards:
            fc = ProgrammingFlashcard(
                topic_id=topic_id,
                subject_id=subject.id or 0,
                child_id=child.id or 0,
                front=fc_draft.front[:500],
                back=fc_draft.back[:2000],
                code_example=(fc_draft.code_example or "")[:3000] or None,
                created_at=datetime.utcnow(),
            )
            session.add(fc)
            session.flush()
            seed_coding_review_item(session, child.id or 0, fc.id or 0)
    session.commit()
    session.refresh(topic)
    fc_count = len(session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic.id)).all())
    return ProgrammingTopicSchema(
        id=topic.id or 0, subject_id=topic.subject_id, title=topic.title,
        order_index=topic.order_index, status=topic.status,
        ai_content=topic.ai_content, notes=topic.notes,
        created_at=topic.created_at, updated_at=topic.updated_at,
        flashcard_count=fc_count,
    )


@app.get("/api/coding/topics/{topic_id}/flashcards", response_model=list[ProgrammingFlashcardSchema])
def list_topic_flashcards(
    topic_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> list[ProgrammingFlashcardSchema]:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    flashcards = session.exec(select(ProgrammingFlashcard).where(ProgrammingFlashcard.topic_id == topic_id)).all()
    return [
        ProgrammingFlashcardSchema(
            id=fc.id or 0, topic_id=fc.topic_id, subject_id=fc.subject_id,
            front=fc.front, back=fc.back, code_example=fc.code_example,
            created_at=fc.created_at,
        )
        for fc in flashcards
    ]


@app.post("/api/coding/topics/{topic_id}/flashcards", response_model=ProgrammingFlashcardSchema, status_code=201)
def create_topic_flashcard(
    topic_id: int,
    payload: CreateProgrammingFlashcardSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingFlashcardSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    topic = session.get(ProgrammingTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")
    subject = session.get(ProgrammingSubject, topic.subject_id)
    if subject is None or subject.child_id != child.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    fc = ProgrammingFlashcard(
        topic_id=topic_id,
        subject_id=topic.subject_id,
        child_id=child.id or 0,
        front=payload.front.strip(),
        back=payload.back.strip(),
        code_example=(payload.code_example or "").strip() or None,
        created_at=datetime.utcnow(),
    )
    session.add(fc)
    session.flush()
    seed_coding_review_item(session, child.id or 0, fc.id or 0)
    session.commit()
    session.refresh(fc)
    return ProgrammingFlashcardSchema(
        id=fc.id or 0, topic_id=fc.topic_id, subject_id=fc.subject_id,
        front=fc.front, back=fc.back, code_example=fc.code_example,
        created_at=fc.created_at,
    )


@app.put("/api/coding/flashcards/{flashcard_id}", response_model=ProgrammingFlashcardSchema)
def update_coding_flashcard(
    flashcard_id: int,
    payload: UpdateProgrammingFlashcardSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> ProgrammingFlashcardSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    fc = session.get(ProgrammingFlashcard, flashcard_id)
    if fc is None or fc.child_id != child.id:
        raise HTTPException(status_code=404, detail="Flashcard não encontrado.")
    if payload.front is not None:
        fc.front = payload.front.strip()
    if payload.back is not None:
        fc.back = payload.back.strip()
    if payload.code_example is not None:
        fc.code_example = payload.code_example.strip() or None
    session.add(fc)
    session.commit()
    session.refresh(fc)
    return ProgrammingFlashcardSchema(
        id=fc.id or 0, topic_id=fc.topic_id, subject_id=fc.subject_id,
        front=fc.front, back=fc.back, code_example=fc.code_example,
        created_at=fc.created_at,
    )


@app.delete("/api/coding/flashcards/{flashcard_id}", status_code=204)
def delete_coding_flashcard(
    flashcard_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    fc = session.get(ProgrammingFlashcard, flashcard_id)
    if fc is None or fc.child_id != child.id:
        raise HTTPException(status_code=404, detail="Flashcard não encontrado.")
    for ri in session.exec(select(CodingReviewItem).where(CodingReviewItem.flashcard_id == flashcard_id)).all():
        session.delete(ri)
    session.delete(fc)
    session.commit()


@app.get("/api/coding/review", response_model=CodingReviewSessionSchema)
def get_coding_review(
    subject_id: Optional[int] = None,
    limit: int = 20,
    request: Request = None,
    session: Session = Depends(get_session),
) -> CodingReviewSessionSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    cards = build_coding_review_cards(session, child.id or 0, subject_id=subject_id, limit=limit)
    return CodingReviewSessionSchema(total_due=len(cards), items=cards)


@app.post("/api/coding/review/attempt", response_model=CodingReviewResultSchema)
def submit_coding_review_attempt(
    payload: CodingReviewAttemptSchema,
    request: Request,
    session: Session = Depends(get_session),
) -> CodingReviewResultSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    try:
        item = register_coding_review_attempt(
            session=session,
            child_id=child.id or 0,
            review_item_id=payload.review_item_id,
            correct=payload.correct,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    session.commit()
    session.refresh(item)
    return CodingReviewResultSchema(
        review_item_id=item.id or 0,
        difficulty_score=item.difficulty_score,
        next_review=item.next_review,
        error_count=item.error_count,
        correct_count=item.correct_count,
    )
```

- [ ] **Step 5: Verify backend starts without error**

```bash
cd apps/api && python -c "import main; print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add apps/api/main.py
git commit -m "feat: add 13 /api/coding/ endpoints for curriculum, flashcards, and spaced review"
```

---

### Task 6: Frontend Types & API Client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add TypeScript interfaces**

Find the last `export interface` block in `apps/web/src/lib/api.ts` (before the `api = {` object). Append the following interfaces after the last existing interface definition:

```typescript
// ── Coding Curriculum ──────────────────────────────────────────────────────

export interface ProgrammingSubject {
  id: number;
  child_id: number;
  name: string;
  description: string | null;
  icon_emoji: string | null;
  created_at: string;
  topic_count: number;
  studied_count: number;
  due_review_count: number;
}

export interface AISectionContent {
  title: string;
  body: string;
  code_example?: string | null;
}

export interface AIQuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
}

export interface TopicAIContent {
  sections: AISectionContent[];
  quiz: AIQuizQuestion[];
  flashcards: { front: string; back: string; code_example?: string | null }[];
}

export interface ProgrammingTopic {
  id: number;
  subject_id: number;
  title: string;
  order_index: number;
  status: 'not_started' | 'studied' | 'mastered';
  ai_content: TopicAIContent | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  flashcard_count: number;
}

export interface ProgrammingFlashcard {
  id: number;
  topic_id: number;
  subject_id: number;
  front: string;
  back: string;
  code_example: string | null;
  created_at: string;
}

export interface CodingReviewCard {
  review_item_id: number;
  flashcard_id: number;
  subject_id: number;
  front: string;
  back: string;
  code_example: string | null;
  difficulty_score: number;
  error_count: number;
}

export interface CodingReviewSession {
  total_due: number;
  items: CodingReviewCard[];
}

export interface CodingReviewAttemptResult {
  review_item_id: number;
  difficulty_score: number;
  next_review: string;
  error_count: number;
  correct_count: number;
}
```

- [ ] **Step 2: Add API functions**

Inside the `api = { ... }` object in `api.ts`, add the following functions at the end (before the closing `}`):

```typescript
  // Coding Curriculum
  getCodingSubjects: () =>
    fetchAPI<ProgrammingSubject[]>('/api/coding/subjects'),
  createCodingSubject: (payload: { name: string; description?: string; icon_emoji?: string }) =>
    fetchAPI<ProgrammingSubject>('/api/coding/subjects', { method: 'POST', body: JSON.stringify(payload) }),
  updateCodingSubject: (id: number, payload: { name?: string; description?: string; icon_emoji?: string }) =>
    fetchAPI<ProgrammingSubject>(`/api/coding/subjects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingSubject: (id: number) =>
    fetchAPI<void>(`/api/coding/subjects/${id}`, { method: 'DELETE' }),
  getCodingTopics: (subjectId: number) =>
    fetchAPI<ProgrammingTopic[]>(`/api/coding/subjects/${subjectId}/topics`),
  createCodingTopic: (subjectId: number, payload: { title: string; order_index?: number; generate_ai?: boolean }) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/subjects/${subjectId}/topics`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCodingTopic: (id: number, payload: { title?: string; order_index?: number; status?: string; notes?: string; ai_content?: object }) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/topics/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingTopic: (id: number) =>
    fetchAPI<void>(`/api/coding/topics/${id}`, { method: 'DELETE' }),
  generateCodingTopicContent: (id: number) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/topics/${id}/generate`, { method: 'POST' }),
  getTopicFlashcards: (topicId: number) =>
    fetchAPI<ProgrammingFlashcard[]>(`/api/coding/topics/${topicId}/flashcards`),
  createTopicFlashcard: (topicId: number, payload: { front: string; back: string; code_example?: string }) =>
    fetchAPI<ProgrammingFlashcard>(`/api/coding/topics/${topicId}/flashcards`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCodingFlashcard: (id: number, payload: { front?: string; back?: string; code_example?: string }) =>
    fetchAPI<ProgrammingFlashcard>(`/api/coding/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingFlashcard: (id: number) =>
    fetchAPI<void>(`/api/coding/flashcards/${id}`, { method: 'DELETE' }),
  getCodingReview: (subjectId?: number, limit = 20) =>
    fetchAPI<CodingReviewSession>(`/api/coding/review?limit=${limit}${subjectId ? `&subject_id=${subjectId}` : ''}`),
  submitCodingReviewAttempt: (payload: { review_item_id: number; correct: boolean }) =>
    fetchAPI<CodingReviewAttemptResult>('/api/coding/review/attempt', { method: 'POST', body: JSON.stringify(payload) }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors related to the new types

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add TypeScript types and API client functions for coding curriculum"
```

---

### Task 7: Frontend Components

**Files:**
- Create: `apps/web/src/components/coding/CreateSubjectModal.tsx`
- Create: `apps/web/src/components/coding/CreateTopicModal.tsx`
- Create: `apps/web/src/components/coding/TopicView.tsx`
- Create: `apps/web/src/components/coding/ReviewSession.tsx`
- Create: `apps/web/src/components/coding/CodingCurriculum.tsx`

- [ ] **Step 1: Create CreateSubjectModal.tsx**

Create `apps/web/src/components/coding/CreateSubjectModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, type ProgrammingSubject } from '@/lib/api';

interface Props {
  onClose: () => void;
  onCreated: (subject: ProgrammingSubject) => void;
}

export function CreateSubjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const subject = await api.createCodingSubject({
        name: name.trim(),
        description: description.trim() || undefined,
        icon_emoji: emoji.trim() || undefined,
      });
      onCreated(subject);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar matéria.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">Nova Matéria</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="⚛️"
              maxLength={2}
              className="w-16 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xl outline-none focus:border-primary"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da matéria (ex: React)"
              maxLength={100}
              required
              autoFocus
              className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            maxLength={500}
            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-primary"
          />
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Criar Matéria'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CreateTopicModal.tsx**

Create `apps/web/src/components/coding/CreateTopicModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { api, type ProgrammingTopic } from '@/lib/api';

interface Props {
  subjectId: number;
  topicCount: number;
  onClose: () => void;
  onCreated: (topic: ProgrammingTopic) => void;
}

export function CreateTopicModal({ subjectId, topicCount, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [generateAI, setGenerateAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const topic = await api.createCodingTopic(subjectId, {
        title: title.trim(),
        order_index: topicCount,
        generate_ai: generateAI,
      });
      onCreated(topic);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar tópico.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">Novo Tópico</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome do tópico (ex: useState Hook)"
            maxLength={200}
            required
            autoFocus
            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
          />
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-violet-100 bg-violet-50 px-4 py-3">
            <input
              type="checkbox"
              checked={generateAI}
              onChange={(e) => setGenerateAI(e.target.checked)}
              className="h-5 w-5 rounded accent-violet-600"
            />
            <div>
              <p className="flex items-center gap-1.5 text-sm font-black text-violet-800">
                <Sparkles size={14} /> Gerar aula com IA
              </p>
              <p className="text-xs text-violet-600">Cria seções, quiz e flashcards automaticamente</p>
            </div>
          </label>
          {loading && generateAI && (
            <p className="text-center text-sm font-semibold text-violet-600">Gerando conteúdo com IA... pode demorar alguns segundos.</p>
          )}
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TopicView.tsx**

Create `apps/web/src/components/coding/TopicView.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, Loader2, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { api, type AIQuizQuestion, type ProgrammingFlashcard, type ProgrammingTopic } from '@/lib/api';

interface Props {
  topic: ProgrammingTopic;
  subjectName: string;
  onBack: () => void;
  onTopicUpdated: (topic: ProgrammingTopic) => void;
}

type QuizState = { answered: boolean; selected: string; correct: boolean }[];

export function TopicView({ topic: initialTopic, subjectName, onBack, onTopicUpdated }: Props) {
  const [topic, setTopic] = useState(initialTopic);
  const [flashcards, setFlashcards] = useState<ProgrammingFlashcard[]>([]);
  const [loadingFc, setLoadingFc] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [notes, setNotes] = useState(topic.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [quizState, setQuizState] = useState<QuizState>([]);
  const [showAddFc, setShowAddFc] = useState(false);
  const [addFcFront, setAddFcFront] = useState('');
  const [addFcBack, setAddFcBack] = useState('');
  const [addFcCode, setAddFcCode] = useState('');
  const [addingFc, setAddingFc] = useState(false);

  useEffect(() => {
    setLoadingFc(true);
    api.getTopicFlashcards(topic.id)
      .then(setFlashcards)
      .finally(() => setLoadingFc(false));
  }, [topic.id]);

  useEffect(() => {
    if (topic.ai_content?.quiz) {
      setQuizState(topic.ai_content.quiz.map(() => ({ answered: false, selected: '', correct: false })));
    }
  }, [topic.ai_content]);

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    try {
      const updated = await api.generateCodingTopicContent(topic.id);
      setTopic(updated);
      onTopicUpdated(updated);
      const fcs = await api.getTopicFlashcards(topic.id);
      setFlashcards(fcs);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Erro ao gerar conteúdo.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const updated = await api.updateCodingTopic(topic.id, { notes });
      setTopic(updated);
      onTopicUpdated(updated);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleSetStatus(status: 'studied' | 'mastered') {
    const updated = await api.updateCodingTopic(topic.id, { status });
    setTopic(updated);
    onTopicUpdated(updated);
  }

  async function handleAddFlashcard(e: React.FormEvent) {
    e.preventDefault();
    if (!addFcFront.trim() || !addFcBack.trim()) return;
    setAddingFc(true);
    try {
      const fc = await api.createTopicFlashcard(topic.id, {
        front: addFcFront.trim(),
        back: addFcBack.trim(),
        code_example: addFcCode.trim() || undefined,
      });
      setFlashcards((prev) => [...prev, fc]);
      setAddFcFront('');
      setAddFcBack('');
      setAddFcCode('');
      setShowAddFc(false);
    } finally {
      setAddingFc(false);
    }
  }

  async function handleDeleteFlashcard(id: number) {
    await api.deleteCodingFlashcard(id);
    setFlashcards((prev) => prev.filter((fc) => fc.id !== id));
  }

  function handleQuizAnswer(qIdx: number, option: string, question: AIQuizQuestion) {
    setQuizState((prev) =>
      prev.map((s, i) =>
        i === qIdx ? { answered: true, selected: option, correct: option === question.correct_option } : s,
      ),
    );
  }

  const statusLabel =
    topic.status === 'mastered' ? '⭐ Dominado' : topic.status === 'studied' ? '✅ Estudado' : '🔘 Não iniciado';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="kid-surface border-primary/30 p-6">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary">
          <ArrowLeft size={16} /> {subjectName}
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{statusLabel}</span>
            <h1 className="mt-2 text-2xl font-black text-slate-800">{topic.title}</h1>
          </div>
          <div className="flex gap-2">
            {topic.status !== 'mastered' && (
              <button
                type="button"
                onClick={() => handleSetStatus(topic.status === 'studied' ? 'mastered' : 'studied')}
                className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-black text-white hover:bg-emerald-600"
              >
                {topic.status === 'studied' ? <><Star size={14} /> Dominar</> : <><CheckCircle2 size={14} /> Estudado</>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Generate button or AI content */}
      {!topic.ai_content ? (
        <div className="rounded-3xl border-2 border-violet-100 bg-violet-50 p-8 text-center">
          <Sparkles size={32} className="mx-auto mb-3 text-violet-400" />
          <p className="font-bold text-violet-700">Nenhum conteúdo ainda.</p>
          <p className="mt-1 text-sm text-violet-500">Gere a aula com IA para criar seções, quiz e flashcards automaticamente.</p>
          {genError && <p className="mt-3 text-sm font-bold text-rose-600">{genError}</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mx-auto mt-4 flex items-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 font-black text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Gerar com IA
          </button>
        </div>
      ) : (
        <>
          {/* Sections */}
          <div className="space-y-4">
            {topic.ai_content.sections.map((section, i) => (
              <div key={i} className="rounded-3xl border-2 border-slate-100 bg-white p-5">
                <h3 className="mb-2 text-base font-black text-slate-800">{section.title}</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{section.body}</p>
                {section.code_example && (
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">
                    <code>{section.code_example}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>

          {/* Quiz */}
          {topic.ai_content.quiz.length > 0 && (
            <div className="rounded-3xl border-2 border-amber-100 bg-amber-50 p-5">
              <h2 className="mb-4 flex items-center gap-2 font-black text-amber-800">
                <BookOpen size={18} /> Quiz ({topic.ai_content.quiz.length} perguntas)
              </h2>
              <div className="space-y-5">
                {topic.ai_content.quiz.map((q, qIdx) => {
                  const state = quizState[qIdx];
                  return (
                    <div key={q.id} className="rounded-2xl bg-white p-4">
                      <p className="mb-3 font-semibold text-slate-800">{qIdx + 1}. {q.question}</p>
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const isSelected = state?.selected === opt;
                          const isCorrect = opt === q.correct_option;
                          const answered = state?.answered;
                          let cls = 'rounded-xl border-2 px-4 py-2.5 text-sm font-semibold text-left w-full transition ';
                          if (!answered) cls += 'border-slate-200 hover:border-primary cursor-pointer';
                          else if (isCorrect) cls += 'border-emerald-400 bg-emerald-50 text-emerald-700';
                          else if (isSelected) cls += 'border-rose-300 bg-rose-50 text-rose-700';
                          else cls += 'border-slate-100 text-slate-400';
                          return (
                            <button key={opt} type="button" className={cls} disabled={answered} onClick={() => handleQuizAnswer(qIdx, opt, q)}>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {state?.answered && (
                        <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${state.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {state.correct ? '✅ Correto! ' : '❌ Incorreto. '}{q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regenerate */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Regenerar com IA
            </button>
          </div>
        </>
      )}

      {/* Notes */}
      <div className="rounded-3xl border-2 border-slate-100 bg-white p-5">
        <h2 className="mb-3 font-black text-slate-800">Minhas Notas</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anote o que aprendeu, dúvidas, links..."
          maxLength={5000}
          rows={4}
          className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={handleSaveNotes}
          disabled={savingNotes || notes === (topic.notes ?? '')}
          className="mt-2 rounded-2xl bg-primary px-5 py-2 text-sm font-black text-white hover:bg-primary-dark disabled:opacity-40"
        >
          {savingNotes ? 'Salvando...' : 'Salvar Notas'}
        </button>
      </div>

      {/* Flashcards */}
      <div className="rounded-3xl border-2 border-slate-100 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black text-slate-800">Flashcards ({loadingFc ? '...' : flashcards.length})</h2>
          <button
            type="button"
            onClick={() => setShowAddFc((v) => !v)}
            className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:border-primary"
          >
            {showAddFc ? <X size={14} /> : <Plus size={14} />}
            {showAddFc ? 'Cancelar' : 'Adicionar'}
          </button>
        </div>
        {showAddFc && (
          <form onSubmit={handleAddFlashcard} className="mb-4 space-y-3 rounded-2xl bg-slate-50 p-4">
            <input value={addFcFront} onChange={(e) => setAddFcFront(e.target.value)} placeholder="Frente (conceito / pergunta)" maxLength={500} required className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-primary" />
            <textarea value={addFcBack} onChange={(e) => setAddFcBack(e.target.value)} placeholder="Verso (resposta / explicação)" maxLength={2000} required rows={3} className="w-full resize-none rounded-xl border-2 border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary" />
            <textarea value={addFcCode} onChange={(e) => setAddFcCode(e.target.value)} placeholder="Exemplo de código (opcional)" maxLength={3000} rows={2} className="w-full resize-none rounded-xl border-2 border-slate-900 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-violet-400" />
            <button type="submit" disabled={addingFc || !addFcFront.trim() || !addFcBack.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 font-black text-white hover:bg-primary-dark disabled:opacity-50">
              {addingFc ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar Flashcard
            </button>
          </form>
        )}
        {loadingFc ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin text-primary" size={24} /></div>
        ) : (
          <div className="space-y-3">
            {flashcards.map((fc) => (
              <div key={fc.id} className="rounded-2xl border-2 border-slate-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">{fc.front}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{fc.back}</p>
                    {fc.code_example && (
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
                        <code>{fc.code_example}</code>
                      </pre>
                    )}
                  </div>
                  <button type="button" onClick={() => handleDeleteFlashcard(fc.id)} className="shrink-0 rounded-xl p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {flashcards.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">Nenhum flashcard. Gere com IA ou adicione manualmente.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ReviewSession.tsx**

Create `apps/web/src/components/coding/ReviewSession.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, X, XCircle } from 'lucide-react';
import { api, type CodingReviewCard } from '@/lib/api';

interface Props {
  subjectName: string;
  cards: CodingReviewCard[];
  onClose: () => void;
}

type Mode = 'flip' | 'choice';

interface CardState {
  revealed: boolean;
  done: boolean;
  correct: boolean | null;
}

export function ReviewSession({ subjectName, cards, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('flip');
  const [states, setStates] = useState<CardState[]>(cards.map(() => ({ revealed: false, done: false, correct: null })));
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);

  const card = cards[index];
  const state = states[index];
  const total = cards.length;
  const correct = states.filter((s) => s.correct === true).length;
  const wrong = states.filter((s) => s.correct === false).length;

  // Build multiple-choice options once (stable)
  const [choiceOptions] = useState(() =>
    cards.map((c) => {
      const correctAns = c.back.slice(0, 120);
      const others = cards
        .filter((o) => o.flashcard_id !== c.flashcard_id)
        .map((o) => o.back.slice(0, 120))
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      return [correctAns, ...others].sort(() => Math.random() - 0.5);
    }),
  );

  async function handleAnswer(isCorrect: boolean) {
    setSubmitting(true);
    try {
      await api.submitCodingReviewAttempt({ review_item_id: card.review_item_id, correct: isCorrect });
    } finally {
      setSubmitting(false);
    }
    setStates((prev) => prev.map((s, i) => (i === index ? { ...s, done: true, correct: isCorrect } : s)));
    if (index + 1 >= total) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="rounded-full bg-emerald-100 p-6">
          <CheckCircle2 size={48} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-800">Revisão concluída!</h2>
        <div className="flex gap-8">
          <div><p className="text-3xl font-black text-emerald-600">{correct}</p><p className="text-sm font-bold text-slate-500">Acertos</p></div>
          <div><p className="text-3xl font-black text-rose-500">{wrong}</p><p className="text-sm font-bold text-slate-500">Erros</p></div>
          <div><p className="text-3xl font-black text-slate-700">{total}</p><p className="text-sm font-bold text-slate-500">Total</p></div>
        </div>
        <button type="button" onClick={onClose} className="rounded-2xl bg-primary px-8 py-3 font-black text-white hover:bg-primary-dark">
          Fechar
        </button>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Revisão · {subjectName}</p>
          <p className="text-sm font-bold text-slate-600">{index + 1} / {total}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-2xl border-2 border-slate-200">
            {(['flip', 'choice'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-2 text-xs font-black transition ${mode === m ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                {m === 'flip' ? 'Flip' : 'Múltipla'}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      {/* Card */}
      <div className="min-h-48 rounded-3xl border-2 border-slate-100 bg-white p-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Frente</p>
        <p className="text-lg font-black text-slate-800">{card.front}</p>

        {mode === 'flip' && (
          <>
            {!state.revealed ? (
              <button
                type="button"
                onClick={() => setStates((prev) => prev.map((s, i) => (i === index ? { ...s, revealed: true } : s)))}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary py-3 font-black text-primary hover:bg-primary-light"
              >
                <ChevronRight size={18} /> Revelar resposta
              </button>
            ) : (
              <>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Verso</p>
                  <p className="leading-relaxed text-slate-700">{card.back}</p>
                  {card.code_example && (
                    <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-3 text-xs text-slate-100">
                      <code>{card.code_example}</code>
                    </pre>
                  )}
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleAnswer(false)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 py-3 font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={18} />} Não sabia
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleAnswer(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 py-3 font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={18} />} Sabia!
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {mode === 'choice' && (
          <div className="mt-5 space-y-2">
            {choiceOptions[index].map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={state.done || submitting}
                onClick={() => handleAnswer(opt === card.back.slice(0, 120))}
                className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-primary disabled:cursor-default disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create CodingCurriculum.tsx**

Create `apps/web/src/components/coding/CodingCurriculum.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, CheckCircle2, Flame, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, type CodingReviewCard, type ProgrammingSubject, type ProgrammingTopic } from '@/lib/api';
import { CreateSubjectModal } from './CreateSubjectModal';
import { CreateTopicModal } from './CreateTopicModal';
import { TopicView } from './TopicView';
import { ReviewSession } from './ReviewSession';

type View =
  | { type: 'subjects' }
  | { type: 'topics'; subject: ProgrammingSubject }
  | { type: 'topic'; subject: ProgrammingSubject; topic: ProgrammingTopic }
  | { type: 'review'; subject: ProgrammingSubject; cards: CodingReviewCard[] };

export function CodingCurriculum() {
  const [view, setView] = useState<View>({ type: 'subjects' });
  const [subjects, setSubjects] = useState<ProgrammingSubject[]>([]);
  const [topics, setTopics] = useState<ProgrammingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSubjects();
  }, []);

  async function loadSubjects() {
    setLoading(true);
    setError('');
    try {
      setSubjects(await api.getCodingSubjects());
    } catch {
      setError('Erro ao carregar matérias.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTopics(subject: ProgrammingSubject) {
    setLoadingTopics(true);
    try {
      setTopics(await api.getCodingTopics(subject.id));
      setView({ type: 'topics', subject });
    } finally {
      setLoadingTopics(false);
    }
  }

  async function handleStartReview(subject: ProgrammingSubject) {
    setLoadingReview(true);
    try {
      const session = await api.getCodingReview(subject.id);
      if (session.total_due === 0) {
        alert('Nenhum flashcard para revisar agora. Continue estudando e volte mais tarde!');
        return;
      }
      setView({ type: 'review', subject, cards: session.items });
    } finally {
      setLoadingReview(false);
    }
  }

  async function handleDeleteSubject(id: number) {
    if (!confirm('Remover esta matéria e todos os seus tópicos e flashcards?')) return;
    await api.deleteCodingSubject(id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    if (view.type !== 'subjects') setView({ type: 'subjects' });
  }

  async function handleDeleteTopic(id: number, subject: ProgrammingSubject) {
    if (!confirm('Remover este tópico e seus flashcards?')) return;
    await api.deleteCodingTopic(id);
    setTopics((prev) => prev.filter((t) => t.id !== id));
    await loadSubjects();
    if (view.type === 'topic') setView({ type: 'topics', subject });
  }

  // ── Subjects view ────────────────────────────────────────────────────────
  if (view.type === 'subjects') {
    return (
      <div className="space-y-6">
        <section className="kid-surface border-primary/30 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Programação · Currículo</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800">Minhas Matérias</h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricChip icon={<BookOpen size={20} />} label="Matérias" value={subjects.length} tone="sky" />
            <MetricChip icon={<CheckCircle2 size={20} />} label="Tópicos estudados" value={subjects.reduce((a, s) => a + s.studied_count, 0)} tone="green" />
            <MetricChip icon={<Flame size={20} />} label="Para revisar" value={subjects.reduce((a, s) => a + s.due_review_count, 0)} tone="orange" />
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={32} /></div>
        ) : (
          <>
            {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((subject) => (
                <div
                  key={subject.id}
                  className="group cursor-pointer rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  onClick={() => loadTopics(subject)}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-2xl">
                      {subject.icon_emoji || '📚'}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSubject(subject.id); }}
                      className="rounded-xl p-1.5 text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h3 className="font-black text-slate-800">{subject.name}</h3>
                  {subject.description && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{subject.description}</p>}
                  <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-slate-500">
                    <span>{subject.studied_count}/{subject.topic_count} estudados</span>
                    {subject.due_review_count > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-700">{subject.due_review_count} para revisar</span>
                    )}
                  </div>
                  {subject.topic_count > 0 && (
                    <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${(subject.studied_count / subject.topic_count) * 100}%` }}
                      />
                    </div>
                  )}
                  <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={loadingTopics}
                      onClick={() => loadTopics(subject)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 py-2 text-xs font-black text-white hover:bg-primary-dark disabled:opacity-50"
                    >
                      {loadingTopics ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />} Estudar
                    </button>
                    <button
                      type="button"
                      disabled={loadingReview || subject.due_review_count === 0}
                      onClick={() => handleStartReview(subject)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                    >
                      {loadingReview ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />} Revisar
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowCreateSubject(true)}
                className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-slate-200 bg-white p-5 text-slate-400 transition hover:border-primary hover:text-primary-dark"
              >
                <Plus size={28} />
                <span className="font-black">Nova Matéria</span>
              </button>
            </div>
          </>
        )}
        {showCreateSubject && (
          <CreateSubjectModal
            onClose={() => setShowCreateSubject(false)}
            onCreated={(s) => { setSubjects((prev) => [...prev, s]); setShowCreateSubject(false); }}
          />
        )}
      </div>
    );
  }

  // ── Topics view ──────────────────────────────────────────────────────────
  if (view.type === 'topics') {
    const { subject } = view;
    const statusIcon = (s: string) => s === 'mastered' ? '⭐' : s === 'studied' ? '✅' : '🔘';
    return (
      <div className="space-y-6">
        <section className="kid-surface border-primary/30 p-6">
          <button type="button" onClick={() => setView({ type: 'subjects' })} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary">
            <ArrowLeft size={16} /> Todas as matérias
          </button>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{subject.icon_emoji || '📚'}</span>
            <div>
              <h1 className="text-2xl font-black text-slate-800">{subject.name}</h1>
              {subject.description && <p className="text-sm text-slate-500">{subject.description}</p>}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm font-semibold text-slate-500">
            <span>{subject.studied_count}/{subject.topic_count} tópicos estudados</span>
            {subject.due_review_count > 0 && (
              <button
                type="button"
                onClick={() => handleStartReview(subject)}
                disabled={loadingReview}
                className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-black text-amber-700 hover:bg-amber-200"
              >
                {loadingReview ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                {subject.due_review_count} para revisar
              </button>
            )}
          </div>
        </section>

        <div className="space-y-3">
          {loadingTopics ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={28} /></div>
          ) : topics.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-bold text-slate-500">Nenhum tópico ainda.</p>
              <p className="mt-1 text-sm text-slate-400">Crie o primeiro tópico do roteiro.</p>
            </div>
          ) : (
            topics.map((topic, idx) => (
              <div
                key={topic.id}
                className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-slate-100 bg-white px-5 py-4 transition hover:border-primary/40"
                onClick={() => setView({ type: 'topic', subject, topic })}
              >
                <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-400">{idx + 1}</span>
                <span className="text-lg">{statusIcon(topic.status)}</span>
                <div className="flex-1">
                  <p className="font-black text-slate-800">{topic.title}</p>
                  <p className="text-xs text-slate-400">
                    {topic.flashcard_count} flashcard{topic.flashcard_count !== 1 ? 's' : ''}
                    {!topic.ai_content && ' · sem aula gerada'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteTopic(topic.id, subject); }}
                  className="shrink-0 rounded-xl p-1.5 text-slate-300 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setShowCreateTopic(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-4 font-black text-slate-400 hover:border-primary hover:text-primary-dark"
          >
            <Plus size={18} /> Novo Tópico
          </button>
        </div>

        {showCreateTopic && (
          <CreateTopicModal
            subjectId={subject.id}
            topicCount={topics.length}
            onClose={() => setShowCreateTopic(false)}
            onCreated={(t) => {
              setTopics((prev) => [...prev, t]);
              setShowCreateTopic(false);
              loadSubjects();
            }}
          />
        )}
      </div>
    );
  }

  // ── Topic detail view ────────────────────────────────────────────────────
  if (view.type === 'topic') {
    const { subject, topic } = view;
    return (
      <TopicView
        topic={topic}
        subjectName={subject.name}
        onBack={() => setView({ type: 'topics', subject })}
        onTopicUpdated={(updated) => {
          setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          loadSubjects();
        }}
      />
    );
  }

  // ── Review session view ──────────────────────────────────────────────────
  if (view.type === 'review') {
    const { subject, cards } = view;
    return (
      <ReviewSession
        subjectName={subject.name}
        cards={cards}
        onClose={() => {
          loadSubjects();
          setView({ type: 'topics', subject });
        }}
      />
    );
  }

  return null;
}

function MetricChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'sky' | 'green' | 'orange' }) {
  const colors = { sky: 'bg-sky-50 text-sky-700', green: 'bg-emerald-50 text-emerald-700', orange: 'bg-amber-50 text-amber-700' };
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${colors[tone]}`}>
      {icon}
      <div>
        <p className="text-xl font-black">{value}</p>
        <p className="text-xs font-semibold opacity-75">{label}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit components**

```bash
git add apps/web/src/components/coding/
git commit -m "feat: add CodingCurriculum frontend components (subjects, topics, review, modals)"
```

---

### Task 8: Replace CodingTab in study/page.tsx

**Files:**
- Modify: `apps/web/src/app/study/page.tsx`

- [ ] **Step 1: Add CodingCurriculum import**

In `apps/web/src/app/study/page.tsx`, find the last import line at the top of the file. Add after it:

```typescript
import { CodingCurriculum } from '@/components/coding/CodingCurriculum';
```

- [ ] **Step 2: Replace the CodingTab return body**

In `apps/web/src/app/study/page.tsx`, find the `return (` inside `function CodingTab`. It currently opens with:

```tsx
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="kid-surface border-primary/30 p-6 md:p-8">
```

Replace the **entire return block** of `CodingTab` (everything from `return (` to the matching closing `);`) with:

```tsx
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.45fr]">
      <div>
        <CodingCurriculum />
      </div>
      <aside className="space-y-6">
        <PomodoroWidget
          mode={pomodoroMode}
          seconds={pomodoroSeconds}
          running={pomodoroRunning}
          todayCount={todayPomodoroCount}
          notificationPermission={notificationPermission}
          message={pomodoroMessage}
          onToggle={onTogglePomodoro}
          onSwitch={onSwitchPomodoro}
          onRequestNotifications={onRequestNotifications}
        />
      </aside>
    </div>
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Manual smoke test in browser**

Start dev server:
```bash
cd apps/web && pnpm dev
```

Navigate to `http://localhost:3000/study?tab=coding` and verify:
1. Subjects grid appears with "Nova Matéria" button — no old checkbox UI
2. "Nova Matéria" modal opens, creates a subject (e.g. "React" with emoji "⚛️")
3. Clicking the subject card opens the topics list
4. "Novo Tópico" creates a topic; with "Gerar com IA" checked, AI content appears after save
5. Clicking a topic opens `TopicView` with sections, quiz, flashcards panel, and notes field
6. Marking topic as "Estudado" updates the status chip
7. "Revisar" button on a subject (once flashcards exist) starts the `ReviewSession`
8. Both Flip and Múltipla modes work in review; finishing shows the score screen
9. Pomodoro widget still visible in the right sidebar

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/study/page.tsx
git commit -m "feat: replace CodingTab with CodingCurriculum curriculum system"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Create matéria (subject) — Tasks 1, 5 (POST /subjects), 7 (CreateSubjectModal, CodingCurriculum)
- ✅ Roteiro de tópicos ordenado, sem bloqueio — Task 5 (ordered by order_index, all freely accessible)
- ✅ Aula gerada por IA (seções + quiz + flashcards) — Task 4 (generate_topic_ai_content), Task 5 (/generate endpoint)
- ✅ Editável manualmente (notas, flashcards, status) — Tasks 5+7 (PUT topic, add flashcard, notes field)
- ✅ Flashcards por tópico — Tasks 1, 5 (ProgrammingFlashcard + CRUD endpoints), 7 (TopicView flashcard panel)
- ✅ Revisão espaçada SM-2 — Task 4 (coding_service.py mirrors review_service.py exactly), Task 5 (/review endpoints)
- ✅ Flip card mode — Task 7 (ReviewSession.tsx)
- ✅ Múltipla escolha mode — Task 7 (ReviewSession.tsx with choiceOptions)
- ✅ Substituir aba Coding — Task 8 (CodingTab return replaced)
- ✅ Pomodoro kept — Task 8 (PomodoroWidget in sidebar)
- ✅ CodingDay (antigo) não quebra — no changes to existing endpoints or models

**Type consistency:**
- `ProgrammingSubjectSchema` (backend) ↔ `ProgrammingSubject` (frontend) — fields match
- `ProgrammingTopicSchema` (backend) ↔ `ProgrammingTopic` (frontend) — fields match including `ai_content`, `flashcard_count`
- `CodingReviewCardSchema` (backend) ↔ `CodingReviewCard` (frontend) — fields match
- `seed_coding_review_item` called in Tasks 5 after every flashcard creation — consistent
- `VALID_TOPIC_STATUSES` = `{"not_started", "studied", "mastered"}` matches `TopicStatus` enum and frontend `status` type
