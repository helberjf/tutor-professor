# Tutor and Professor

Tutor and Professor is a full-stack personal tutoring app for children. It combines short language lessons, quizzes, spaced repetition, AI-generated practice, text-to-speech, parent controls, and study tools for broader subjects such as programming.

The project was built as a practical engineering exercise: a real product surface, a typed frontend, a Python API, persistent data, AI integration, runtime backend routing, auth, tests, and deployment constraints.

## Live Demo

- Frontend: https://tutorprofessor.vercel.app
- Backend model: the public frontend talks to a local FastAPI backend exposed through Cloudflare Tunnel.

Important: the Vercel demo only works when the local backend and Cloudflare Tunnel are running. This is intentional for the current architecture: the frontend is public, while the backend and database remain local.

## What This Project Demonstrates

- Full-stack product thinking: child-facing lessons plus parent/admin workflows.
- Typed React/Next.js frontend with reusable API client and runtime connection handling.
- FastAPI backend with SQLModel models, Pydantic schemas, auth, and domain services.
- AI workflows with validation, retry-safe behavior, and safeguards against malformed generated content.
- Spaced repetition and review flows for vocabulary, lesson questions, coding flashcards, and study topics.
- Local-first deployment using Vercel plus Cloudflare Tunnel, including recovery from stale tunnel URLs.
- Automated tests for backend services, AI output validation, UI state helpers, and deployment edge cases.

## Core Features

### Child Learning

- Daily lessons with target-language vocabulary, examples, and mini activities.
- Quizzes with scoring and friendly feedback.
- Mixed review sessions combining vocabulary and lesson-generated questions.
- Audio playback through a local TTS provider with browser speech fallback.
- Progress tracking, streaks, level analysis, and daily activity logs.

### Parent Area

- Account registration and login.
- Parent dashboard for children, progress, settings, and AI provider configuration.
- Child profile management, including target language and audio preferences.
- AI-powered lesson, question, book, and flashcard generation.

### Study Modes

- General study dashboard with planning, notes, distractions, and pomodoro count.
- Diverse subject study mode for custom topics and AI-generated questions.
- Programming curriculum with subjects, topics, generated explanations, quizzes, and flashcards.
- Coding review and deck-style flashcard study with scheduling state.
- LeetCode-style method trainer.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLModel, Pydantic, SQLAlchemy |
| Database | PostgreSQL locally on port 5433 |
| Migrations | Alembic plus startup bootstrap for legacy local databases |
| AI | Configurable provider layer, Gemini as the default path |
| TTS | Kokoro-compatible local service plus browser fallback |
| Deployment | Vercel frontend, Cloudflare Tunnel for local backend exposure |
| Tests | Python unittest-style scripts, Node assertion scripts, TypeScript check |

## Architecture

```text
Browser
  |
  | Next.js app on Vercel
  v
Runtime backend resolver
  |
  | Finds the freshest backend URL from Vercel/KV/GitHub runtime state
  v
Cloudflare Tunnel
  |
  v
FastAPI backend on the developer machine
  |
  +-- SQLModel database
  +-- AI generation services
  +-- TTS service
  +-- Review and study scheduling services
```

### Key Design Decisions

- Public frontend, local backend: keeps local data and experiments on the developer machine while still allowing a public demo URL.
- Runtime backend state: the frontend can discover the current tunnel URL without redeploying every time Cloudflare creates a new quick tunnel.
- Safe connection fallback: read-only API calls can recover from stale saved backend URLs by refreshing the global runtime backend state.
- Token plus cookie auth: cookies support same-site local flows, while bearer tokens support cross-domain mobile usage.
- Validated AI writes: generated lessons, questions, topics, and flashcards are checked before being persisted so invalid or partial AI output does not corrupt study state.
- Bootstrap before serving: the backend validates and upgrades legacy database schemas before accepting traffic.

## Repository Layout

```text
english-kids-tutor/
  apps/
    api/                  FastAPI backend
    web/                  Next.js frontend
  content/
    lessons/              Seed lesson JSON
    quizzes/              Seed quiz JSON
    stories/              Story content
    admin-learn/          Admin learning modules
  docs/                   Architecture, setup, deployment notes
  infra/cloudflare/       Cloudflare Tunnel config example
  scripts/                Local automation and test scripts
  docker-compose.yml      Optional containerized services
```

## Running Locally

### Fast Path on Windows

From the repository root:

```powershell
.\start-project.cmd
```

To start backend, frontend, and Cloudflare Tunnel together:

```powershell
.\start-project.cmd -WithTunnel
```

For the deployed Vercel frontend plus local backend flow, use:

```powershell
.\ativar-tudo.cmd
```

That script starts FastAPI, opens a Cloudflare Tunnel, and publishes the current backend URL so the Vercel frontend can find it.
The Windows launchers also ensure the local PostgreSQL container is running before the API starts.

### Backend Manually

```powershell
cd apps/api
python -m pip install -r requirements.txt
python database_bootstrap.py
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Backend health check:

```powershell
Invoke-WebRequest http://127.0.0.1:8001/health
```

### Frontend Manually

```powershell
cd apps/web
pnpm install
pnpm dev
```

Local URLs:

- Frontend: http://localhost:3000
- Backend: http://localhost:8001
- PostgreSQL: `127.0.0.1:5433` (keeps the default `5432` free for other local projects)

### Local PostgreSQL

This project uses a dedicated local PostgreSQL instance on host port `5433`.
That avoids collisions with another PostgreSQL server that may already be
running on the default `5432` port.

```powershell
docker compose up db -d
python scripts/migrate_sqlite_to_postgres.py --postgres-url "postgresql://kids_tutor:kids_tutor_secret@127.0.0.1:5433/kids_tutor"
```

The migration script backs up `apps/api/kids_tutor.sqlite`, migrates from a
working copy, refuses to copy into a non-empty PostgreSQL database by default,
and verifies row counts before reporting success.

## Runtime Backend Connection

The deployed frontend needs a reachable backend URL. There are two supported paths:

1. Automatic: run `.\ativar-tudo.cmd`, which publishes the current tunnel URL.
2. Manual: open `/connect` in the deployed frontend and paste the Cloudflare Tunnel URL.

Example:

```text
https://tutorprofessor.vercel.app/connect
```

The app stores the backend URL per browser and can also read a shared runtime state from the Vercel API. This avoids redeploying the frontend every time a temporary Cloudflare URL changes.

## Environment Variables

### Backend

Create `apps/api/.env` or use the local secret flow documented in `local.secrets.example`.

```env
APP_HOST=0.0.0.0
APP_PORT=8001
DATABASE_URL=postgresql://kids_tutor:kids_tutor_secret@127.0.0.1:5433/kids_tutor
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://tutorprofessor.vercel.app,https://english-tutor-kid.vercel.app
SESSION_SECRET=change-me

GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash

TTS_PROVIDER=kokoro
KOKORO_URL=http://127.0.0.1:8880/v1/audio/speech

PARENT_COOKIE_SECURE=true
PARENT_COOKIE_SAMESITE=none
```

### Frontend

For local development:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

For the deployed flow, the runtime backend route can resolve the tunnel URL dynamically.

## Testing and Verification

Useful checks:

```powershell
cd apps/web
pnpm exec tsc --noEmit
```

```powershell
python scripts/test_language_ai_questions.py
python scripts/test_programming_ai_flashcards.py
python scripts/test_ai_flashcard_service.py
```

```powershell
node apps/web/scripts/test-api-offline-fallback.mjs
node apps/web/scripts/test-runtime-backend-state.mjs
node apps/web/scripts/test-lesson-question-state.mjs
node apps/web/scripts/test-diverse-question-state.mjs
```

The test suite is a mix of service-level tests, API behavior checks, and lightweight frontend state tests. It focuses on high-risk areas: AI output validation, concurrent/stale generation flows, runtime backend selection, and review state consistency.

## Engineering Highlights

- Runtime backend freshness: the app chooses the newest backend state when multiple storage sources disagree.
- Stale tunnel recovery: safe read-only frontend requests can retry against the latest global backend URL.
- Cross-domain auth support: token auth complements cookies for Vercel-to-tunnel and mobile browser scenarios.
- AI validation before persistence: generated batches are checked for count, identity, ownership, and schema before database writes.
- Atomic generation paths: invalid AI output should fail without partial database rows.
- Local database resilience: startup bootstrap handles legacy local schemas before serving requests.
- Child-safe UX states: loading, empty, offline, retry, and recovery states are part of the product flow.

## Trade-offs and Current Limitations

- The backend currently runs locally, so the public demo depends on the developer machine and Cloudflare Tunnel being active.
- Temporary Cloudflare quick tunnels can expire; a named tunnel is the better long-term setup.
- PostgreSQL is the intended local and production database.
- Some tests are script-based rather than a single unified test runner.
- The app has grown beyond the original English-only scope into a broader personal tutor, so naming and documentation are being updated accordingly.

## Suggested Interview Walkthrough

If you are reviewing the project, start here:

1. Open the live frontend and note the local-backend requirement.
2. Read `apps/web/src/lib/api-config.ts` and `apps/web/src/lib/runtime-backend.ts` for runtime backend resolution.
3. Read `apps/api/main.py` around auth, lessons, review, and AI generation routes.
4. Inspect service modules under `apps/api/services/` for validation and domain logic.
5. Run `pnpm exec tsc --noEmit` and one or two scripts under `scripts/` or `apps/web/scripts/`.

## Documentation

- `docs/architecture.md`: broader architecture notes.
- `docs/setup-local.md`: local setup details.
- `docs/cloudflare-tunnel.md`: named tunnel setup.
- `docs/vercel-deploy.md`: Vercel deployment notes.
- `guia.md`: Portuguese guide for running Vercel frontend with local backend.

## License

MIT
