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

- Account registration and login. `SIGNUP_MODE=manual` (the default) holds a new account in the administrator's queue; `SIGNUP_MODE=open` lets a verified e-mail address in on its own.
- E-mail verification, forgotten-password reset, password change and sign-out-everywhere, all self-service. Both e-mail flows answer identically for an address that exists and one that does not, so they cannot be used to find out who has an account.
- Optional modules per account: the programming curriculum, flashcard decks and LeetCode trainer ship switched off and are turned on in the parents area. The gate is one middleware over route families rather than a check repeated in thirty endpoints.
- Data rights without asking anybody: `GET /api/account/export` downloads everything stored about the account, `POST /api/account/delete` erases it.
- Password policy enforced on both sides: the signup form shows a live strength meter and requirement checklist, and `services/password_policy.py` applies the same rules on the API, so a direct HTTP call cannot skip them.
- Login has a brute-force brake: after `MAX_FAILED_LOGINS` wrong passwords the account is locked for `LOGIN_LOCK_MINUTES` and answers 429 with `Retry-After`. The lock clears itself, and a successful login resets the counter.
- Passwords are stored as PBKDF2-HMAC-SHA256 with 260,000 iterations and a per-password random salt.
- Parent dashboard for children, progress, settings, and AI provider configuration.
- Child profile management, including target language and audio preferences.
- AI-powered lesson, question, book, and flashcard generation.

### Admin Area

- Admin dashboard at `/admin` with counters for the approval queue, approved accounts, recent signups, and AI authorizations.
- Account approval at `/admin/accounts`: every signup waits in a queue and only reaches the app once approved. Rejecting an account drops its open sessions immediately, and a rejection can be reversed later.
- AI access is a second, independent switch: approving an account grants no AI, and revoking AI leaves the account working. Both are set from the same queue card.
- AI credits meter the administrator's own key at one credit per successful generation. A call the provider never answered is free, and an account using its own API key is never metered. Accounts can be topped up, zeroed, or marked unlimited.
- Per-account AI authorization at `/admin/users`, plus the internal learning content editor at `/admin/learn`.

### Plans and Billing

- Plans live in `apps/api/services/billing_service.py` rather than in a table: a price changes through a reviewable deploy, not a row edited in production. An account with no subscription row is on the free plan, so signup creates nothing and the app runs with billing switched off.
- One `Entitlement` decides everything: how many children a plan allows, and how much AI it includes. The AI allowance is credited into the balance the administrator already controlled, so there is one meter instead of two competing ones, and hand-granted credits are never taken away.
- A 14-day trial needs no payment gateway at all. Paying does, and says so plainly rather than pretending to have taken the money.
- `past_due` keeps working: a card that failed this morning should not take a child's lesson away before the gateway has finished retrying.
- `POST /api/billing/webhook` verifies an HMAC signature over the raw body and ignores repeated deliveries by event id — the retry every gateway sends must not extend a period twice.
- Every generation writes a usage line with an estimated cost in millionths of a currency unit, so "what did this account cost this month" has an answer. See `docs/saas-operacao.md`.

### Installable App (PWA)

- Installable on phone, tablet and desktop: web app manifest, maskable icons, and an `apple-touch-icon` so iPhone and iPad get the real icon instead of a page thumbnail.
- Opens without browser chrome (`display: standalone`), with both the standardised and the legacy `apple-mobile-web-app-capable` meta so iOS before 17 also goes full screen.
- A small service worker caches the app shell and immutable `/_next/static/` assets, and shows `public/offline.html` when a navigation fails with no network. It never touches the backend or any `/api/` route, so the runtime backend URL is always read fresh.
- Icons are generated from the app's own brand mark: `python scripts/generate-pwa-icons.py`.

**Installing it**

- iPhone / iPad: open the site in Safari (it must be Safari), tap Share, then "Adicionar a Tela de Início".
- Android / Chrome: the browser offers "Instalar app", or use the menu's "Adicionar à tela inicial".
- Desktop Chrome / Edge: the install icon appears at the right of the address bar.

Installation needs HTTPS, which the Vercel deployment already provides.

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
      content/            Seed content, inside the deployable unit
        lessons/          Seed lesson JSON
        quizzes/          Seed quiz JSON
        stories/          Story content
        admin-learn/      Admin learning modules
    web/                  Next.js frontend
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
GEMINI_MODEL=gemini-3.1-flash-lite

TTS_PROVIDER=kokoro
KOKORO_URL=http://127.0.0.1:8880/v1/audio/speech

PARENT_COOKIE_SECURE=true
PARENT_COOKIE_SAMESITE=none

# The single administrator: the account with this e-mail owns /admin and never
# waits in its own approval queue. ADMIN_PASSWORD_HASH is an optional recovery
# password so the administrator can sign in even if the stored one is lost.
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD_HASH=

# Brute-force brake on login. Defaults shown; the lock clears itself.
MAX_FAILED_LOGINS=5
LOGIN_LOCK_MINUTES=15
```

### Creating the Administrator Account

`ADMIN_EMAIL` names the administrator, but the account itself still has to exist
in the database. Create it (or reset its password) with:

```bash
python scripts/create-admin-user.py --email admin@yourdomain.com
```

The script prints the `ADMIN_PASSWORD_HASH` line to store in the environment.
Then sign in at `/login` with that e-mail and open `/admin`.

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
python scripts/test_admin_account_approval.py
python scripts/test_ai_credits.py
python scripts/test_password_security.py
python scripts/test_tenant_isolation.py
python scripts/test_account_modules.py
python scripts/test_account_self_service.py
python scripts/test_billing_and_usage.py
```

`test_tenant_isolation.py` is the one to run after touching any route. Besides
driving two accounts against each other over HTTP, it audits every registered
route: a data route that does not resolve its tenant through a known helper, or
an `/api/admin` route that never reaches an admin check, turns it red. Adding an
endpoint that answers with whatever id it was handed fails the build instead of
shipping quietly.

```powershell
node apps/web/scripts/test-api-offline-fallback.mjs
node apps/web/scripts/test-pwa-manifest-and-sw.mjs
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

- The backend currently runs locally, so the public demo depends on the developer machine and Cloudflare Tunnel being active. `docs/DEPLOY-VPS.md` is the way off that.
- Temporary Cloudflare quick tunnels can expire; a named tunnel is the better long-term setup.
- PostgreSQL is the intended local and production database.
- Some tests are script-based rather than a single unified test runner.
- No payment gateway is wired in. Plans, limits, trials, usage and the webhook all work; what is missing is the checkout call in `start_checkout` and the credentials.
- Rate limiting counts in process memory, so the effective ceiling multiplies by the number of uvicorn workers. Fine for one worker, which is the current deployment; move it to a shared store before scaling out.
- The per-generation AI cost is an estimate until the provider layer reports token counts.
- `apps/api/main.py` is one large module. The route audit in `scripts/test_tenant_isolation.py` keeps the security properties honest, but splitting it into routers is still owed.
- The app has grown beyond the original English-only scope into a broader personal tutor, so naming and documentation are being updated accordingly.

## Suggested Interview Walkthrough

If you are reviewing the project, start here:

1. Open the live frontend and note the local-backend requirement.
2. Read `apps/web/src/lib/api-config.ts` and `apps/web/src/lib/runtime-backend.ts` for runtime backend resolution.
3. Read `apps/api/main.py` around auth, lessons, review, and AI generation routes.
4. Inspect service modules under `apps/api/services/` for validation and domain logic.
5. Run `pnpm exec tsc --noEmit` and one or two scripts under `scripts/` or `apps/web/scripts/`.

## Documentation

- `TODO-SAAS.md`: what is done and what is left to run this as a product.
- `docs/deploy-vercel-supabase.md`: hosting the database on Supabase and the API on Vercel, and what changes when the request has a time limit.
- `docs/saas-operacao.md`: operating it for other people — configuration, plans, cost per account, logs, backups, data rights.
- `docs/privacidade.md` and `docs/termos.md`: privacy policy and terms drafts, written from what the software actually does and awaiting legal review.
- `docs/architecture.md`: broader architecture notes.
- `docs/setup-local.md`: local setup details.
- `docs/cloudflare-tunnel.md`: named tunnel setup.
- `docs/vercel-deploy.md`: Vercel deployment notes.
- `guia.md`: Portuguese guide for running Vercel frontend with local backend.

## License

MIT
