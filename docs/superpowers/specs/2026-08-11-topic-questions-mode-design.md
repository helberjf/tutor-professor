# Topic Questions Mode Design

## Goal

Add a dedicated programming-topic question mode so a student can practice only multiple-choice questions generated from the topic theme, request more questions later, and never receive repeated questions for the same topic.

## Scope

This design applies to the programming curriculum flow:

- `CodingTab`, where study modes are selected.
- `CodingCurriculum`, where subjects, topics, decks, and topic detail views are routed.
- `TopicView`, where the topic card currently exposes reading, AI recreation, and studied actions.
- FastAPI coding routes and schemas for generated topic questions.
- The database model used to persist generated multiple-choice questions.

It does not replace flashcards, the Anki-style deck, reading quiz steps embedded in `ai_content`, or existing lesson-question behavior for English lessons.

## Product Rules

1. A new mode named `Modo questões` is available next to reading and flashcards.
2. A topic detail header exposes a clear action to practice questions only.
3. A topic created with AI receives an initial multiple-choice question batch as part of the same saved topic flow.
4. If an older topic has no saved questions, the student can generate the first batch from the topic screen.
5. The student can request more generated questions for the same topic.
6. Generated questions are multiple choice with exactly four options, one exact correct option, and an explanation.
7. Generated questions must come from the topic title and saved AI lesson content when available.
8. New generated questions must not repeat existing questions in the same topic.
9. Deduplication is enforced in the backend using a normalized question key, not only by prompt wording.
10. The question practice session is separate from flashcards and does not change FSRS scheduling.

## Architecture

Add a `ProgrammingQuestion` table keyed by topic, subject, child, and `question_key`. The key is a normalized version of the prompt and is unique per topic, so a repeated AI output fails validation instead of being silently saved.

The AI service gains a prompt and validator for programming multiple-choice questions. The topic creation route saves the initial questions from `TopicAIContentSchema.quiz`; the new generate-more route asks the AI for exactly five fresh questions while passing the saved topic content and existing question prompts as avoid-list context.

The frontend API exposes `getTopicQuestions` and `generateCodingTopicQuestions`. `TopicView` loads question counts, shows a `Fazer questões` button in the header, opens a full-screen multiple-choice practice modal, and exposes `Gerar mais questões` without mixing this flow into flashcards.

`CodingMode` becomes `reading | flashcards | questions`. Switching to `Modo questões` while a subject or topic is selected preserves the current context and opens question-oriented practice rather than the flashcard deck.

## Prompt Contract

The additional-question prompt asks for JSON only:

```json
{
  "questions": [
    {
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_option": "exact option text",
      "explanation": "string"
    }
  ]
}
```

Rules:

- return exactly five questions;
- write in Brazilian Portuguese, keeping code and identifiers in English;
- use four nonblank options;
- make `correct_option` exactly match one option;
- use saved topic content when available;
- avoid existing prompts and paraphrases;
- focus on reasoning, trade-offs, debugging, common pitfalls, and exam-style recall.

## Failure Handling

If AI topic creation fails, no topic, flashcards, or questions are persisted.

If more-question generation returns repeated or invalid questions, the route responds with an error and persists nothing from that batch.

If a topic has no saved AI lesson content, question generation can still use the subject name, topic title, notes, and optional user context; the UI should show the same retry-friendly error style used by existing AI actions.

## Testing Strategy

Backend/source tests verify:

- `ProgrammingQuestion` model and schemas exist.
- question validation rejects duplicate prompts, invalid option counts, and incorrect `correct_option`.
- topic creation with AI persists the five quiz questions as saved topic questions.
- generate-more passes existing prompts, validates uniqueness, and appends exactly five new records.
- API client exposes list and generate methods.
- `CodingTab` includes `Modo questões`.
- `TopicView` exposes `Fazer questões`, `Gerar mais questões`, multiple-choice answer handling, and non-repetition messaging.

Manual browser verification covers the header button placement, responsive modal layout, answering questions, completion state, and generating another nonrepeating batch.
