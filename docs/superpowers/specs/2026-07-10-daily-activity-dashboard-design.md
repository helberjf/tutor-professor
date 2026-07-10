# Daily Activity Dashboard Design

## Goal

Make every meaningful study action appear in the dashboard so the learner and parent can see what was studied during the day.

## Current State

The project already has a `DailyActivity` database table, summary endpoints, a daily activity widget, and an activity log page.

The backend already logs English lesson completion, quiz submission, and English review attempts. Some other study areas log from the frontend with `api.logActivity`, including coding days, diverse study days, coding review completion, flashcard deck completion, and LeetCode manual registration.

That split makes the dashboard incomplete when a frontend call is missed, fails, or a future client uses only the domain endpoint.

## Approach

Use the backend as the source of truth for activity logging. Any endpoint that persists or completes study work should also create a `DailyActivity` row in the same request.

Keep `POST /api/activity/log` for explicit/manual events such as the current LeetCode register button, but stop relying on separate frontend log calls for normal save/attempt endpoints.

## Activities To Track

- English lessons: logged when `/api/lesson/complete` succeeds.
- English quizzes: logged when `/api/quiz/submit` succeeds.
- English reviews: logged when `/api/review/attempt` succeeds.
- Study planner/manual study notes: logged when `/api/study/day/{date}` saves non-empty studied content or a Pomodoro increment.
- Coding day tracker: logged when `/api/study/coding/{date}` saves checked or named coding topics.
- Diverse study tracker: logged when `/api/study/diverse/{date}` saves subjects, lessons, answered topics, reviewed topics, or checked topics.
- Coding review: logged when `/api/coding/review/attempt` succeeds.
- Flashcard deck/Anki study: logged when `/api/coding/deck/attempt` succeeds.
- LeetCode trainer: logged through the existing manual activity endpoint unless a later endpoint is added for "session complete".

## Duplicate Handling

Fine-grained attempts may create one row per attempt, as English review already does.

Save endpoints for daily trackers should avoid creating empty or noisy logs. They should create a log only when the saved payload contains study content:

- `StudyDay`: non-empty `studied_text` or increased `pomodoro_count`.
- `CodingDay`: at least one topic exists and at least one topic is checked or named.
- `DiverseDay`: at least one subject contains a topic or lesson.

For tracker save endpoints, repeated saves on the same day should not spam identical rows. The backend should compare the existing record before updating and log only when the persisted study summary changes meaningfully.

## Dashboard Behavior

The dashboard should surface today's activities through the existing `DailyActivityWidget`/activity log components. If the dashboard page does not currently show this widget prominently, add it near the top of the study overview so the daily control is visible without navigating away.

The full activity log page remains the detailed view, with filters and weekly chart support.

## Data Shape

Continue using `DailyActivity`:

- `activity_type`: stable category such as `lesson`, `quiz`, `review`, `study`, `coding`, `diverse`, `coding_review`, `flashcard`, or `leetcode`.
- `activity_title`: human-readable Portuguese title.
- `activity_id`: related entity id when available.
- `result_score`: percentage or correctness score where meaningful.
- `result_details`: JSON details such as words reviewed, counts, subject names, topic counts, ratings, and Pomodoro count.
- `activity_date`: date being studied. For daily tracker save endpoints, use the selected `study_date`; for live attempts, use today's local date.

## Error Handling

Activity logging must not happen if the main study action fails.

For automatic backend logging, logging should be part of the same database transaction as the main update whenever practical. If a log cannot be built from optional lookup data, save a generic but useful title instead of failing the study action.

## Testing

Backend smoke tests should verify that:

- Existing lesson, quiz, and review flows still create activity rows.
- Saving a study day with `studied_text` creates a `study` row.
- Saving coding and diverse study days creates `coding` and `diverse` rows without requiring a second frontend call.
- Coding review and deck attempts create `coding_review` and `flashcard` rows.
- `/api/activity/today` includes all activity types created during the test.

Frontend tests or smoke checks should verify that the dashboard renders the activity widget and can show today's logged activities.
