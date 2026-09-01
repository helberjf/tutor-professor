# Exam Simulado Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the simulado from the questions mode so it becomes a real certification rehearsal — a timed sitting against a published blueprint, scored per attempt and broken down by domain — instead of the questions mode pointed at more rows.

**Architecture:** Introduce an `Exam` blueprint with its own `ExamQuestion` pool, plus `ExamAttempt` / `ExamAttemptAnswer` for scoring history. Move the curated DVA-C02 bank out of `ProgrammingQuestion` into the new pool. The questions mode keeps its per-question spaced-practice counters and stops offering a subject-wide exam.

**Tech Stack:** FastAPI, SQLModel, Pydantic, Alembic, Next.js, React, TypeScript, Tailwind, source-level Python tests plus Node assertion scripts.

---

## Why a new table (and not just a flag)

The ask was "tem que ser uma tabela diferente pq senão fica tudo igual ao modo questões". That is right, but a copy of `ProgrammingQuestion` under another name would still behave identically. The two features want different **shapes**:

| | Modo questões | Modo simulado |
| --- | --- | --- |
| Unit of study | question belongs to a topic | question belongs to a certification |
| Purpose | learn one theme | measure readiness under exam conditions |
| Scoring | counters that accumulate forever | one score per sitting, kept as history |
| Composition | whatever exists for that topic | a blueprint: N questions, domain weights |
| Answer format | 4 options, exactly 1 correct | 4–6 options, **1 or more** correct |
| Feedback | explanation right after each answer | score at the end, pass/fail, per domain |
| Timing | untimed | timed |

The row that actually forces new tables is **scoring**. `ProgrammingQuestion.attempt_count` accumulates across every session, so the data cannot answer "what did I score on my third simulado?" or "am I improving in Security?". An exam needs an attempt record; a study question needs a lifetime counter. One table cannot be both without one of the two lying.

The second forcing constraint is **multi-response**. The real DVA-C02 asks "choose TWO", and `correct_option: str` cannot express it. The curated bank shipped single-response only because of this limit.

## Current state

- `ProgrammingQuestion` — per topic, 4 options, 1 correct, lifetime counters. Feeds the questions mode.
- `StudyQuestion` — same shape for diverse subjects and English.
- Subject 19 (`Simulado DVA-C02 …`) holds 98 questions: 63 curated ones under three seeded `DVA-C02 - Simulado N` topics, 30 usable topic questions, 5 unusable (placeholder `A`/`B`/`C`/`D` options).
- Subject 18 (`Simulado SAA-C03 …`) exists too, so exams are a recurring pattern rather than a one-off.
- `GET /api/coding/subjects/{id}/questions` pools everything for the subject-wide simulado. This route is what conflates the two modes and is removed by this plan.

---

## File Map

- Modify `apps/api/models/database.py`: add `Exam`, `ExamQuestion`, `ExamAttempt`, `ExamAttemptAnswer`.
- Create `apps/api/alembic/versions/0010_exam_simulado.py`: create the four tables.
- Modify `apps/api/schemas/schemas.py`: exam, question, attempt-start, attempt-answer and result schemas.
- Create `apps/api/services/exam_service.py`: blueprint sampling, grading, scaled score, domain breakdown, exam-question validation, AI prompt.
- Modify `apps/api/main.py`: exam CRUD-lite, attempt lifecycle routes; delete `list_subject_questions`.
- Modify `apps/web/src/lib/api.ts`: exam types and client methods; drop `getSubjectQuestions`.
- Modify `apps/web/src/app/study/_lib/study-helpers.ts`: add `'exam'` to `CodingMode`.
- Modify `apps/web/src/app/study/_components/CodingTab.tsx`: add the `Modo simulado` selector card.
- Create `apps/web/src/components/exam/ExamList.tsx`: exams with pool size, blueprint and best score.
- Create `apps/web/src/components/exam/ExamRunner.tsx`: timed sitting, multi-response support, no per-question feedback.
- Create `apps/web/src/components/exam/ExamResult.tsx`: score, pass/fail, per-domain bars, review of missed questions.
- Modify `apps/web/src/components/coding/CodingCurriculum.tsx`: remove the "Simulado da matéria" card and its modal wiring.
- Modify `scripts/dva_c02_question_bank.py`: add `response_type` and keep `domain` as the blueprint key.
- Create `scripts/migrate_dva_c02_to_exam.py`: move the seeded bank into the exam tables and drop the three seeded topics.
- Create `scripts/test_exam_simulado_mode.py`: contract and behavioural tests.
- Create `apps/web/scripts/test-exam-runner-state.mjs`: pure helper tests for grading and blueprint sampling on the client.

---

## Data model

```python
class Exam(SQLModel, table=True):
    id
    child_id: int            # per child, like ProgrammingSubject
    subject_id: int | None
    code: str          # "DVA-C02"
    name: str
    question_count: int      # how many are drawn per sitting
    duration_minutes: int    # question_count * 2, the AWS associate pace
    passing_percent: int = 72
    domains: list = JSON     # [{"name": "Security", "weight": 0.26}, ...]

class ExamQuestion(SQLModel, table=True):
    id, exam_id
    domain: str              # must match one of Exam.domains
    question: str
    question_key: str
    options: list = JSON             # 4 to 6
    correct_options: list = JSON     # 1 or more, all present in options
    response_type: str               # single | multiple
    explanation: str
    reference_url: str | None        # link to official docs
    difficulty: str = "medium"
    UniqueConstraint(exam_id, question_key)

class ExamAttempt(SQLModel, table=True):
    id, exam_id
    child_id: int
    status: str              # in_progress | finished | expired
    started_at, finished_at, duration_seconds
    question_count, correct_count
    score_percent: int | None
    passed: bool | None
    domain_breakdown: dict = JSON    # {"Security": {"total": 17, "correct": 12}}

class ExamAttemptAnswer(SQLModel, table=True):
    id, attempt_id, exam_question_id
    selected_options: list = JSON
    correct: bool
    answered_at
```

**Grading.** An answer counts only when the selected set equals the correct set exactly — no partial credit, matching AWS. The result is a plain percentage, `passed` when it reaches `passing_percent` (72, the AWS associate cut). No invented 100–1000 scale: AWS does not publish its scaling, so a number in that range would look authoritative while being made up.

**Blueprint sampling.** Starting an attempt draws `question_count` questions weighted by `Exam.domains`, sampling per domain and falling back to whatever the pool has when a domain is short. When the pool equals `question_count` the draw is just a shuffle. The attempt records what was actually drawn, so a thin pool degrades visibly instead of silently.

**Ownership.** Everything is per child, like `ProgrammingSubject`. `ExamQuestion` inherits its owner from the exam, and `ExamAttempt.child_id` is stored directly so a child's history can be queried without joining through the exam.

---

### Task 1: RED contract and behaviour tests

- [ ] **Step 1: Create `scripts/test_exam_simulado_mode.py`**

Cover the parts that carry the risk, not the plumbing:

```python
# grading is all-or-nothing, and order must not matter
assert grade_answer(["A", "C"], ["C", "A"]) is True
assert grade_answer(["A"], ["A", "C"]) is False      # partial selection fails
assert grade_answer(["A", "B", "C"], ["A", "C"]) is False

# the blueprint drives composition
drawn = sample_by_blueprint(pool, domains=[{"name": "Security", "weight": 0.26}, ...], count=65)
assert len(drawn) == 65
assert abs(share(drawn, "Security") - 0.26) <= 0.05
assert len({q.id for q in drawn}) == 65               # never the same question twice

# a thin pool degrades visibly
short = sample_by_blueprint(small_pool, domains=..., count=65)
assert len(short) == len(small_pool)

# percentage and the 72% cut
assert score_percent(correct=52, total=65) == 80
assert passed(score_percent(correct=47, total=65), passing_percent=72) is True   # 72%
assert passed(score_percent(correct=46, total=65), passing_percent=72) is False  # 71%
assert score_percent(correct=0, total=0) == 0         # an empty sitting must not divide by zero
```

- [ ] **Step 2: Run and confirm red**

### Task 2: Schema and migration

- [ ] **Step 1: Add the four models to `apps/api/models/database.py`**
- [ ] **Step 2: Create `0010_exam_simulado.py`**, guarded with `inspector.has_table` like `0009`.
- [ ] **Step 3: Verify with `python scripts/test_database_bootstrap.py`** — it derives the head revision, so it picks up `0010` on its own.

### Task 3: Exam service

- [ ] **Step 1: `grade_answer`, `sample_by_blueprint`, `scaled_score`, `domain_breakdown`** as pure functions.
- [ ] **Step 2: `validate_exam_question_batch`** — 4–6 options, every `correct_options` entry present in `options`, `response_type` consistent with how many are correct, no label-only options, unique `question_key`.
- [ ] **Step 3: Exam-question AI prompt** — distinct from the topic prompt: scenario-based, targeted at one blueprint domain, plausible distractors drawn from adjacent services, allowed to ask for two correct answers.

### Task 4: API routes

- [ ] **Step 1:** `GET /api/exams`, `POST /api/exams`, `GET /api/exams/{id}` (blueprint plus pool size per domain).
- [ ] **Step 2:** `POST /api/exams/{id}/attempts` — draws by blueprint, creates the attempt, returns questions **without** `correct_options`. Sending the answer key to the client during a sitting would defeat the exam.
- [ ] **Step 3:** `POST /api/exams/attempts/{id}/answers` — records one answer, returns no correctness.
- [ ] **Step 4:** `POST /api/exams/attempts/{id}/finish` — grades server-side, stores score and breakdown, returns the full result with explanations.
- [ ] **Step 5:** `GET /api/exams/{id}/attempts` — history for the progress chart.
- [ ] **Step 6:** Keep `list_subject_questions` for now. Deleting it in phase 1 would leave the app with no simulado at all until the exam screens land, so it is marked superseded in a docstring and removed in phase 2 alongside the UI that replaces it.

### Task 5: Move the seeded topics into the simulado mode

The three `DVA-C02 - Simulado N` topics are not deleted: each one **becomes an exam**. They were already simulados wearing a topic's clothes, so the migration is a change of home, not a loss.

- [ ] **Step 1:** Add `response_type` to `scripts/dva_c02_question_bank.py` (all `single` for now); `domain` is already there and becomes the blueprint key at no cost.
- [ ] **Step 2:** Create `scripts/migrate_dva_c02_to_exam.py`. For each of the three topics, create:

  ```
  Exam(code="DVA-C02", name="DVA-C02 - Simulado N",
       question_count=21, duration_minutes=42,   # 21 * 2 min, the AWS pace
       passing_percent=72, domains=<official weights>,
       subject_id=19, child_id=<Henrique>)
  ```

  then copy that topic's 21 `ProgrammingQuestion` rows into `ExamQuestion` carrying their `domain` from the bank, and finally delete the now-empty topic and its questions.
- [ ] **Step 3:** ~~A combined "Prova completa" exam over the union of the three pools.~~ Dropped: a question belongs to exactly one exam, so a fourth exam would mean a second copy of all 63 rows. If a 63-question sitting is wanted later, the cheap version is an exam flag that draws from every exam sharing the same `code`.
- [ ] **Step 4:** Idempotent, `--dry-run` first, same as `seed_dva_c02_questions.py`. Match topics by title, never by the ids seen today.
- [ ] **Step 5:** Leave the other 30 topic questions in subject 19 alone — those are study questions and belong to the questions mode. Delete the 5 unusable ones in topic 205 (placeholder `A`/`B`/`C`/`D` options) in this pass.
- [ ] **Step 6:** Point `scripts/seed_dva_c02_questions.py` at the exam tables so re-seeding does not recreate the old topics.

### Task 6: Frontend

- [ ] **Step 1:** `CodingMode` gains `'exam'`; `CodingTab` gains a fourth selector card.
- [ ] **Step 2:** `ExamList` — per exam: pool size against `question_count`, a warning when the pool is thinner than the blueprint, best score, last three attempts.
- [ ] **Step 3:** `ExamRunner` — reuses the countdown from `PracticeQuestionsModal` (extract `formatClock` and the deadline effect into `apps/web/src/components/questions/use-countdown.ts`), checkboxes for multi-response, a question navigator with "marcar para revisar", and **no feedback until the sitting ends**.
- [ ] **Step 4:** `ExamResult` — percentage against the 72% cut with a clear aprovado/reprovado, per-domain bars, and the missed questions with their explanations.
- [ ] **Step 5:** Remove the "Simulado da matéria" card from `CodingCurriculum`.

### Task 7: Verify

- [ ] **Step 1:** `python scripts/test_exam_simulado_mode.py`
- [ ] **Step 2:** Full suites — `scripts/test_*.py` and `apps/web/scripts/*.mjs`
- [ ] **Step 3:** `pnpm lint`, `pnpm typecheck`, `pnpm build`
- [ ] **Step 4:** Run the migration with `--dry-run` against the live database, then for real, then sit one full simulado end to end. This happens with phase 2, not phase 1: moving the questions out before the exam screens exist would shrink the existing simulado from 93 questions to 30 with no replacement.

---

## Phasing

The plan is large enough that it should land in four pushes, each useful on its own:

1. **Tasks 1–5** — schema, service, routes, and the three seeded topics moved over as exams. Delivers a real scored simulado using questions that already exist.
2. **Tasks 6–7** — the dedicated mode, its screens, and full verification.
3. **Follow-up** — AI generation of exam questions, including multi-response, and a readiness chart across attempts.

## Not doing: sharing English content

An earlier draft of this plan proposed making English questions shared across children, since English lessons already are (`Lesson.child_id` nullable plus `level`). That was dropped: English stays per child, exactly as it works today.

It is worth recording what that leaves on the table, because the cost is real but small. Two children studying the same shared lesson build two separate question sets, so the same lesson is sent to the AI twice and neither child sees the other's questions. In exchange, nothing already in production has to be migrated, and the counters stay on the question row where the rest of the schema keeps them. If that duplication ever becomes annoying, the change is the one described above: split `attempt_count` and friends into a per-child attempt row first, then relax the identity constraint.

The same reasoning applies to exams: `Exam.child_id` is required, like `ProgrammingSubject.child_id`, rather than nullable-for-shared.

---

## Decided

- **Score is a plain percentage** with aprovado/reprovado at 72%. No invented 100–1000 scale.
- **The three seeded topics move into the simulado mode** as exams rather than being deleted.
- **Everything stays per child**, English included. No shared content, no migration of live data.

## Still open

- **The 5 broken questions** in topic 205 (placeholder `A`/`B`/`C`/`D` options) are invisible in every mode. Task 5 deletes them; say so if you would rather have them regenerated.
