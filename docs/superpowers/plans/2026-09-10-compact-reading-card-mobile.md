# Compact Mobile Reading Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halve the mobile reading header footprint and keep smaller Previous/Next controls fully visible above the iPhone safe area.

**Architecture:** Keep `TopicView` behavior unchanged and adjust only responsive Tailwind classes in the full-screen reading modal. A focused static regression script will guard the mobile stacking layer, compact header/control row, scroll containment, compact footer, and safe-area padding.

**Tech Stack:** React 19, Next.js 15, TypeScript, Tailwind CSS, Node.js static regression scripts

---

## File structure

- Create `apps/web/scripts/test-topic-reading-mobile-layout.mjs` for focused static layout regressions.
- Modify `apps/web/src/components/coding/TopicView.tsx` for the responsive modal, header, reading area, and footer classes.

### Task 1: Add the failing mobile layout regression

**Files:**
- Create: `apps/web/scripts/test-topic-reading-mobile-layout.mjs`
- Test: `apps/web/scripts/test-topic-reading-mobile-layout.mjs`

- [ ] **Step 1: Write the focused regression script**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const topicView = await readFile(
  new URL('../src/components/coding/TopicView.tsx', import.meta.url),
  'utf8',
);

assert.match(topicView, /fixed inset-0 z-\[60\]/, 'the reading modal must cover the global mobile navigation');
assert.match(topicView, /h-\[100dvh\] min-h-0 w-full flex-col/, 'the modal panel must stay within the mobile viewport');
assert.match(topicView, /shrink-0 border-b border-slate-200 px-3 pb-2 pt-\[calc\(0\.5rem_\+_env\(safe-area-inset-top\)\)\] sm:px-7 sm:pb-4 sm:pt-4/, 'the mobile reading header must use compact spacing');
assert.match(topicView, /mt-2 flex flex-nowrap items-center gap-1/, 'the mobile reading controls must stay on one compact row');
assert.match(topicView, /'Parar áudio' : 'Ouvir texto'/, 'the speech action must retain its requested full label');
assert.match(topicView, />Aprofundar com IA</, 'the AI action must retain its full mobile label');
assert.match(topicView, /<main className="min-h-0 flex-1 overflow-y-auto/, 'only the reading body should consume remaining scroll space');
assert.match(topicView, /<footer className="shrink-0[^\"]*env\(safe-area-inset-bottom\)/, 'the fixed footer must respect the iPhone safe area');
assert.match(topicView, /aria-label="Etapa anterior do estudo"[\s\S]*?rounded-xl[^\"]*px-3 py-2 text-xs[^\"]*sm:rounded-2xl/, 'the previous button must be visually smaller on mobile');
assert.match(topicView, /aria-label="Proxima etapa do estudo"[\s\S]*?rounded-xl[^\"]*px-3 py-2 text-xs[^\"]*sm:rounded-2xl/, 'the next button must be visually smaller on mobile');

console.log('topic reading mobile layout checks passed');
```

- [ ] **Step 2: Run the script and confirm the RED state**

Run: `node apps/web/scripts/test-topic-reading-mobile-layout.mjs`

Expected: FAIL on the missing `z-[60]` or compact viewport/header class because the current modal still uses `z-50`, mobile `py-4`, and an unconstrained `min-h-[100dvh]` panel.

### Task 2: Implement the compact header and fixed safe-area footer

**Files:**
- Modify: `apps/web/src/components/coding/TopicView.tsx:1227-1410`
- Test: `apps/web/scripts/test-topic-reading-mobile-layout.mjs`

- [ ] **Step 1: Constrain the modal to the viewport and raise it above global navigation**

Change the overlay and panel classes to:

```tsx
className="fixed inset-0 z-[60] flex min-h-[100dvh] items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-3 lg:p-4"
```

```tsx
className="flex h-[100dvh] min-h-0 w-full flex-col bg-white text-slate-900 shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:rounded-3xl lg:h-[calc(100dvh-2rem)]"
```

- [ ] **Step 2: Compact the mobile header while preserving the full requested action labels**

Replace the affected mobile-first class strings with these exact values while leaving the existing children and event handlers in place:

```tsx
<header className="shrink-0 border-b border-slate-200 px-3 pb-2 pt-[calc(0.5rem_+_env(safe-area-inset-top))] sm:px-7 sm:pb-4 sm:pt-4">
<p className="text-[0.65rem] font-black uppercase tracking-widest text-primary sm:text-xs">
<h2 id="reading-study-title" className="mt-0.5 text-base font-black leading-tight text-slate-900 sm:mt-1 sm:text-2xl">
<p className="mt-0.5 text-xs font-bold text-slate-500 sm:mt-1 sm:text-sm">
<button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 sm:h-11 sm:w-11 sm:rounded-2xl">
<div className="mt-2 flex flex-nowrap items-center gap-1 sm:mt-3 sm:flex-wrap sm:gap-2">
<div className="flex shrink-0 items-center rounded-xl border border-slate-200 sm:rounded-2xl">
<button className="flex h-10 w-8 items-center justify-center rounded-l-xl text-xs font-black text-slate-600 transition hover:bg-slate-100 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 sm:h-11 sm:w-9 sm:rounded-l-2xl">
<button className="flex h-10 w-8 items-center justify-center rounded-r-xl border-l border-slate-200 text-sm font-black text-slate-600 transition hover:bg-slate-100 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 sm:h-11 sm:w-9 sm:rounded-r-2xl">
<button className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-2 py-1 text-[0.68rem] font-black text-slate-600 transition hover:border-primary hover:bg-sky-50 hover:text-primary sm:min-h-11 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs">
<span className="whitespace-nowrap">{speaking ? 'Parar áudio' : 'Ouvir texto'}</span>
<button className="inline-flex min-h-10 min-w-0 items-center gap-1 rounded-xl border border-violet-200 px-2 py-1 text-[0.68rem] font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 sm:min-h-11 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs">
<span className="whitespace-nowrap">Aprofundar com IA</span>
<div className="mt-2 h-1 w-full rounded-full bg-slate-100 sm:mt-4 sm:h-2">
<div className="h-1 rounded-full bg-primary transition-all sm:h-2" style={{ width: `${progress}%` }} />
```

Keep the existing event handlers, disabled states, ARIA labels, speech state label (`Parar áudio`), and AI-deepening form behavior unchanged.

- [ ] **Step 3: Make the body the only flexible scroll region**

Change the main class prefix to:

```tsx
<main className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
```

- [ ] **Step 4: Compact and pin the footer above the safe area**

Use:

```tsx
<footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] sm:rounded-b-3xl sm:px-7 sm:py-4">
  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
```

Use these exact class strings for the two navigation buttons:

```tsx
className="flex items-center justify-center gap-1 rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
className="flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white hover:bg-primary-dark sm:gap-2 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
```

Render each chevron as `<ChevronLeft className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />` or `<ChevronRight className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />` so the icon follows the same mobile-only reduction.

- [ ] **Step 5: Run the focused regression and confirm the GREEN state**

Run: `node apps/web/scripts/test-topic-reading-mobile-layout.mjs`

Expected: PASS with `topic reading mobile layout checks passed`.

- [ ] **Step 6: Run relevant regressions and type checking**

Run:

```powershell
node apps/web/scripts/test-mobile-first-layout.mjs
python scripts/test_topic_context_reading_ai.py
Set-Location apps/web
pnpm typecheck
```

Expected: every command exits with code `0`; the Node scripts print their success lines, the Python script reports passed checks, and TypeScript emits no errors.

- [ ] **Step 7: Review the final diff and commit the implementation**

Run:

```powershell
git diff --check
git diff -- apps/web/src/components/coding/TopicView.tsx apps/web/scripts/test-topic-reading-mobile-layout.mjs
git add apps/web/src/components/coding/TopicView.tsx apps/web/scripts/test-topic-reading-mobile-layout.mjs docs/superpowers/plans/2026-09-10-compact-reading-card-mobile.md
git commit -m "fix: compact mobile topic reader"
```

Expected: no whitespace errors; the diff contains only the approved mobile layout and its regression test; the commit succeeds.

### Task 3: Publish the verified change

**Files:**
- Verify: Git working tree and `origin/main`

- [ ] **Step 1: Re-run the final verification gate immediately before publishing**

Run:

```powershell
node apps/web/scripts/test-topic-reading-mobile-layout.mjs
node apps/web/scripts/test-mobile-first-layout.mjs
python scripts/test_topic_context_reading_ai.py
Set-Location apps/web
pnpm typecheck
```

Expected: all commands exit with code `0` and no test or typecheck failures.

- [ ] **Step 2: Push the requested branch**

Run: `git push origin main`

Expected: `origin/main` advances to the new implementation commit.
