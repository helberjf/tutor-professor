# AI Lesson Context Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional AI context, draft preview before saving, and a saved lesson visualization mode for Diverse study lessons.

**Architecture:** Extend the existing Diverse flashcard generation API with a compatible optional `context` field. Keep generated lesson drafts in frontend state until the user saves or discards them, then reuse the existing `DiverseLessonBlock` model for persisted local lessons.

**Tech Stack:** FastAPI, Pydantic, Next.js App Router, React state, TypeScript, Tailwind CSS.

---

### Task 1: Backend Context Support

**Files:**
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Test: `scripts/test_api_routes.py`

- [ ] **Step 1: Write the failing test**

Add a test that monkeypatches `phrase_generation_service.generate_json_text`, calls `/api/study/diverse/generate-flashcards` with `context`, and asserts the prompt contains that context.

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/test_api_routes.py`
Expected: FAIL because `GenerateFlashcardsRequestSchema` ignores `context` and the generated prompt does not include it.

- [ ] **Step 3: Add request field**

Add `context: Optional[str] = Field(default=None, max_length=1000)` to `GenerateFlashcardsRequestSchema`.

- [ ] **Step 4: Add prompt instruction**

In `generate_diverse_flashcards`, sanitize `payload.context`, build a `context_instruction`, and insert it in both prompt variants before the rules.

- [ ] **Step 5: Run test to verify it passes**

Run: `python scripts/test_api_routes.py`
Expected: PASS.

### Task 2: Frontend Draft Generation

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/study/page.tsx`

- [ ] **Step 1: Add API type**

Add `context?: string` to `GenerateFlashcardsPayload`.

- [ ] **Step 2: Add draft state**

In `StudyPage`, add a pending draft state containing `subjectIndex` and `DiverseLessonBlock`.

- [ ] **Step 3: Change lesson AI handler**

Change `generateDiverseLesson` to accept `context?: string`, call `api.generateStudyFlashcards` with the context, and store the generated lesson draft instead of immediately appending it.

- [ ] **Step 4: Add save/discard handlers**

Add `savePendingLessonDraft` and `discardPendingLessonDraft`. Saving appends the draft to the matching subject and clears draft state. Discarding only clears draft state.

### Task 3: Frontend Preview and View Mode

**Files:**
- Modify: `apps/web/src/app/study/page.tsx`

- [ ] **Step 1: Pass draft props**

Pass pending draft, save, and discard callbacks from `DiverseTab` to `DiverseSubjectDashboard`.

- [ ] **Step 2: Add context UI**

In `DiverseSubjectDashboard`, add a textarea for lesson context near the AI lesson button. The button label becomes `Criar preview da licao`.

- [ ] **Step 3: Add preview panel**

Show the pending draft when it belongs to the selected subject. Include title, generated topics, answers, `Salvar licao`, and `Descartar`.

- [ ] **Step 4: Add `Visualizar` tab**

Extend `SubjectStudyCard` tabs from `Lista | Revisar` to `Lista | Revisar | Visualizar`. The view tab renders a clean reading layout with lesson title, progress, questions, answers, and completion state.

### Task 4: Verify, Commit, Push

**Files:**
- All modified files in this plan

- [ ] **Step 1: Run backend verification**

Run: `python scripts/test_api_routes.py`
Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run: `npm run build` from `apps/web`
Expected: PASS.

- [ ] **Step 3: Inspect diff**

Run: `git diff -- apps/api/schemas/schemas.py apps/api/main.py apps/web/src/lib/api.ts apps/web/src/app/study/page.tsx scripts/test_api_routes.py docs/superpowers/specs/2026-06-21-ai-lesson-context-preview-design.md docs/superpowers/plans/2026-06-21-ai-lesson-context-preview.md`
Expected: Only changes for AI context, lesson preview, visualization mode, and docs.

- [ ] **Step 4: Commit intended changes**

Stage only the files in this plan and commit with: `feat: add ai lesson preview flow`.

- [ ] **Step 5: Push branch**

Run: `git push -u origin codex/ai-lesson-context-preview`.

## Self Review

The plan covers backend request handling, frontend API typing, draft lifecycle, preview UI, saved visualization UI, verification, commit, and push. It avoids changing unrelated study modes or the English lesson sidebar generator.
