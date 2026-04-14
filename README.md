# English Kids Tutor

## Overview

English Kids Tutor is a full-stack monorepo project designed to provide a simple, beautiful, and safe English learning experience for children through a web browser. The system features a Next.js frontend for an interactive user interface, a FastAPI backend for business logic and data management, and integrates with Kokoro for local text-to-speech capabilities. It's built with a focus on ease of local development, deployment to Vercel for the frontend, and Cloudflare Tunnel for securely exposing the local backend.

## Features

*   **Interactive Lessons:** Daily lessons with new vocabulary, phrases, and mini-activities.
*   **Spaced Repetition Review:** Intelligent review system to reinforce learning.
*   **Progress Tracking:** Monitor learned words, completed themes, and daily streaks.
*   **Parental Area:** Simple login for parents to manage child profiles and settings.
*   **Kokoro TTS Integration:** Local text-to-speech for natural audio pronunciation.
*   **Responsive Design:** Optimized for both mobile and desktop devices.
*   **Modular Architecture:** Clean and organized monorepo structure for scalability.
*   **Docker Support:** Optional Docker setup for easy environment management.
*   **Comprehensive Documentation:** Detailed guides for setup, deployment, and usage.

## Architecture

The project follows a monorepo structure, organizing the frontend, backend, and shared components within a single repository. This approach facilitates code sharing, consistent tooling, and streamlined development workflows.

### Folder Structure

```
english-kids-tutor/
  apps/
    web/              # Next.js frontend application
    api/              # FastAPI backend application
  packages/
    shared/           # Shared utilities, types, or components (currently empty, ready for expansion)
  content/
    lessons/          # JSON files for lesson content
    quizzes/          # JSON files for quiz content
    stories/          # Markdown files for short stories
  infra/
    docker/           # Docker-related files (e.g., Dockerfiles)
    cloudflare/       # Cloudflare Tunnel configuration examples
  docs/               # Project documentation files
  scripts/            # Utility scripts for development and operations
  .gitignore          # Git ignore file
  README.md           # This README file
  docker-compose.yml  # Docker Compose configuration
```

*   **`apps/web/`**: Contains the Next.js frontend application. This is where all the user-facing components, pages, and client-side logic reside.
*   **`apps/api/`**: Houses the FastAPI backend application. It includes API routes, database models, business logic, and integration with external services like Kokoro TTS.
*   **`packages/shared/`**: Intended for shared code, such as TypeScript types, utility functions, or UI components that could be used by both `web` and `api` applications. Currently empty but ready for future use.
*   **`content/`**: Stores all the educational content for the tutor, organized into `lessons`, `quizzes`, and `stories` in JSON or Markdown format.
*   **`infra/`**: Contains infrastructure-related configurations, including Docker setups and Cloudflare Tunnel examples.
*   **`docs/`**: Dedicated directory for detailed documentation files, covering various aspects of the project.
*   **`scripts/`**: A collection of helpful scripts to automate common development and operational tasks.
*   **`.gitignore`**: Specifies intentionally untracked files that Git should ignore.
*   **`README.md`**: The main project overview and guide.
*   **`docker-compose.yml`**: Defines and runs multi-container Docker applications.

## Getting Started

Follow these steps to set up and run the English Kids Tutor project locally.

### Prerequisites

*   Node.js (v18 or higher) and npm/pnpm (for frontend)
*   Python (3.11 or higher) and pip (for backend)
*   Docker and Docker Compose (optional, for containerized setup)
*   Git

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/english-kids-tutor.git
cd english-kids-tutor
```

### 2. Backend Setup (`apps/api`)

Navigate to the backend directory:

```bash
cd apps/api
```

#### Install Dependencies

```bash
pip install -r requirements.txt
```

#### Environment Configuration

Create a `.env` file by copying `.env.example` and fill in the necessary values. For local development, the defaults should be sufficient.

```bash
cp .env.example .env
```

**Example `.env` for Backend:**

```
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8001
DATABASE_URL=sqlite:///./kids_tutor.sqlite
PARENT_PASSWORD=tutor123
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://english-kids-tutor.vercel.app
TTS_PROVIDER=kokoro
KOKORO_DEFAULT_VOICE=af_heart
AUDIO_CACHE_DIR=./audio_cache
SESSION_SECRET=your-super-secret-session-key
```

#### Initialize Database and Content

From the project root, run the database initialization script:

```bash
python scripts/init_db.py
```

This will create the `kids_tutor.sqlite` database and populate it with initial lesson content.

#### Run the Backend

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

The backend API will be available at `http://localhost:8001`.

### 3. Frontend Setup (`apps/web`)

Navigate to the frontend directory:

```bash
cd ../web
```

#### Install Dependencies

```bash
pnpm install
```

#### Environment Configuration

Create a `.env.local` file by copying `.env.example`.

```bash
cp .env.example .env.local
```

**Example `.env.local` for Frontend:**

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

#### Run the Frontend

```bash
pnpm dev
```

The frontend application will be available at `http://localhost:3000`.

### 4. Kokoro TTS Setup

Kokoro TTS is used for local text-to-speech generation. You'll need to set up a Kokoro server separately. Refer to the `docs/kokoro-setup.md` for detailed instructions on how to install and run Kokoro TTS.

By default, the backend expects Kokoro to be running at `http://localhost:8888`. You can configure this via the `KOKORO_URL` environment variable in the backend's `.env` file.

### 5. Cloudflare Tunnel Configuration

To expose your local backend to the internet securely, you can use Cloudflare Tunnel. This is particularly useful for connecting your Vercel-deployed frontend to your local backend.

Refer to `docs/cloudflare-tunnel.md` for detailed instructions and an example `config.yml` for `cloudflared`.

**Expected Flow:**

*   Frontend deployed on Vercel calls `https://api.yourdomain.com`.
*   Cloudflare Tunnel forwards this request to your local backend running at `http://localhost:8001`.

Ensure your frontend's `NEXT_PUBLIC_API_BASE_URL` environment variable is set to your public Cloudflare Tunnel URL (e.g., `https://api.yourdomain.com`) when deploying to Vercel.

### 6. Dockerized Setup (Optional)

For a fully containerized development environment, you can use Docker Compose. Make sure you have Docker and Docker Compose installed.

From the project root directory:

```bash
docker-compose up --build
```

This will build and start both the frontend and backend services. You can access the frontend at `http://localhost:3000` and the backend at `http://localhost:8001`.

**Note:** The `docker-compose.yml` includes commented-out sections for `kokoro-tts` and `cloudflared`. Uncomment and configure them if you wish to run these services within Docker Compose.

## Deployment

### Frontend to Vercel

The Next.js frontend is prepared for deployment on Vercel. Follow these steps:

1.  **Create a new Vercel project:** Connect your GitHub repository to Vercel.
2.  **Configure Root Directory:** Set the root directory for the project to `apps/web`.
3.  **Environment Variables:** Add `NEXT_PUBLIC_API_BASE_URL` to your Vercel project's environment variables, pointing to your public backend API URL (e.g., your Cloudflare Tunnel URL).
4.  **Deploy:** Vercel will automatically build and deploy your frontend.

Refer to `docs/vercel-deploy.md` for more detailed instructions.

## Roadmap

*   Implement a more robust authentication system for parents (e.g., OAuth).
*   Integrate a real LLM for the tutor's chat functionality.
*   Expand lesson content, quizzes, and stories.
*   Add user-specific progress tracking and personalization.
*   Implement a more sophisticated spaced repetition algorithm.
*   Support multiple child profiles.

## Contributing

Contributions are welcome! Please refer to our `CONTRIBUTING.md` (to be created) for guidelines.

## License

This project is licensed under the MIT License - see the `LICENSE` file (to be created) for details.

---

**Manus AI**

*This project was generated by Manus AI based on your specifications.*
#   e n g l i s h - t u t o r - k i d  
 