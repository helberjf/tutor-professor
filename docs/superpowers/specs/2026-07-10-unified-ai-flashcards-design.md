# Unified AI Flashcards Across Study Modes

## Goal

Make reading and review display the same saved questions across Programming, Other Subjects, and Language lessons. Initial content generation must not call the AI a second time only to create flashcards. Users can explicitly add five more AI-generated questions from either the content view or the review/cards view, with an optional context instruction.

## Scope

This design covers every study category in the application:

- Programming subjects and topics in `CodingCurriculum`.
- Custom subjects and lesson blocks in the Diverse study area.
- Language lessons and review for every `target_language`, including English and French.

The existing spaced-repetition behavior remains in place. Existing cards and review history must not be deleted when additional questions are generated.

## Product Rules

1. Initial content generation uses one AI response for the lesson, quiz, and initial flashcards whenever the AI is responsible for all three artifacts.
2. Deterministic cards derived from existing lesson items do not require another AI request.
3. An additional generation always creates exactly five new questions.
4. Additional questions are appended to existing questions. They never replace existing cards.
5. A topic or lesson selection is mandatory. Context is optional and limited to 1,000 characters.
6. Programming questions prioritize technical interviews and reuse relevant code from the lesson.
7. General-subject questions prioritize exam-style recall, application, comparison, and common misconceptions.
8. Technical general subjects may include code when relevant; nontechnical subjects do not require code.
9. Language questions cover a useful mix of vocabulary, translation, sentence completion, grammar, reading comprehension, and contextual usage in the selected target language.
10. The same saved question is rendered in reading and review/cards modes.

## Current Problems

### Programming

Programming topic generation already returns sections, quiz questions, and flashcards in one response, and persists the cards in `ProgrammingFlashcard`. However, the prompts do not consistently prioritize technical-interview questions or require cards to reuse lesson code. The cards browser also hides `code_example` in its collapsed rows, making the two modes appear inconsistent.

### Other Subjects

Diverse lessons store question objects inside each lesson block and also copy them into the subject-level `topics` list. Reading and review can therefore update different copies of the same conceptual question. This is the main source-of-truth inconsistency in this module.

### Languages

Language review currently stores only vocabulary pairs in `ReviewItem`. It cannot represent grammar, completion, comprehension, or contextual questions tied to a lesson. A dedicated lesson-question representation is required so the lesson and review can reference the same question.

## Architecture

Each module keeps storage suited to its existing domain, but all modules implement the same generation contract and source-of-truth rule.

### Shared Generation Contract

The backend accepts:

- a required source reference: programming topic, Diverse lesson/topic, or language lesson;
- optional sanitized context, up to 1,000 characters;
- an implicit fixed count of five;
- the authenticated child and user AI configuration.

The prompt includes the saved source content, relevant code, target language when applicable, and normalized fronts of existing questions. The response contains exactly five objects with:

- `front` or question text;
- `back` or answer text;
- optional `code_example`;
- optional question type metadata for language questions.

Generation and persistence are separated. The service validates the full response before any card is saved.

### Programming Source of Truth

`ProgrammingFlashcard` remains canonical. `TopicView`, the deck card browser, and deck study sessions all read the same rows.

The initial topic-generation prompt continues returning `sections`, `quiz`, and `flashcards` in one JSON response. Its flashcard rules are strengthened to require:

- technical-interview phrasing by default;
- coverage of concepts actually taught in the generated sections;
- `code_example` copied or adapted from the lesson whenever code is material to the question;
- no duplicate or near-duplicate questions.

Additional generation uses the selected `ProgrammingTopic.ai_content`, its existing `ProgrammingFlashcard` rows, and the optional user context. Five validated `ProgrammingFlashcard` rows and their review items are inserted atomically.

### Other Subjects Source of Truth

Every Diverse question receives a stable identifier. The canonical question objects live once in the subject question collection. Lesson blocks reference questions by identifier instead of embedding independent mutable copies.

The persisted JSON evolves conceptually to:

```json
{
  "name": "Biologia",
  "topics": [
    {
      "id": "question-stable-id",
      "topic": "Qual é a função da mitose?",
      "answer": "Produzir células geneticamente equivalentes.",
      "code_example": null,
      "done": false,
      "review_count": 0
    }
  ],
  "lessons": [
    {
      "id": "lesson-stable-id",
      "title": "Mitose",
      "topic_ids": ["question-stable-id"]
    }
  ]
}
```

Compatibility normalization assigns stable identifiers to legacy questions and converts embedded lesson questions into references without losing progress. If the same legacy question exists in both locations, normalized question text is used to merge it into one canonical record, preferring the subject-level review state and filling missing answer or code fields from the lesson copy.

Additional generation requires a selected lesson or topic and appends five canonical questions. The selected lesson receives their identifiers. Reading, editing, and review resolve the same objects.

### Language Source of Truth

Add a child-owned lesson-question model for generated language questions. It stores:

- child and lesson identifiers;
- question and answer;
- target language;
- question type;
- optional supporting example;
- created timestamp;
- review scheduling state needed by the language review flow.

The model is canonical for both the lesson question list and review. Existing vocabulary `ReviewItem` rows remain supported and are combined with lesson questions in the review API rather than destructively migrated.

Initial vocabulary review cards continue to be seeded deterministically from `LessonItem`, which costs no additional AI request. Explicit additional generation uses the selected lesson's phrases, translations, breakdowns, objective, theme, target language, existing lesson questions, and optional user context.

The prompt requests a balanced set of five questions across vocabulary, translation, completion, grammar, comprehension, and contextual usage. The exact mix may adapt to the lesson, but it must not return five copies of the same question type.

## API Design

Module-specific endpoints preserve ownership checks and keep the frontend calls explicit:

- `POST /api/coding/topics/{topic_id}/flashcards/generate`
- `POST /api/study/diverse/questions/generate`
- `POST /api/lessons/{lesson_id}/questions/generate`

Each accepts `{ "context": "optional text" }`, with the Diverse request also carrying the stable lesson or topic reference required by its JSON-backed model. Each returns the five persisted questions in display-ready form.

The existing programming topic creation/generation endpoints keep their response shape. The initial prompt and persistence logic are updated without adding another request.

Language lesson responses expose their saved generated questions. The language review session response becomes a discriminated union of existing vocabulary cards and lesson-question cards so the frontend can render and grade both safely.

## User Interface

### Shared Interaction

The action label is `Criar mais questões com IA` or the shorter `Criar com IA` where space is constrained. Activating it opens an inline form containing:

- a required topic or lesson selector when the current screen does not already identify one;
- an optional context textarea;
- a fixed-count explanation: `Serão criadas 5 questões`;
- cancel and generate actions.

The interface shows loading, success, and actionable error states. On success, the same local collection displayed by the current view is refreshed immediately.

### Programming

- Reading: the action appears in the flashcards section at the end of `TopicView`. The current topic is preselected.
- Cards: the action appears beside search and manual card creation inside the Cards tab. The user must select a topic.
- `code_example` is rendered with `SyntaxCodeBlock` in reading, card browsing/details, and study reveal views whenever present.

### Other Subjects

- Visualize: the action appears inside the selected lesson block.
- Review/List: the action appears with the question-management controls and requires the destination lesson/topic when it is not implicit.
- Newly generated questions appear immediately in both Visualize and Review because both resolve the same stable identifiers.

### Languages

- Lesson: the action appears with the completed/current lesson question area and implicitly targets that lesson.
- Review: the action appears in question-management controls and requires a lesson selection.
- The wording and generated content use the lesson's `target_language`; the behavior is not hard-coded to English.

## Validation and Failure Handling

The backend sanitizes whitespace and truncates context to 1,000 characters. It checks source ownership before calling the AI.

The complete AI response must contain exactly five valid, nonempty, nonduplicate questions. Duplicate detection compares normalized question text against both the current response and existing cards for the selected source. Invalid output returns an error and persists nothing.

All five cards are persisted in one transaction. A database error rolls back the entire batch. Existing questions and review scheduling state are untouched.

The frontend keeps the form open after a recoverable failure and displays the backend message. It does not optimistically append cards before the server confirms persistence.

## Testing Strategy

### Backend

- Prove initial programming topic generation makes one AI call and persists lesson content plus cards from that response.
- Verify the programming prompt prioritizes technical interviews and requires relevant lesson code.
- Verify additional programming generation includes source lesson content, existing questions, and user context, then appends exactly five rows.
- Verify Diverse legacy JSON normalization produces stable IDs, merges copies without losing review state, and makes lessons reference canonical questions.
- Verify general-subject prompts request exam questions and allow code only when relevant.
- Verify language generation uses the lesson's actual target language and requests varied question types.
- Verify source ownership, missing source, duplicate output, malformed output, and partial database failure do not persist any cards.
- Verify existing cards and review history remain unchanged after an additional generation.

### Frontend

- Verify generation controls exist in both content and review/cards entry points for all three modules.
- Verify topic/lesson selection is mandatory when not implied by the current view.
- Verify context is sent and the fixed count is presented as five.
- Verify success refreshes the visible canonical collection and error keeps the form available.
- Verify code examples render consistently in programming reading, browsing, and study views.
- Verify English, French, and other target languages use the same language-question UI without hard-coded labels.

### Regression and Build

Run focused backend and source-level UI tests first, then the complete API test suite, web lint/type checks, and production build. Browser verification covers desktop and mobile layouts for each entry point.

## Delivery Sequence

The implementation is divided into three bounded phases while preserving one product contract:

1. Shared validation/prompt helpers and Programming source-of-truth/UI fixes.
2. Diverse stable-question normalization and both generation entry points.
3. Language lesson-question persistence, mixed review support, and both generation entry points.

Each phase is independently testable. Later phases reuse the validated generation rules without forcing the three existing study domains into one risky database table.

## Out of Scope

- Replacing the existing spaced-repetition algorithms with one universal scheduler.
- Automatically generating more than five questions.
- Deleting or replacing existing cards during additional generation.
- Rewriting unrelated lesson, quiz, or book-generation flows.
