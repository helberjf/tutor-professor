# Objective selection and form layout implementation plan

**Goal:** Apply the user's requested automatic subject selection, bulk actions, readable themes and simpler task fields, then verify with agent-browser.

**Architecture:** Keep selection rules in objective-study-helpers, reuse ObjectiveStudyScopePicker for creation and editing, and use the current theme tokens for styling. New manual tasks omit weight so the API uses its default.

**Tech stack:** Next.js, React, Tailwind, TypeScript, existing Node regression scripts, agent-browser.

## Selection

- [x] Add helper regressions for selecting available targets, retaining existing selections for bulk search results, deduplication and the existing 30-target cap.
- [x] Run `node scripts/test-objective-study-analysis.mjs` and confirm the new helper fails before implementation.
- [x] Implement `selectStudyTargets(targets, selectedKeys = [])` and wire subject changes to replace selection from `filterStudyTargets(targets, '', subject)`. Search remains a filter. Add visible bulk selection and clear controls, with an explicit cap notice.
- [x] Run helper and component render checks.

## Presentation

- [x] Style the picker with `--surface-strong`, `--surface-muted`, `--surface-tint`, `--line-soft` and `--text-*`. Include selected states, readable hover, associated labels and accessible status updates.
- [x] Give CreateObjectiveModal an opaque dialog sheet and a wider responsive surface. Place item input on its own row; remove weight state/control/badges from creation, ObjectiveCard and PlanDraftReview. Omit weight on new manual item payloads.
- [x] Add English translations for the new labels.

## Browser and integration

- [x] Start the existing isolated UI fixture and the local Next dev server. Use agent-browser snapshots and real controls to verify automatic subject selection, individual deselection, search/bulk selection, save and edit flows; inspect persisted fixture payloads.
- [x] Capture and inspect light/dark desktop and mobile screenshots, including hovered topic rows and the task input. Check dialog and document widths.
- [x] Run relevant Node regression scripts, `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check`.
- [x] Obtain independent review, merge and push main, verify deployment and clean up task-owned browser/server processes.

## Complete AI history coverage (user follow-up)

- [x] Extend regression coverage to records beyond the old 80-record sample and text beyond the old 2,000-character clipping point. Preserve tenant and selected-topic isolation.
- [x] Collect complete relevant records. Keep each AI request bounded by batching long histories and consolidating batch summaries; never present a partially reviewed history as complete.
- [x] Keep provider calls outside database transactions, reserve one operation credit and preserve the concurrency checks and previous snapshot on failure. Validate batch output and propagate errors safely.
- [x] Strengthen the final prompt to return percentage, improvement gaps and concrete ordered actions with completion criteria using the existing analysis response fields.
- [x] Present `next_steps` as an ordered plan in the analysis panel with consistent semantic theme colors. Verify this result and retry behavior with agent-browser.
- [x] Run backend objective-analysis, credit, plan and progress regressions; review the backend changes independently and explicitly deploy the API after merging main.

## Validation recorded before publication

- New bulk-selection helper and weight-UI checks failed before implementation and passed after it. The complete-history test caught the previous record/text cutoffs; an additional regression failed before repeated fragment provenance was added and passed after the fix.
- Backend checks passed: full history, existing objective diagnosis, AI credits, billing/usage, tenant isolation, deletion foreign keys, objective progress, study plans and study-driven checklist completion. Python compilation and diff whitespace checks passed.
- Web checks passed: helper/render, objective-plan UI, objective UI, TypeScript, ESLint, production Next build and dark-mode coverage.
- agent-browser 0.26.0 used an isolated local fixture to verify automatic subject selection, search/bulk actions, individual deselection, the explicit 30-target notice, a single objective save despite initial analysis failure, retry, percentage/gaps/ordered plan, scope edits with stale analysis and task creation without custom weight. Desktop 1280px and mobile 390px/360px screenshots were inspected in dark/light themes; task input widths were 275px/245px with no horizontal overflow.
- Visual QA used synthetic responses. Provider behavior was verified with controlled fixtures; no paid live-provider request was made during this validation.
- The task-owned agent-browser session, fixture server and Next dev server were closed. Publication was verified on main: feature commit a5bbcbf, successful frontend Vercel commit statuses and deployed bundles containing the new selection/plan labels. API deployment dpl_FgnBwYPt3ZTZ9GjscHE15S1VpUdz is Ready and aliased to tutor-professor-api.vercel.app; production health returned 200 and study-options correctly returned 401 without authentication. OpenAPI retains objective analysis and plan deletion routes, and the frontend runtime points to that API.