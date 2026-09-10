# Manual AI Study Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a copy-prompt-and-paste workflow that imports one complete Diverse subject with lesson blocks and answered questions.

**Architecture:** Keep parsing and validation in a pure frontend module that returns the existing `DiverseSubject` shape, and enforce the same study limits at the API boundary. Render the workflow in the Diverse overview and persist one complete subject through a dedicated idempotent, atomic append endpoint, avoiding replacement from stale client snapshots.

**Tech Stack:** TypeScript, React 19, Next.js 15, Node assertion tests, Playwright browser automation.

---

### Task 1: Define and test the import contract

**Files:**
- Create: `apps/web/src/lib/manual-study-import.ts`
- Create: `apps/web/scripts/test-manual-study-import.mjs`

- [ ] Write assertions for the generated prompt, Portuguese and English JSON keys, Markdown fences, lesson references, duplicate questions and limits.
- [ ] Run `node apps/web/scripts/test-manual-study-import.mjs` and confirm it fails because the module does not exist.
- [ ] Implement `buildManualStudyPrompt` and `parseManualStudyImport`, with injected ID creation for deterministic tests.
- [ ] Run `node apps/web/scripts/test-manual-study-import.mjs` and confirm all assertions pass.

### Task 2: Add the import workflow

**Files:**
- Modify: `apps/web/src/app/study/_components/DiverseTab.tsx`
- Modify: `apps/web/src/app/study/page.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/api/main.py`
- Modify: `scripts/test_diverse_subject_tabs.py`
- Create: `scripts/test_diverse_manual_import_api.py`

- [ ] Add failing source assertions for the visible import controls, preview and single persistence callback.
- [ ] Run `python scripts/test_diverse_subject_tabs.py` and confirm the new assertions fail.
- [ ] Add the overview panel with topic/count fields, copy prompt button, pasted-response textarea, validation preview and confirmation.
- [ ] Add an authenticated append endpoint with duplicate protection and compare-and-swap persistence, then call it from `importDiverseStudy` and install its response only when the selected date still matches.
- [ ] Re-run the unit and source checks until both pass.

### Task 3: Verify in the browser and ship

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] Run `pnpm exec tsc --noEmit` in `apps/web`.
- [ ] Start the application and use Playwright to exercise the import panel, validation preview, saved confirmation and persisted subject card.
- [ ] Run the relevant Diverse test scripts and the production web build.
- [ ] Review `git diff`, commit the feature on `main`, pull with rebase if required, and push `main` to `origin`.
