# Daily Activity Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard show every study activity saved or completed by the learner.

**Architecture:** Keep `DailyActivity` as the central activity ledger. Move normal study logging into backend endpoints so the database is updated in the same request that saves the study action, and keep the frontend manual logger only for explicit user-triggered logs such as LeetCode.

**Tech Stack:** FastAPI, SQLModel, SQLite/Postgres-compatible SQLModel models, Next.js/React, existing Python smoke tests.

---

## File Structure

- Modify `scripts/test_api_routes.py`: add failing assertions that all major study flows create daily activity records without extra frontend log calls.
- Modify `apps/api/main.py`: add helper functions for creating/summarizing `DailyActivity`, then call them from study, coding, diverse, coding-review, and deck endpoints.
- Modify `apps/web/src/app/study/page.tsx`: remove frontend `api.logActivity` calls for coding and diverse save flows to prevent duplicate rows.
- Modify `apps/web/src/components/coding/ReviewSession.tsx`: remove summary frontend activity log for coding review because backend attempts now log it.
- Modify `apps/web/src/components/coding/FlashcardDeck.tsx`: remove summary frontend activity log for deck completion because backend attempts now log it.
- Modify `apps/web/src/components/daily-activity-log.tsx`, `apps/web/src/components/daily-activity-widget.tsx`, and `apps/web/src/components/weekly-activity-chart.tsx`: add labels/colors/icons for the new `study` activity type.
- Modify `apps/web/src/app/dashboard/page.tsx` and `apps/web/src/components/activity-log-section.tsx`: make today's activity control more prominent and Portuguese-first.

### Task 1: Backend Smoke Test Coverage

**Files:**
- Modify: `scripts/test_api_routes.py`

- [x] **Step 1: Write the failing test**

Add assertions after existing study/coding/diverse/review/deck flows that collect `/api/activity/today` and require these activity types:

```python
activity_response = await client.get("/api/activity/today", headers=child_headers)
assert_status(activity_response, 200, "today activity log")
activity_payload = activity_response.json()
activity_types = activity_payload["activities_by_type"]
for expected_type in ["lesson", "quiz", "review", "study", "coding", "diverse", "coding_review", "flashcard"]:
    if activity_types.get(expected_type, 0) < 1:
        raise AssertionError(f"expected {expected_type} in activity log, got {activity_payload}")
```

Also add a second identical save for coding/diverse where practical and assert the count does not grow for unchanged tracker saves.

- [x] **Step 2: Run test to verify it fails**

Run: `python scripts/test_api_routes.py`

Expected: FAIL because `study`, `coding`, `diverse`, `coding_review`, or `flashcard` are absent unless the frontend made a separate log call.

### Task 2: Backend Activity Helpers

**Files:**
- Modify: `apps/api/main.py`

- [x] **Step 1: Write minimal helper implementation after `compute_study_streak`**

```python
def add_daily_activity(
    session: Session,
    *,
    child_id: int,
    activity_type: str,
    activity_title: str,
    activity_date: date | None = None,
    activity_id: int | None = None,
    result_score: float | None = None,
    result_details: dict | None = None,
    duration_seconds: int | None = None,
) -> DailyActivity:
    activity = DailyActivity(
        child_id=child_id,
        activity_date=activity_date or date.today(),
        activity_type=activity_type[:40],
        activity_title=activity_title[:200],
        activity_id=activity_id,
        result_score=result_score,
        result_details=result_details,
        duration_seconds=duration_seconds,
    )
    session.add(activity)
    return activity
```

- [x] **Step 2: Add summary helpers for tracker payloads**

Add helpers that return stable dicts for study, coding, and diverse tracker records:

```python
def summarize_study_activity(record: StudyDay) -> dict:
    return {
        "studied_text": (record.studied_text or "").strip(),
        "pomodoro_count": int(record.pomodoro_count or 0),
    }
```

Include equivalent helpers for coding and diverse that count subject names, topics, completed topics, lessons, answered topics, and reviewed topics.

### Task 3: Backend Automatic Logs

**Files:**
- Modify: `apps/api/main.py`

- [x] **Step 1: Replace inline English activity creation with `add_daily_activity`**

Change existing lesson, quiz, and review inline `DailyActivity(...)` blocks to use `add_daily_activity(...)` without changing response behavior.

- [x] **Step 2: Log study day saves**

In `upsert_study_day`, capture the old summary before mutation, build the new summary after mutation, and call:

```python
if (new_summary["studied_text"] or new_summary["pomodoro_count"] > 0) and new_summary != old_summary:
    add_daily_activity(
        session,
        child_id=child_id,
        activity_date=study_date,
        activity_type="study",
        activity_title="Estudo registrado",
        result_details=new_summary,
    )
```

- [x] **Step 3: Log coding and diverse day saves**

In `upsert_coding_day` and `upsert_diverse_day`, compare old/new summaries and log only when the saved content is meaningful and changed.

- [x] **Step 4: Log coding review attempts**

In `/api/coding/review/attempt`, after the attempt is registered and before commit, look up the flashcard/topic/subject and call `add_daily_activity` with `activity_type="coding_review"`.

- [x] **Step 5: Log deck attempts**

In `/api/coding/deck/attempt`, after `apply_deck_attempt` and before commit, call `add_daily_activity` with `activity_type="flashcard"` and result details including rating, subject, topic, flashcard id, and current state.

- [x] **Step 6: Run test to verify it passes**

Run: `python scripts/test_api_routes.py`

Expected: PASS with all expected activity types present.

### Task 4: Remove Frontend Duplicate Logs

**Files:**
- Modify: `apps/web/src/app/study/page.tsx`
- Modify: `apps/web/src/components/coding/ReviewSession.tsx`
- Modify: `apps/web/src/components/coding/FlashcardDeck.tsx`

- [x] **Step 1: Remove frontend activity log calls from backend-owned flows**

Delete these `api.logActivity(...)` calls:

```tsx
await api.logActivity({ activity_type: 'coding', ... }).catch(() => {});
await api.logActivity({ activity_type: 'diverse', ... }).catch(() => {});
void api.logActivity({ activity_type: 'coding_review', ... }).catch(() => {});
void api.logActivity({ activity_type: 'flashcard', ... }).catch(() => {});
```

Keep LeetCode's explicit manual registration button.

- [ ] **Step 2: Run TypeScript checks**

Run: `cd apps/web; pnpm lint` or, if lint is unavailable, `pnpm exec tsc --noEmit`.

Expected: PASS with no unused imports from removed logging code.

Status: blocked in this environment before TypeScript runs because `pnpm exec tsc --noEmit` tries to recreate `apps/web/node_modules` and fails on registry certificate / minimum-release-age policy checks.

### Task 5: Dashboard Labels and Prominence

**Files:**
- Modify: `apps/web/src/components/daily-activity-log.tsx`
- Modify: `apps/web/src/components/daily-activity-widget.tsx`
- Modify: `apps/web/src/components/weekly-activity-chart.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/components/activity-log-section.tsx`

- [x] **Step 1: Add `study` display metadata**

Add `study` to icon/color/label maps:

```tsx
study: 'Estudo',
```

Use a neutral slate/emerald visual treatment that fits the existing components.

- [x] **Step 2: Move activity section above long-term overview**

On `/dashboard`, render `<ActivityLogSection />` before the `<DashboardOverview />` section so the daily control is immediately visible.

- [ ] **Step 3: Verify frontend build/typecheck**

Run: `cd apps/web; pnpm exec tsc --noEmit`

Expected: PASS.

Status: blocked in this environment for the same pnpm dependency refresh issue noted above.

### Task 6: Final Verification

**Files:**
- No new files.

- [x] **Step 1: Run backend smoke tests**

Run: `python scripts/test_api_routes.py`

Expected: `API route smoke tests passed.`

- [ ] **Step 2: Run frontend typecheck**

Run: `cd apps/web; pnpm exec tsc --noEmit`

Expected: command exits 0.

Status: blocked before `tsc` executes by pnpm registry certificate / minimum-release-age policy errors while rebuilding dependencies.

- [x] **Step 3: Inspect git diff**

Run: `git diff --stat`

Expected: changes limited to activity tracking, dashboard display, and the plan/spec docs.
