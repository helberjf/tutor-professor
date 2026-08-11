# Topic Context and Reading AI Enhancements

## Goal

Improve the programming study flow so topic creation accepts AI context, topic-level AI actions are easier to find, flashcard mode keeps the current subject, and the reading modal can speak text and deepen a concept with an ephemeral AI answer ready for Notion.

## Scope

This design applies to the programming curriculum screens:

- `CreateTopicModal`, where users create a topic inside an existing subject.
- `CodingCurriculum` and `CodingTab`, where users switch between reading and flashcard modes.
- `TopicView`, including the topic header, regenerate action, flashcard section, and reading study modal.
- FastAPI coding endpoints and AI service helpers needed for topic creation context and ephemeral deepening.

It does not change stored lesson content, saved notes, review history, or flashcard scheduling rules.

## Product Rules

1. Creating a new topic can include an optional context text when `Gerar aula com IA` is enabled.
2. The new-topic context is used only for AI generation and is not stored as topic metadata.
3. The subject context still applies, and the topic context refines it for that one generation.
4. The action currently shown as `Regenerar com IA` becomes `Recriar aula com IA` near the `Iniciar estudo` button.
5. Clicking `Modo flashcards` while viewing a subject or a topic opens that same subject's flashcard deck.
6. The flashcard deck back button returns to that subject's topic list when the user came from a subject, not always to all subjects.
7. The reading modal exposes `Ouvir texto` for the current step.
8. `Aprofundar com IA` opens a local box for the user's doubt or extra context.
9. Deepening answers are never persisted to the database.
10. The default deepening instruction asks for concise, objective teaching of important concepts with examples for each concept.
11. Deepening output is Markdown ready to copy into Notion.

## Architecture

The topic creation schema gains an optional `context` field capped at 1,000 characters. `create_coding_topic` sanitizes it, combines it with the subject context, and passes the result into the existing one-call `generate_topic_ai_content` path. If `generate_ai` is false, the context is ignored by the backend.

The reading/deck navigation remains local React state. `CodingTab` passes the active mode into `CodingCurriculum`; `CodingCurriculum` stops resetting the whole view on every mode change. Instead, it transitions the current subject/topic view into the appropriate reading or deck view. A deck view carries a `returnToTopics` flag so closing the deck can return to the current subject.

The `Regenerar com IA` form remains the same backend behavior, but its trigger moves into the topic header action group and is renamed `Recriar aula com IA`. When opened, the context form renders below the header.

The reading modal uses the existing browser speech helper for `Ouvir texto`. It builds spoken text from the current section or quiz step, excluding raw code blocks unless the step is a quiz answer/explanation. Playback is local to the browser and can be cancelled by pressing the same control again or closing the modal.

Deepening uses a new stateless endpoint:

`POST /api/coding/topics/{topic_id}/reading/deepen`

The request includes the current step payload and optional question text. The route authenticates the user, verifies topic ownership, builds a bounded prompt from the saved topic title, subject name, current section or quiz content, and the user's doubt, then calls the configured AI provider. It returns only `{ "content": "markdown" }` and performs no inserts, updates, or commits.

## Deepening Prompt Contract

The default prompt instructs the model to produce Brazilian Portuguese Markdown suitable for Notion:

- start with a concise heading;
- list the important concepts in the current step;
- explain each concept briefly and objectively;
- include at least one example per concept;
- include code fences when code is relevant;
- avoid long essays and unrelated content;
- answer the user's typed doubt when present.

The frontend displays the Markdown in a copy-friendly textarea or preformatted panel, with a `Copiar para Notion` button.

## Failure Handling

Topic creation with invalid AI output behaves like the current AI topic generation: no topic or flashcards are persisted.

Deepening failures keep the input box open and show the backend error. Since no database write happens, retrying does not risk duplicate records.

If browser speech is unsupported, the reading modal shows a short local error and leaves the text visible.

## Testing Strategy

Backend tests verify:

- `CreateProgrammingTopicSchema` accepts optional context and enforces the 1,000-character limit.
- creating a topic with `generate_ai=true` passes combined subject and topic context to `generate_topic_ai_content`;
- creating a topic with invalid AI output and context persists nothing;
- the deepening prompt contains Notion, concise concepts, examples, current topic content, and the user's doubt;
- the deepening endpoint authenticates ownership and returns content without committing or creating rows.

Frontend/source tests verify:

- the new-topic modal shows a context textarea when AI generation is selected and sends it in `api.createCodingTopic`;
- the API client type for `createCodingTopic` accepts `context`;
- `Recriar aula com IA` appears near the header CTA and the old bottom-only `Regenerar com IA` trigger is removed;
- `CodingCurriculum` preserves the selected subject when switching to flashcard mode;
- the reading modal contains `Ouvir texto`, `Aprofundar com IA`, a doubt textarea, an API call, and copy-to-Notion behavior.

Manual or browser verification covers the modal layout, subject-preserving flashcard navigation, reading modal controls, and responsive behavior.

## Out of Scope

- Persisting deepening questions or answers.
- Adding a full Markdown renderer dependency.
- Changing FSRS scheduling.
- Reworking non-programming subject flows in this round.
