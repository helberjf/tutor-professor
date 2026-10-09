# Objective selection and form layout implementation plan

**Goal:** Apply the user's requested automatic subject selection, bulk actions, readable themes and simpler task fields, then verify with agent-browser.

**Architecture:** Keep selection rules in objective-study-helpers, reuse ObjectiveStudyScopePicker for creation and editing, and use the current theme tokens for styling. New manual tasks omit weight so the API uses its default.

**Tech stack:** Next.js, React, Tailwind, TypeScript, existing Node regression scripts, agent-browser.

## Selection

- [ ] Add helper regressions for selecting available targets, retaining existing selections for bulk search results, deduplication and the existing 30-target cap.
- [ ] Run `node scripts/test-objective-study-analysis.mjs` and confirm the new helper fails before implementation.
- [ ] Implement `selectStudyTargets(targets, selectedKeys = [])` and wire subject changes to replace selection from `filterStudyTargets(targets, '', subject)`. Search remains a filter. Add visible bulk selection and clear controls, with an explicit cap notice.
- [ ] Run helper and component render checks.

## Presentation

- [ ] Style the picker with `--surface-strong`, `--surface-muted`, `--surface-tint`, `--line-soft` and `--text-*`. Include selected states, readable hover, associated labels and accessible status updates.
- [ ] Give CreateObjectiveModal an opaque dialog sheet and a wider responsive surface. Place item input on its own row; remove weight state/control/badges from creation, ObjectiveCard and PlanDraftReview. Omit weight on new manual item payloads.
- [ ] Add English translations for the new labels.

## Browser and integration

- [ ] Start the existing isolated UI fixture and the local Next dev server. Use agent-browser snapshots and real controls to verify automatic subject selection, individual deselection, search/bulk selection, save and edit flows; inspect persisted fixture payloads.
- [ ] Capture and inspect light/dark desktop and mobile screenshots, including hovered topic rows and the task input. Check dialog and document widths.
- [ ] Run relevant Node regression scripts, `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check`.
- [ ] Obtain independent review, merge and push main, verify deployment and clean up task-owned browser/server processes.
