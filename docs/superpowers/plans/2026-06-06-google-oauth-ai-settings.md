# Google OAuth and User AI Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google login and require each authenticated user to configure their own AI provider/API key before generating lessons or books.

**Architecture:** Keep the existing FastAPI cookie session model. Add Google OAuth authorization-code endpoints in the backend, a per-user encrypted AI settings table, provider-aware generation services, and frontend controls for Google login plus AI settings. Gemini remains the default provider and model.

**Tech Stack:** FastAPI, SQLModel, SQLite, requests, cryptography/Fernet-compatible encryption via the installed cryptography dependency, Next.js App Router, TypeScript.

---

### Task 1: Backend Models And Schemas

**Files:**
- Modify: `apps/api/models/database.py`
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Test: `scripts/test_api_routes.py`

- [ ] Add failing smoke-test assertions for `/api/ai/providers`, `/api/ai/settings`, and missing AI settings blocking generation.
- [ ] Add `UserAISettings` with `user_id`, `provider`, encrypted key, `model`, optional `base_url`, timestamps.
- [ ] Add user OAuth columns: `google_sub`, `auth_provider`.
- [ ] Add schemas for provider metadata, masked AI settings, and AI settings update payload.
- [ ] Add startup migrations for new columns.

### Task 2: Google OAuth Flow

**Files:**
- Modify: `apps/api/main.py`
- Modify: `apps/api/.env.example`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Test: `scripts/test_api_routes.py`

- [ ] Add failing smoke-test for a mocked Google callback creating a user and session.
- [ ] Add `/api/auth/google/start` that sets an OAuth state cookie and redirects to Google.
- [ ] Add `/api/auth/google/callback` that validates state, exchanges code for token, fetches userinfo, creates or links user, creates session cookie, and redirects to the frontend.
- [ ] Add login/register UI links that send the browser to the backend Google start endpoint.

### Task 3: Per-User AI Settings

**Files:**
- Modify: `apps/api/main.py`
- Modify: `apps/api/services/phrase_generator_service.py`
- Modify: `apps/api/services/book_service.py`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/register/page.tsx`
- Modify: `apps/web/src/app/parents/page.tsx`
- Test: `scripts/test_api_routes.py`

- [ ] Add failing smoke-test that saving settings masks the key and then allows generation setup checks.
- [ ] Add provider catalog for Gemini, OpenAI, Anthropic, OpenRouter, Groq, and Mistral.
- [ ] Encrypt stored API keys with a key derived from `SESSION_SECRET`.
- [ ] Update generation code to read the logged-in user's AI settings; block generation if missing.
- [ ] Add register form fields and parent settings UI for provider/key/model.

### Task 4: Verification And Publish Safety

**Files:**
- Test: `scripts/test_api_routes.py`
- Test: `apps/web`

- [ ] Run `python scripts\test_api_routes.py`.
- [ ] Run `python -m compileall apps\api`.
- [ ] Run `pnpm exec tsc --noEmit` in `apps/web`.
- [ ] Run `pnpm build` in `apps/web`.
- [ ] Run secret scan for Google key patterns before commit.
