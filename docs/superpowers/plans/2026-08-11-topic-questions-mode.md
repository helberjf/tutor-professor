# Topic Questions Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated programming-topic multiple-choice question mode with AI generation, more-question requests, and backend-enforced non-repetition.

**Architecture:** Persist topic questions in a new `ProgrammingQuestion` table with a normalized per-topic key. Reuse saved `ai_content.quiz` for the initial topic-created batch, add a focused AI generator for more questions, and surface practice in `TopicView` plus a new top-level `Modo questões` selector.

**Tech Stack:** FastAPI, SQLModel, Pydantic, Next.js, React, TypeScript, Tailwind, source-level Python tests.

---

## File Map

- Modify `apps/api/models/database.py`: add `ProgrammingQuestion`.
- Modify `apps/api/database_bootstrap.py`: include shape limits and auto-migration support for the new table.
- Modify `apps/api/schemas/schemas.py`: add generated and persisted programming question schemas.
- Modify `apps/api/services/coding_service.py`: add question key normalization, validation, prompt building, and AI generation.
- Modify `apps/api/main.py`: import model/schemas/helpers, persist initial questions, expose list and generate-more routes, delete questions with topic/subject cleanup.
- Modify `apps/web/src/lib/api.ts`: add question interfaces and API methods.
- Modify `apps/web/src/app/study/_lib/study-helpers.ts`: extend `CodingMode`.
- Modify `apps/web/src/app/study/_components/CodingTab.tsx`: add `Modo questões`.
- Modify `apps/web/src/components/coding/CodingCurriculum.tsx`: preserve subject/topic context for questions mode.
- Modify `apps/web/src/components/coding/TopicView.tsx`: load questions, show header action, practice modal, and generate-more form.
- Create `scripts/test_topic_questions_mode.py`: focused backend/source contract tests.

### Task 1: RED Contract Tests

- [ ] **Step 1: Create focused failing test**

Create `scripts/test_topic_questions_mode.py` with source-level assertions for the new model, schemas, service helpers, routes, API client methods, and UI strings. Include functional assertions for validator behavior:

```python
from services.coding_service import programming_question_key, validate_programming_question_batch

assert programming_question_key("O que é IAM?") == programming_question_key("o que e iam")
questions = [{
    "question": "Quando usar IAM roles?",
    "options": ["Para credenciais temporarias", "Para CSS", "Para DNS publico", "Para cache local"],
    "correct_option": "Para credenciais temporarias",
    "explanation": "Roles reduzem o uso de credenciais long-lived.",
}]
assert validate_programming_question_batch(questions, expected_count=1, existing_questions=[])[0].question == "Quando usar IAM roles?"
try:
    validate_programming_question_batch(questions, expected_count=1, existing_questions=["Quando usar IAM roles?"])
except ValueError:
    pass
else:
    raise AssertionError("duplicate topic questions must be rejected")
```

- [ ] **Step 2: Run RED**

Run: `python scripts/test_topic_questions_mode.py`

Expected: FAIL because the model, schemas, helpers, routes, API client methods, and UI controls do not exist.

### Task 2: Backend Model, Schemas, and Validation

- [ ] **Step 1: Implement storage and schemas**

Add `ProgrammingQuestion` with fields `topic_id`, `subject_id`, `child_id`, `question`, `question_key`, `options`, `correct_option`, `explanation`, `created_at`, and unique constraint `("topic_id", "question_key")`. Add Pydantic schemas `GeneratedProgrammingQuestionSchema`, `ProgrammingQuestionSchema`, and `GenerateProgrammingQuestionsSchema`.

- [ ] **Step 2: Implement validator**

Add `programming_question_key`, `ValidatedProgrammingQuestion`, and `validate_programming_question_batch` in `coding_service.py`. The validator must require exact count, four unique options, `correct_option in options`, nonblank explanation, and no normalized duplicates.

- [ ] **Step 3: Run GREEN for validator contracts**

Run: `python scripts/test_topic_questions_mode.py`

Expected: remaining route/UI assertions may still fail, but model/schema/validator assertions pass.

### Task 3: Backend Routes and Persistence

- [ ] **Step 1: Persist initial AI quiz questions**

When creating a topic with AI in `create_coding_topic` and `generate_coding_subject_topic`, convert the validated `content.quiz` items into `ProgrammingQuestion` records in the same transaction.

- [ ] **Step 2: Add list and generate routes**

Add:

```text
GET /api/coding/topics/{topic_id}/questions
POST /api/coding/topics/{topic_id}/questions/generate
```

The generate route must pass existing question prompts into the AI prompt, validate again inside a topic lock, and persist exactly five new unique questions.

- [ ] **Step 3: Delete dependent questions**

Delete `ProgrammingQuestion` rows when deleting a topic or deleting a subject.

- [ ] **Step 4: Run route/source tests**

Run: `python scripts/test_topic_questions_mode.py`

Expected: backend route and persistence contract assertions pass.

### Task 4: Frontend API and Mode Selector

- [ ] **Step 1: Add TypeScript API contracts**

Add `ProgrammingQuestion`, `GenerateProgrammingQuestionsPayload`, `getTopicQuestions`, and `generateCodingTopicQuestions` to `apps/web/src/lib/api.ts`.

- [ ] **Step 2: Add mode selector**

Change `CodingMode` to include `questions`, add a third button in `CodingTab`, and update `CodingCurriculum` to keep subject/topic context when switching modes.

- [ ] **Step 3: Run source test**

Run: `python scripts/test_topic_questions_mode.py`

Expected: API and mode-selector assertions pass.

### Task 5: Topic Practice UI

- [ ] **Step 1: Add TopicView question state and actions**

Load questions with the topic, show `Fazer questões` in the header, show `Gerar mais questões`, and handle busy/error/success states similarly to additional flashcards.

- [ ] **Step 2: Add multiple-choice modal**

Add a full-screen modal that shows one question at a time, shuffles options deterministically, records selected answers, shows the explanation, advances through the list, and summarizes score at completion.

- [ ] **Step 3: Run focused source test**

Run: `python scripts/test_topic_questions_mode.py`

Expected: UI assertions pass.

### Task 6: Verification

- [ ] **Step 1: Run focused tests**

Run:

```powershell
python scripts/test_topic_questions_mode.py
python scripts/test_topic_context_reading_ai.py
python scripts/test_programming_ai_flashcards.py
python scripts/test_coding_ai_topic_ui.py
python scripts/test_reading_study_modal.py
```

Expected: all exit 0.

- [ ] **Step 2: Run web checks**

Run:

```powershell
cd apps/web
pnpm lint
pnpm build
```

Expected: both exit 0.

- [ ] **Step 3: Manual browser pass**

Start the app if needed and verify `Modo questões`, `Fazer questões`, answering multiple choice, and `Gerar mais questões` on the topic from the screenshot.
