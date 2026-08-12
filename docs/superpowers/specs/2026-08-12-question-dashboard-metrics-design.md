# Question Dashboard Metrics Design

## Goal

Show dashboard metrics for questions answered in the Programming `Modo questões`, grouped by matéria, with resolved count, acertos, erros, and accuracy percentage.

## Scope

This feature counts only the dedicated multiple-choice topic questions from `ProgrammingQuestion`. It does not mix flashcard review attempts, language lesson questions, or Diverse subject questions into the same metric. Those can be added later with separate source labels if needed.

## Data Model

Each `ProgrammingQuestion` stores aggregate attempt counters:

- `attempt_count`: total submitted answers for the question.
- `correct_count`: submitted answers matching `correct_option`.
- `error_count`: submitted answers not matching `correct_option`.
- `last_selected_option`: most recent selected option, for debugging/display continuity.
- `last_answered_at`: most recent answer timestamp.

The dashboard groups these counters by `ProgrammingSubject` for the active child.

## API Behavior

Add `POST /api/coding/questions/{question_id}/attempt` with payload `{ "selected_option": "..." }`.

The route verifies the logged-in child owns the question through its subject, compares the selected option with `correct_option`, increments the counters, and returns the updated per-question result. Invalid ownership returns 404. Empty or overlong selected options are rejected by schema validation.

Extend `GET /api/study/dashboard` to include:

```json
{
  "question_metrics": [
    {
      "subject_id": 1,
      "subject_name": "AWS",
      "resolved_count": 12,
      "correct_count": 9,
      "error_count": 3,
      "accuracy_percent": 75
    }
  ]
}
```

Subjects with zero attempts are omitted so the dashboard stays focused.

## Frontend Behavior

When the user answers a question in `PracticeQuestionsModal`, the UI immediately shows the local feedback and asynchronously records the attempt. If recording fails, the practice flow is not blocked; a small warning is shown so the learner can continue.

The dashboard gains a `Questões por matéria` section showing one row/card per subject with:

- total resolved answers;
- acertos;
- erros;
- percentage of accuracy;
- a simple progress bar for the accuracy percentage.

If no questions have been answered yet, the section shows an empty state encouraging the user to use `Modo questões`.

## Testing

Automated tests cover:

- question attempt endpoint increments correct/error counters;
- dashboard aggregates metrics by subject for the current child only;
- unauthorized child cannot submit another child's question;
- frontend API types expose the new metric/attempt contracts;
- dashboard and practice modal contain the expected UI hooks.
