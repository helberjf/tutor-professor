# AI Lesson Context Preview Design

## Goal

Add a context field to AI lesson creation in the `study?tab=dev-jr` flow, then let the user preview generated lessons before saving and view saved lessons in a reading mode.

## Scope

This applies to the Diverse study subject dashboard, where each subject can generate a new lesson block with AI. The current one-click generation will become a two-step flow: generate a draft from the subject plus optional context, then either save it as a lesson block or discard it. Saved lesson blocks keep the current editable list and review modes, and gain a `Visualizar` tab for reading the lesson content.

The existing English lesson generator in the sidebar is outside this change.

## User Flow

1. The user opens a subject tab such as `dev-jr`.
2. The AI controls show a text area labeled for optional context.
3. The user writes context such as "crie uma licao sobre hooks, props e erros comuns em React".
4. `Criar preview da licao` calls the existing Diverse flashcard generator with `context`.
5. The UI shows a draft preview with title, topic count, questions, and answers.
6. The user can save the draft into the subject lessons or discard it.
7. Saved lesson cards show `Lista`, `Revisar`, and `Visualizar`.

## Architecture

The backend endpoint `POST /api/study/diverse/generate-flashcards` accepts an optional `context` string. It sanitizes the value, inserts it into the AI prompt, and keeps the same response shape so existing callers remain compatible.

The frontend stores one pending AI lesson draft in `StudyPage`, scoped to the selected subject action. It reuses the existing `DiverseLessonBlock` structure so saving a draft is a local state update followed by the existing `Salvar materia` action.

## Components

- `apps/api/schemas/schemas.py`
  - Add `context?: str` to `GenerateFlashcardsRequestSchema`.

- `apps/api/main.py`
  - Include sanitized context instructions in the prompt for subject generation and normal flashcard generation.

- `apps/web/src/lib/api.ts`
  - Add `context?: string` to `GenerateFlashcardsPayload`.

- `apps/web/src/app/study/page.tsx`
  - Add pending draft state and context state.
  - Change lesson AI creation to draft generation.
  - Add save/discard handlers.
  - Add a draft preview panel in the subject dashboard.
  - Add `Visualizar` mode to `SubjectStudyCard`.

## Error Handling

If AI generation fails, the existing error display remains in place. If generated topics are all duplicates, the current duplicate warning remains. Discarding a draft clears only the pending draft and does not touch saved lessons. Saving a draft appends it to the selected subject and shows the existing save reminder.

## Testing

Backend tests should prove that request context is accepted and appears in the generated prompt. Frontend verification should include TypeScript build/lint, and browser/manual verification should check that the UI exposes the context field, shows a draft before saving, and displays the saved lesson in `Visualizar` mode.
