# Study Tracker Design

## Goal

Add a protected `Estudos` tab where the selected child can plan a study day, record distractions, write what was studied, and see today's dashboard plus the current study streak.

## Scope

- Store data in the backend, linked to the selected `ChildProfile`.
- Add one record per child per calendar date.
- Track:
  - planning text for the date, usually written the previous night;
  - what was actually studied;
  - distractions as a list of short text entries;
  - created and updated timestamps.
- Count a study day when `studied_text` is non-empty after trimming.
- Compute the current streak from consecutive study days ending at the most recent study day.
- Provide a client-side Pomodoro timer with browser notifications when a focus or break block ends.
- Expose the experience in a new `/study` frontend route and add it to the app navigation/home activity list.

## Backend Design

- Add `StudyDay` to `apps/api/models/database.py`.
- Add Pydantic schemas to `apps/api/schemas/schemas.py`.
- Add endpoints in `apps/api/main.py`:
  - `GET /api/study/dashboard` returns today's record, recent records, streak count, and last study date.
  - `PUT /api/study/day/{study_date}` upserts the selected child's record for an ISO date.
- Use `require_parent_session` and `get_requested_child` so records are linked to the logged-in account and active child.
- Keep migration compatibility by adding an Alembic revision and by relying on `SQLModel.metadata.create_all` for local startup.

## Frontend Design

- Add API types and methods in `apps/web/src/lib/api.ts`.
- Add `apps/web/src/app/study/page.tsx` as a client page protected by `useRequireAuth`.
- Page layout:
  - top dashboard with streak, today's status, and last study date;
  - editor for today's plan, studied text, and distraction entries;
  - Pomodoro controls for 25-minute focus and 5-minute break blocks, with optional browser notification permission;
  - recent-history section grouped by date.
- Save via one primary button. The page updates optimistically after the backend response.
- Use existing `kid-surface`, `kid-button`, Tailwind palette, and lucide icons.

## Validation

- Extend `scripts/test_api_routes.py` with backend smoke assertions for study dashboard/upsert/streak.
- Run the backend smoke script.
- Run the web production build to catch TypeScript and Next.js issues.
