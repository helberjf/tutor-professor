# English Kids Tutor

A monorepo with a **Next.js** frontend and a **FastAPI** backend for short English lessons for kids — featuring quizzes, spaced-repetition review, guided chat and audio.

**Live demo:** https://english-tutor-kid.vercel.app

## Tech stack

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Backend:** FastAPI, SQLModel, SQLite, Pydantic
- **Audio:** local Kokoro TTS with fallback
- **AI:** Google Gemini (lesson generation)
- **Infra:** Vercel (frontend) + Cloudflare Tunnel (to expose the local backend)

## Features

- Lesson of the day with a mini-activity
- Quiz with scoring and kid-friendly feedback
- Review of hard words saved in the database (spaced repetition)
- Simple guided chat with a tutor system prompt
- Parents area with basic settings
- Parents area can generate new lessons via Gemini
- Friendly loading / empty / backend-offline states

## Project structure

```
english-kids-tutor/
  apps/
    api/      # FastAPI backend
    web/      # Next.js frontend
  content/
    lessons/  # lesson content
    quizzes/  # quiz content
    stories/  # stories
  docs/                 # additional documentation
  infra/cloudflare/     # tunnel config example
  scripts/init_db.py    # initial DB seed
```

## Running locally

### 1. Backend

```bash
# create the env file
cp apps/api/.env.example apps/api/.env
# install dependencies
python -m pip install -r apps/api/requirements.txt
# initialize the database
python scripts/init_db.py
# run the API
cd apps/api
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 2. Frontend

```bash
cp apps/web/.env.example apps/web/.env.local
cd apps/web
pnpm install
pnpm dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8001

### Windows shortcut

Run the whole project with a single command:

```
.\start-project.cmd          # starts backend + frontend
.\start-project.cmd -WithTunnel   # also opens the backend tunnel
```

The tunnel runner first tries a named Cloudflare tunnel (via env vars `CLOUDFLARE_TUNNEL_NAME`, `CLOUDFLARE_TUNNEL_ID`, optional `CLOUDFLARE_TUNNEL_CREDENTIALS_FILE`) and falls back to a temporary quick tunnel.

## Key environment variables

**Backend (`apps/api/.env`)**

```
APP_HOST=0.0.0.0
APP_PORT=8001
DATABASE_URL=sqlite:///./kids_tutor.sqlite
PARENT_PASSWORD=tutor123
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-project.vercel.app
TTS_PROVIDER=kokoro
KOKORO_URL=http://127.0.0.1:8880/v1/audio/speech
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
SESSION_SECRET=change-me
PARENT_COOKIE_SECURE=true
PARENT_COOKIE_SAMESITE=none
```

**Frontend (`apps/web/.env.local`)**

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

## Recommended deploy flow (Vercel frontend + local backend)

1. Run the API locally.
2. Expose it: `cloudflared tunnel --url http://localhost:8001`.
3. Open `https://your-project.vercel.app/connect` on the device that will use the app.
4. Paste the current HTTPS tunnel URL and save the connection.
5. Set `CORS_ALLOWED_ORIGINS` on the backend to the exact frontend URL.
6. For the parents area across domains, use HTTPS on the public backend and `PARENT_COOKIE_SECURE=true` / `PARENT_COOKIE_SAMESITE=none`.

> The published frontend can store the current API URL per browser at `/connect`, so you don't need to redeploy when the tunnel URL changes.

## Notes

- The backend uses a local SQLite database at `apps/api/kids_tutor.sqlite`.
- The frontend uses `fetch` with `credentials: include`, so CORS and cookies must be configured when frontend and backend are on different domains.
- In the parents area, **Generate More Phrases** calls Gemini, creates the next day with 3 phrases and saves the new lesson directly to the database.
- If Kokoro is not running, the app keeps working with an audio fallback.

## License

MIT
