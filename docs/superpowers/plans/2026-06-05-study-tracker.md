# Study Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-backed study tracker tab for daily planning, distraction logging, studied-content notes, study streak visibility, and Pomodoro focus blocks with notifications.

**Architecture:** Add one `StudyDay` row per selected child and date. The FastAPI backend owns persistence and streak calculation; the Next.js frontend renders `/study` and saves through typed API helpers.

**Tech Stack:** FastAPI, SQLModel, Pydantic, SQLite/PostgreSQL-compatible schema, Next.js App Router, React client components, Tailwind, lucide-react.

---

### Task 1: Backend Study API

**Files:**
- Modify: `scripts/test_api_routes.py`
- Modify: `apps/api/models/database.py`
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Create: `apps/api/alembic/versions/0003_study_days.py`

- [ ] Write failing smoke assertions for unauthenticated study access, creating today's study record, updating distractions, and reading a non-zero streak.
- [ ] Run `python scripts/test_api_routes.py` and confirm the study endpoint assertions fail because the routes do not exist.
- [ ] Add `StudyDay` model with `child_id`, `study_date`, `plan_text`, `studied_text`, `distractions_json`, `created_at`, and `updated_at`.
- [ ] Add schemas for study day updates and dashboard responses.
- [ ] Add helper functions for ISO date parsing, distraction sanitization, study-day serialization, and streak calculation.
- [ ] Add protected `GET /api/study/dashboard` and `PUT /api/study/day/{study_date}` endpoints.
- [ ] Add Alembic revision for the `studyday` table.
- [ ] Run `python scripts/test_api_routes.py` and confirm the new assertions pass.

### Task 2: Frontend Study Page

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/navbar.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/study/page.tsx`

- [ ] Add TypeScript interfaces and API methods for `StudyDay`, `StudyDashboard`, and `StudyDayUpdatePayload`.
- [ ] Add `Estudos` link to the menu and home activity grid.
- [ ] Build `/study` as a protected client page with dashboard cards, today's form, distraction add/remove controls, Pomodoro controls, browser notifications, and recent history.
- [ ] Keep the UI responsive with stable button/input sizing and existing kid-themed styles.
- [ ] Run `pnpm --dir apps/web build` and fix TypeScript or build errors.

### Task 3: Final Verification

**Files:**
- Review all changed files.

- [ ] Run `python scripts/test_api_routes.py`.
- [ ] Run `pnpm --dir apps/web build`.
- [ ] Run `git status --short`.
- [ ] Review the final diff for secrets, generated files, and unrelated changes.
