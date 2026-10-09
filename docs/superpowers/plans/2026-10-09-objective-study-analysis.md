# Objective Study Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Link objectives to a discipline and selected topics and assess the remaining work using the learner's recorded study.

**Architecture:** Store the resolved study scope and latest validated AI analysis as nullable JSON columns on Objective. Resolve selection keys against owned curriculum and study-log options; assemble scoped evidence in a dedicated backend service. Keep the AI estimate separate from checklist progress and use shared frontend scope and analysis components.

**Tech Stack:** FastAPI, SQLModel, Alembic, Python unittest scripts, Next.js, React, TypeScript, existing AI provider, Node assertion scripts and React component rendering checks.

## API contract

```typescript
type StudyTarget = {
  key: string; title: string; subject: string | null;
  topic_id: number | null; subject_id: number | null; available: boolean;
};
type StudyScope = {
  discipline_key: string; discipline: string; targets: StudyTarget[]; available: boolean;
};
type StudyScopeInput = { discipline_key: string; target_keys: string[] };
type StudyOptions = {
  disciplines: { key: string; name: string; targets: StudyTarget[] }[];
  ai_available: boolean; ai_unavailable_reason: string | null;
};
type StudyAnalysis = {
  progress_percent: number | null; remaining_percent: number | null;
  confidence: 'low' | 'medium' | 'high'; summary: string;
  studied: string[]; gaps: string[]; next_steps: string[];
  evidence_count: number; evidence_refs: string[];
  context_truncated: boolean; generated_at: string; stale: boolean;
};
```

GET `/api/objectives/study-options` returns StudyOptions. Create/PUT objective accept `study_scope: StudyScopeInput | null`; an omitted update leaves it unchanged and explicit null clears it. Objective responses add `study_scope: StudyScope | null` and `study_analysis: StudyAnalysis | null`. POST `/api/objectives/{id}/analyze` returns the updated Objective. Discipline keys use stable IDs for curriculum disciplines and normalized names for historical labels. Target keys resolve server-side: `topic:<id>` for curriculum topics, `subject:<id>` for owned subjects with logs and no curriculum topics, and `log-subject:<normalized-name>` for history-only subjects. The frontend treats keys as opaque. Legacy saved owned log-subject targets resolve through their stored subject ID, preserving links across renames and duplicate names.

## Task 1 — backend persistence, scope and analysis

Files: `apps/api/models/database.py`, `apps/api/schemas/schemas.py`, `apps/api/main.py`, `apps/api/services/objective_analysis_service.py`, `apps/api/alembic/versions/0040_objective_study_analysis.py`, `scripts/test_objective_study_analysis.py`.

- [x] Add API tests with two accounts, two disciplines and multiple topics; assert selected keys persist, foreign keys fail, and unselected/foreign study never enters the provider prompt. Run `.venv/Scripts/python.exe scripts/test_objective_study_analysis.py` and record the missing-feature failure.
- [x] Add nullable JSON `study_scope` and `study_analysis` columns with an idempotent migration following 0039. Extend create/update/read schemas using the contract above. Resolve keys from owned options rather than accepting caller-supplied labels.
- [x] Build options from the current profile's active curriculum modules and study-log subjects. Include topics with no study yet so the person can define a future goal.
- [x] Assemble bounded evidence from selected topic state, notes, content, log entries, question attempts and flashcard reviews. Distinguish available material from studied evidence; remove automatic log/topic duplication and exclude unrelated history. Validate a structured response and force null percentage/low confidence when no learning evidence exists.
- [x] Add the authenticated analysis endpoint using existing provider/access/credit helpers. Reserve metered credits atomically before the call and refund provider failures. Release the transaction before the call, reload the objective and reject changed input before saving in a short write transaction. Keep the previous valid analysis on error. Persist input signature and expose stale state when title, description or scope changes.
- [x] Resolve current curriculum labels by stable keys and mark deleted links unavailable. Update name-based scopes in the existing study-log rename endpoints.
- [x] Run the new tests and `.venv/Scripts/python.exe scripts/test_objectives_progress.py`, `.venv/Scripts/python.exe scripts/test_study_moves_objectives.py`, `.venv/Scripts/python.exe scripts/test_study_plan.py`. Check bootstrap against a legacy SQLite database.

## Task 2 — frontend selection and presentation

Files: `apps/web/src/lib/api.ts`, `apps/web/src/components/objectives/objective-study-helpers.ts`, `ObjectiveStudyScopePicker.tsx`, `ObjectiveStudyAnalysisPanel.tsx`, `CreateObjectiveModal.tsx`, `ObjectiveCard.tsx`, `apps/web/src/app/objectives/page.tsx`, locale dictionary and `apps/web/scripts/test-objective-study-analysis.mjs`.

- [x] Add behavioral helper tests for multiple selections, discipline changes, filtering, converting a saved scope to input and missing-link state. Run `node apps/web/scripts/test-objective-study-analysis.mjs` and record the missing-feature failure.
- [x] Add API types and methods from the contract. Keep added read properties optional for compatibility with existing objective fixtures and older servers.
- [x] Implement a shared accessible picker with discipline selector, optional subject filter, search and checkboxes for multiple targets. Show no-options/load/error states and preserve existing unavailable selections until explicitly edited.
- [x] Extend creation with the picker and the default-on analyze-after-create checkbox when AI and a valid scope are available. Save once before calling analyze; keep the saved objective visible on provider failure, with a retry on its card.
- [x] Add a focused analysis panel with scope editing, analysis/update action, loading and failure state, last date, confidence, missing evidence, percentages and scoped recommendations. Never update checklist progress from the AI response.
- [x] Update page instructions and English translations. Verify with `pnpm exec tsc --noEmit`, `node scripts/test-objectives-ui.mjs`, `node scripts/test-objective-plan-ui.mjs` and new helper tests from `apps/web`.

## Task 3 — integration and review

- [x] Review the complete implementation against every section of the approved spec, then request independent code quality review; resolve actionable findings.
- [ ] Run browser checks of creating with multiple topics, changing a discipline, editing an existing scope, analysis rendering, unavailable AI, failed initial analysis and mobile layout. Use mocked provider/API responses for deterministic UI checks, and exercise real backend HTTP behavior in the Python tests.
- [x] Run fresh targeted backend tests, frontend typecheck/lint and UI/helper tests. Inspect the final diff, migration chain and working-tree state before reporting completion.

## Delivery

The implementation was prepared on `codex/objective-study-analysis` in the shared checkout. After reviewing delivery, the user explicitly requested committing, integrating with the latest `main` and pushing to `origin/main`. Preserve the remote changes and verify the integrated result before pushing. Report implementation and verified behavior, with material verification limitations if any.

## Verification notes

Browser verification was attempted with the in-app browser, but both tab creation attempts failed with “Timed out waiting for Browser webview to attach”. No browser or mobile layout pass is claimed. Deterministic React rendering checks cover multiple selections, deleted links, stale analysis, unavailable AI and insufficient evidence; helper tests cover saving the objective before an analysis failure.

Backend validation uses SQLite and a deterministic provider. The HTTP suite exercises real endpoint behavior, scoped evidence, access controls, credit callbacks and edits during generation. No live provider or PostgreSQL connection was used.

Final checks passed: objective study HTTP and pure suite; migrations 0039/0040 and bootstrap; objectives, automatic study progress, study plans, study log and AI-credit regressions; frontend helper/render/plan UI checks, TypeScript and targeted ESLint. Independent specification and code-quality reviews approved the final fixes. The concurrency regressions cover atomic metered admission, refunds and the final SQLite check/write window.
