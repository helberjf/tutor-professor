# Helber Coding Course Seed Design

## Goal

Restore and expand Henrique's coding-study curriculum for `helberjf@gmail.com` by adding a durable, repeatable seed for the requested subjects. The AWS Cloud Practitioner course must be the deepest course because the user explicitly asked to focus more on AWS.

## Scope

The seed must upsert these subjects without deleting existing user data:

- `prova Aws cloud practitioner`
- `React`
- `Vite`
- `cybersecurity para saas`
- `load balancer`
- `GitHub actions`
- `perguntas de entrevista`
- `system design`
- `microservices`
- `mensageira para entrevistas`

The AWS course should include about 24 topics. The other subjects should include about 8 to 14 topics each. Every topic must include reading-mode content (`sections` and `quiz`) and flashcard-mode content (`ProgrammingFlashcard` rows with review items).

## Data Model

Use the existing `ProgrammingSubject`, `ProgrammingTopic`, `ProgrammingFlashcard`, and `CodingReviewItem` tables. Content is stored in `ProgrammingTopic.ai_content` with the existing schema:

- `title`
- `sections`
- `quiz`
- `flashcards`

The seed identifies the target by `email` and `child_name`, then upserts by normalized subject name and normalized topic title.

## Safety

The seed must not delete subjects, topics, notes, status, attempts, or existing flashcards. It may update generated seed content for matching topics, but it must preserve manual `notes` and `status`. It must be idempotent: running the seed twice must not duplicate subjects, topics, flashcards, or review items.

Before running against the real local PostgreSQL database, create a PostgreSQL dump backup. After the seed finishes, create another dump backup.

## Content Guidance

Use current official or primary documentation for changing topics:

- AWS CLF-C02 exam guide and in-scope services.
- AWS Well-Architected and shared responsibility concepts.
- GitHub Actions official workflow syntax and secrets documentation.
- Vite official docs for environment variables, modes, config, and build behavior.
- React official docs for components, state, hooks, effects, refs, context, and performance.
- OWASP ASVS and multi-tenant security cheat sheets for SaaS security.

Examples should prefer TypeScript when the subject can naturally support code.

## Testing

Add a focused script-level test that verifies:

- The catalog includes every requested subject.
- The AWS course has more topics than the other courses.
- Every topic has sections, quiz, and flashcards.
- Applying the seed twice is idempotent.
- Existing topic notes and status are preserved.

