# Question Dashboard Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-subject dashboard metrics for resolved Programming topic questions, counting acertos and erros.

**Architecture:** Store aggregate counters directly on `ProgrammingQuestion`, expose a question-attempt endpoint, aggregate counters in the existing study dashboard response, and render the metrics in `DashboardOverview`.

**Tech Stack:** FastAPI, SQLModel, Alembic, Pydantic, Next.js/React, TypeScript, pnpm, Python smoke tests.

---

### Task 1: Regression test

**Files:**
- Create: `scripts/test_question_dashboard_metrics.py`

- [ ] **Step 1: Write the failing integration test**

Create a script that boots a temporary SQLite DB, registers a parent/child, creates two programming questions for one subject, submits one wrong and one correct answer through `POST /api/coding/questions/{question_id}/attempt`, and asserts `/api/study/dashboard` returns one subject metric with `resolved_count=2`, `correct_count=1`, `error_count=1`, and `accuracy_percent=50`.

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_question_dashboard_metrics.py`

Expected: FAIL because the attempt endpoint and dashboard metric fields do not exist yet.

### Task 2: Backend persistence and schemas

**Files:**
- Modify: `apps/api/models/database.py`
- Modify: `apps/api/schemas/schemas.py`
- Create: `apps/api/alembic/versions/0008_programming_question_metrics.py`
- Modify: `apps/api/database_bootstrap.py`
- Modify: `apps/api/main.py`

- [ ] **Step 1: Add model fields**

Add `attempt_count`, `correct_count`, `error_count`, `last_selected_option`, and `last_answered_at` to `ProgrammingQuestion`.

- [ ] **Step 2: Add schemas**

Add schemas for question attempt payload/result and dashboard subject metrics. Extend `ProgrammingQuestionSchema` and `StudyDashboardSchema`.

- [ ] **Step 3: Add migration/compatibility**

Create Alembic revision `0008` that creates `programmingquestion` when missing or adds the metric columns when present. Update `HEAD_REVISION` and startup compatibility column additions.

- [ ] **Step 4: Add route and dashboard aggregation**

Implement `POST /api/coding/questions/{question_id}/attempt` and aggregate per-subject metrics in `get_study_dashboard`.

- [ ] **Step 5: Run backend test GREEN**

Run: `python scripts/test_question_dashboard_metrics.py`

Expected: PASS.

### Task 3: Frontend dashboard and practice recording

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/coding/TopicView.tsx`
- Modify: `apps/web/src/components/dashboard-overview.tsx`
- Modify: `scripts/test_topic_questions_mode.py`

- [ ] **Step 1: Add frontend API contracts**

Expose `QuestionSubjectMetrics`, `ProgrammingQuestionAttemptResult`, `submitCodingTopicQuestionAttempt`, and the new `StudyDashboard.question_metrics` field.

- [ ] **Step 2: Record attempts in practice**

Call the attempt API when an option is selected, update local question counters from the response, and show a non-blocking warning if the metric submission fails.

- [ ] **Step 3: Render dashboard metrics**

Add the `Questões por matéria` section to `DashboardOverview`.

- [ ] **Step 4: Update source-contract tests**

Extend `scripts/test_topic_questions_mode.py` to assert the new endpoint, API client method, and dashboard UI strings exist.

### Task 4: Verification

**Files:**
- All touched files

- [ ] **Step 1: Run focused backend tests**

Run:

```powershell
python scripts/test_question_dashboard_metrics.py
python scripts/test_topic_questions_mode.py
python scripts/test_api_routes.py
```

Expected: all exit 0.

- [ ] **Step 2: Run frontend verification**

Run:

```powershell
pnpm lint
pnpm build
```

from `apps/web`.

Expected: both exit 0.
