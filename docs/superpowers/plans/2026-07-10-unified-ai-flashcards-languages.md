# Unified AI Flashcards: Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lesson-linked AI questions for English, French, and every target language, showing the same saved questions in lessons and language review.

**Architecture:** Preserve the existing deterministic vocabulary `ReviewItem` flow and add a child-owned `LessonQuestion` model with its own scheduling state. Language lesson responses expose canonical questions; the review endpoint returns a discriminated mix of vocabulary and lesson-question cards.

**Tech Stack:** FastAPI, SQLModel, Alembic, Pydantic discriminated unions, Next.js 14, React, TypeScript, Python integration/source tests.

---

## File Map

- Create `apps/api/alembic/versions/0006_lesson_questions.py`: language-question table.
- Create `apps/api/services/language_question_service.py`: scheduling, prompt construction, and review-card building.
- Create `scripts/test_language_ai_questions.py`: model, route, prompt, and UI contract tests.
- Modify `apps/api/models/database.py`: `LessonQuestion` model.
- Modify `apps/api/schemas/schemas.py`: lesson question, generation, mixed review, and attempt schemas.
- Modify `apps/api/main.py`: include lesson questions, generate five, and grade mixed review cards.
- Modify `apps/api/services/review_service.py`: merge due vocabulary and lesson questions.
- Modify `apps/web/src/lib/api.ts`: language question and mixed review types/clients.
- Modify `apps/web/src/app/lesson/page.tsx`: lesson question list and inline generation.
- Modify `apps/web/src/app/review/page.tsx`: mixed renderer and review-side generation.
- Modify `scripts/test_api_routes.py`: French generation and mixed review integration coverage.

### Task 1: Persist canonical lesson questions

**Files:**
- Create: `apps/api/alembic/versions/0006_lesson_questions.py`
- Modify: `apps/api/models/database.py`
- Modify: `apps/api/schemas/schemas.py`
- Create: `scripts/test_language_ai_questions.py`

- [ ] **Step 1: Write failing model/migration assertions**

```python
# scripts/test_language_ai_questions.py
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
models = (ROOT / "apps/api/models/database.py").read_text(encoding="utf-8")
schemas = (ROOT / "apps/api/schemas/schemas.py").read_text(encoding="utf-8")
migration = ROOT / "apps/api/alembic/versions/0006_lesson_questions.py"

assert "class LessonQuestion(SQLModel, table=True)" in models
assert "class LessonQuestionSchema" in schemas
assert migration.exists()
assert 'revision: str = "0006"' in migration.read_text(encoding="utf-8")
assert 'down_revision' in migration.read_text(encoding="utf-8") and '"0005"' in migration.read_text(encoding="utf-8")
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_language_ai_questions.py`

Expected: FAIL on the missing `LessonQuestion` model.

- [ ] **Step 3: Add the SQLModel**

```python
class LessonQuestion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="childprofile.id", index=True)
    lesson_id: int = Field(foreign_key="lesson.id", index=True)
    target_language: str = Field(max_length=40)
    question_type: str = Field(max_length=40)
    front: str = Field(max_length=500)
    back: str = Field(max_length=2000)
    supporting_example: Optional[str] = Field(default=None, max_length=1000)
    difficulty_score: float = Field(default=0.45)
    attempt_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    error_count: int = Field(default=0)
    streak: int = Field(default=0)
    last_reviewed: Optional[datetime] = Field(default=None)
    next_review: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 4: Add migration and response schema**

Create the same columns, foreign keys, and indexes in revision `0006`, with `down_revision = "0005"`. The downgrade drops both indexes before the table.

```python
class LessonQuestionSchema(FromAttributesModel):
    id: int
    lesson_id: int
    target_language: str
    question_type: str
    front: str
    back: str
    supporting_example: Optional[str] = None
    created_at: datetime
```

Add `questions: List[LessonQuestionSchema] = Field(default_factory=list)` to `LessonSchema`.

- [ ] **Step 5: Run model test and migration upgrade/downgrade smoke check**

Run:

```bash
python scripts/test_language_ai_questions.py
cd apps/api && alembic upgrade head && alembic downgrade 0005 && alembic upgrade head
```

Expected: test exits 0 and Alembic completes all three operations without SQL errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/models/database.py apps/api/schemas/schemas.py apps/api/alembic/versions/0006_lesson_questions.py scripts/test_language_ai_questions.py
git commit -m "feat: persist language lesson questions"
```

### Task 2: Generate five varied questions in the lesson language

**Files:**
- Create: `apps/api/services/language_question_service.py`
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Modify: `scripts/test_language_ai_questions.py`

- [ ] **Step 1: Add failing service/route assertions**

```python
service = ROOT / "apps/api/services/language_question_service.py"
main = (ROOT / "apps/api/main.py").read_text(encoding="utf-8")
assert service.exists()
service_source = service.read_text(encoding="utf-8")
for question_type in ("vocabulary", "translation", "sentence_completion", "grammar", "comprehension", "contextual_usage"):
    assert question_type in service_source
assert "target_language" in service_source
assert '@app.post("/api/lessons/{lesson_id}/questions/generate"' in main
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_language_ai_questions.py`

Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Add generation schema and prompt builder**

```python
class GenerateLessonQuestionsSchema(BaseModel):
    context: Optional[str] = Field(default=None, max_length=1000)
```

Implement `build_language_questions_prompt` with explicit inputs: lesson title, theme, objective, target language, base language, serialized lesson items/breakdowns, existing fronts, and sanitized context. Require five questions with at least three distinct `question_type` values chosen from the six supported types. The response JSON uses `front`, `back`, `question_type`, and optional `supporting_example`.

- [ ] **Step 4: Implement the atomic endpoint**

Verify that the selected lesson is accessible to the active child. Use the child's `target_language` and `base_language`, fetch lesson items and saved questions, call the configured AI once, validate five unique cards with `validate_card_batch`, validate at least three distinct allowed types, insert five `LessonQuestion` rows, commit once, and return them.

- [ ] **Step 5: Add real integration coverage**

In `scripts/test_api_routes.py`, set the child target language to `French`, monkeypatch the AI JSON response with five questions across grammar, vocabulary, translation, completion, and comprehension, call the endpoint, assert one AI call, five persisted questions all report `French`, and GET the lesson to assert the same IDs/fronts are returned. Separately monkeypatch generation to raise during `POST /api/lesson/complete`; completion must still succeed because deterministic vocabulary seeding makes no AI call.

- [ ] **Step 6: Run backend tests**

Run:

```bash
python scripts/test_ai_flashcard_service.py
python scripts/test_language_ai_questions.py
python scripts/test_api_routes.py
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/services/language_question_service.py apps/api/schemas/schemas.py apps/api/main.py scripts/test_language_ai_questions.py scripts/test_api_routes.py
git commit -m "feat: generate questions for any lesson language"
```

### Task 3: Return and grade mixed language review cards

**Files:**
- Modify: `apps/api/services/language_question_service.py`
- Modify: `apps/api/services/review_service.py`
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Modify: `scripts/test_language_ai_questions.py`

- [ ] **Step 1: Add failing mixed-review assertions**

```python
schemas = (ROOT / "apps/api/schemas/schemas.py").read_text(encoding="utf-8")
review = (ROOT / "apps/api/services/review_service.py").read_text(encoding="utf-8")
main = (ROOT / "apps/api/main.py").read_text(encoding="utf-8")
assert 'Literal["vocabulary"]' in schemas
assert 'Literal["lesson_question"]' in schemas
assert "lesson_question_id" in schemas
assert "build_mixed_review_cards" in review
assert "register_lesson_question_attempt" in main
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_language_ai_questions.py`

Expected: FAIL on the missing discriminated schemas.

- [ ] **Step 3: Define discriminated review schemas**

```python
class VocabularyReviewCardSchema(BaseModel):
    card_type: Literal["vocabulary"] = "vocabulary"
    review_item_id: int
    prompt: str
    answer: str
    options: List[str] = Field(default_factory=list)
    word_en: str
    word_pt: str
    difficulty_score: float
    error_count: int


class LessonQuestionReviewCardSchema(BaseModel):
    card_type: Literal["lesson_question"] = "lesson_question"
    lesson_question_id: int
    lesson_id: int
    prompt: str
    answer: str
    question_type: str
    supporting_example: Optional[str] = None
    difficulty_score: float
    error_count: int
```

Use `Annotated[Union[VocabularyReviewCardSchema, LessonQuestionReviewCardSchema], Field(discriminator="card_type")]` for `ReviewSessionSchema.items`. Change attempts to carry `card_type`, optional vocabulary fields/ID, optional `lesson_question_id`, and `correct`; validate the matching ID branch.

- [ ] **Step 4: Implement question scheduling and mixed ordering**

Add `register_lesson_question_attempt` using the same correct/incorrect intervals as `register_review_attempt`. `build_mixed_review_cards` fetches due vocabulary and lesson questions, computes the existing priority formula for both, sorts one combined list, and slices once by `limit` so neither card type can exceed the session limit.

- [ ] **Step 5: Branch the review attempt endpoint**

If `card_type == "lesson_question"`, require and own-check `lesson_question_id`; otherwise preserve the vocabulary path. Return a generic result with `card_type`, `card_id`, `difficulty_score`, `next_review`, `error_count`, and `correct_count`.

- [ ] **Step 6: Extend integration tests**

After creating French questions, call `/api/review` and assert both `vocabulary` and `lesson_question` cards are accepted. Submit one lesson-question attempt, assert status 200, and verify its next review moved forward without changing a vocabulary row.

- [ ] **Step 7: Run backend verification**

Run:

```bash
python scripts/test_language_ai_questions.py
python scripts/test_api_routes.py
```

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/services/language_question_service.py apps/api/services/review_service.py apps/api/schemas/schemas.py apps/api/main.py scripts/test_language_ai_questions.py scripts/test_api_routes.py
git commit -m "feat: mix lesson questions into language review"
```

### Task 4: Language API client and lesson entry point

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/lesson/page.tsx`
- Modify: `scripts/test_language_ai_questions.py`

- [ ] **Step 1: Add failing lesson UI assertions**

```python
api = (ROOT / "apps/web/src/lib/api.ts").read_text(encoding="utf-8")
lesson = (ROOT / "apps/web/src/app/lesson/page.tsx").read_text(encoding="utf-8")
assert "LessonQuestion" in api
assert "generateLessonQuestions" in api
assert "Criar mais quest" in lesson
assert "lessonQuestionContext" in lesson
assert "lesson.questions.map" in lesson
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_language_ai_questions.py`

Expected: FAIL on the missing TypeScript type/client.

- [ ] **Step 3: Add client types and method**

```typescript
export interface LessonQuestion {
  id: number;
  lesson_id: number;
  target_language: string;
  question_type: string;
  front: string;
  back: string;
  supporting_example: string | null;
  created_at: string;
}

generateLessonQuestions: (lessonId: number, context?: string) =>
  fetchAPI<LessonQuestion[]>(`/api/lessons/${lessonId}/questions/generate`, {
    method: 'POST', body: JSON.stringify({ context: context?.trim() || null }),
  }),
```

Add `questions: LessonQuestion[]` to `Lesson`.

- [ ] **Step 4: Add the lesson question section and form**

Render saved questions with front, expandable back, question-type label, and supporting example. Add the inline context form with fixed-count copy. On success merge the returned five into `lesson.questions`; do not reload or regenerate the lesson itself.

- [ ] **Step 5: Run focused and web verification**

Run:

```bash
python scripts/test_language_ai_questions.py
cd apps/web && pnpm lint && pnpm build
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/lesson/page.tsx scripts/test_language_ai_questions.py
git commit -m "feat: generate questions from language lessons"
```

### Task 5: Mixed review UI and review-side generation

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/review/page.tsx`
- Modify: `scripts/test_language_ai_questions.py`

- [ ] **Step 1: Add failing review UI assertions**

```python
review = (ROOT / "apps/web/src/app/review/page.tsx").read_text(encoding="utf-8")
assert "card.card_type === 'lesson_question'" in review
assert "lesson_question_id" in review
assert "Criar mais quest" in review
assert "selectedLessonId" in review
assert "api.getAllLessons" in review
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_language_ai_questions.py`

Expected: FAIL on the missing mixed-card branch.

- [ ] **Step 3: Update TypeScript review unions**

Define `VocabularyReviewCard` and `LessonQuestionReviewCard` with literal `card_type` values and use a union for `ReviewSession.items`. Update `submitReviewAttempt` to send either vocabulary or lesson-question identifiers.

- [ ] **Step 4: Render and grade lesson questions**

Keep the current multiple-choice UI for vocabulary. For lesson questions, render `prompt`, let the learner reveal `answer` and `supporting_example`, then show `Não sabia` and `Sabia` actions that submit `correct: false/true`. Advance through the same session queue.

- [ ] **Step 5: Add review-side generation**

Load accessible lesson summaries with `api.getAllLessons()`, require `selectedLessonId`, accept optional context, call `generateLessonQuestions`, display a five-question success message, and reload review so the new due questions can appear. Labels use the selected lesson/child target language; do not hard-code English or French.

- [ ] **Step 6: Run complete language verification**

Run:

```bash
python scripts/test_ai_flashcard_service.py
python scripts/test_language_ai_questions.py
python scripts/test_api_routes.py
cd apps/web && pnpm lint && pnpm build
```

Expected: every command exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/review/page.tsx scripts/test_language_ai_questions.py
git commit -m "feat: review generated questions in any language"
```

### Task 6: Browser verification checkpoint

**Files:**
- No production file changes expected.

- [ ] **Step 1: Verify English lesson and review**

From an English lesson, generate five questions with a grammar context. Confirm the lesson shows them immediately and review shows the same front/back content alongside existing vocabulary cards.

- [ ] **Step 2: Verify French lesson and review**

Switch the child target language to French, open a French lesson, and generate five questions. Confirm generated text follows the lesson language and both entry points use the same records.

- [ ] **Step 3: Verify question variety and scheduling**

Confirm the batch includes at least three question types. Grade one question `Sabia` and one `Não sabia`; reload and confirm their scheduling/order changes without affecting vocabulary progress.

- [ ] **Step 4: Verify mobile and failure states**

At a narrow viewport, verify lesson selection, context, answer reveal, and grading. Force an invalid AI response and confirm no partial batch appears and the generation form remains open with an error.
