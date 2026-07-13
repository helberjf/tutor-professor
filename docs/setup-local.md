# Local Development Setup

This document provides detailed instructions on how to set up and run the Tutor and Professor project on your local machine for development purposes.

## Prerequisites

Before you begin, ensure you have the following software installed:

*   **Git**: For cloning the repository.
    *   [Download Git](https://git-scm.com/downloads)
*   **Node.js & npm/pnpm**: For the Next.js frontend.
    *   Node.js version 18 or higher is recommended.
    *   [Download Node.js](https://nodejs.org/en/download/)
    *   Install pnpm globally: `npm install -g pnpm`
*   **Python**: For the FastAPI backend.
    *   Python version 3.11 or higher is required.
    *   [Download Python](https://www.python.org/downloads/)
*   **Poetry (Optional but Recommended)**: For Python dependency management.
    *   [Install Poetry](https://python-poetry.org/docs/#installation)
*   **Docker & Docker Compose (Optional)**: For running the project in containers.
    *   [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

## Step-by-Step Setup

### 1. Clone the Repository

Open your terminal or command prompt and clone the project repository:

```bash
git clone https://github.com/your-username/english-kids-tutor.git
cd english-kids-tutor
```

### 2. Backend Setup (`apps/api`)

Navigate into the backend application directory:

```bash
cd apps/api
```

#### Install Python Dependencies

It's recommended to use a virtual environment for Python projects. If you have Poetry installed, you can use it:

```bash
poetry install
poetry shell
```

Alternatively, using `pip`:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
```

#### Environment Variables

Create a `.env` file in the `apps/api` directory by copying the provided example:

```bash
cp .env.example .env
```

Open the newly created `.env` file and adjust the variables as needed. For local development, the default values are usually sufficient.

```ini
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8001
DATABASE_URL=sqlite:///./kids_tutor.sqlite
PARENT_PASSWORD=tutor123
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://tutorprofessor.vercel.app,https://english-tutor-kid.vercel.app
TTS_PROVIDER=kokoro
KOKORO_DEFAULT_VOICE=af_bella
AUDIO_CACHE_DIR=./audio_cache
SESSION_SECRET=your-super-secret-session-key
```

#### Initialize the Database and Seed Content

From the project root directory (go up one level from `apps/api`):

```bash
cd ..
python scripts/init_db.py
```

This script will:

*   Create the SQLite database file (`kids_tutor.sqlite`) in `apps/api/`.
*   Set up the necessary database tables.
*   Populate the database with initial child profile and lesson content from `content/lessons/`.

#### Run the Backend Server

From the `apps/api` directory, start the FastAPI server:

```bash
python database_bootstrap.py
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

The bootstrap is safe to run repeatedly. It verifies any unversioned legacy schema
before stamping it and applies all pending Alembic migrations before the API starts.

The backend API will be accessible at `http://localhost:8001`.

### 3. Frontend Setup (`apps/web`)

Open a new terminal window or tab and navigate into the frontend application directory:

```bash
cd english-kids-tutor/apps/web
```

#### Install Node.js Dependencies

```bash
pnpm install
```

#### Environment Variables

Create a `.env.local` file in the `apps/web` directory by copying the example:

```bash
cp .env.example .env.local
```

Ensure `NEXT_PUBLIC_API_BASE_URL` points to your local backend. If you're running the backend on `http://localhost:8001`, no changes are needed.

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

#### Run the Frontend Development Server

```bash
pnpm dev
```

The Next.js development server will start, and you can access the frontend application in your browser at `http://localhost:3000`.

### 4. Running with Docker (Optional)

If you prefer to run the entire project using Docker, navigate to the project root directory (`english-kids-tutor/`) and execute:

```bash
docker-compose up --build
```

This command will:

*   Build Docker images for both the `api` and `web` services.
*   Start the containers.
*   The frontend will be available at `http://localhost:3000`.
*   The backend will be available at `http://localhost:8001`.

**Note:** The `docker-compose.yml` includes commented-out sections for `kokoro-tts` and `cloudflared`. If you wish to integrate these services within your Docker Compose setup, uncomment and configure them according to their respective documentation.

## Next Steps

*   **Kokoro TTS**: For full audio functionality, set up the Kokoro TTS server as described in `docs/kokoro-setup.md`.
*   **Cloudflare Tunnel**: If you plan to connect a deployed frontend to your local backend, configure Cloudflare Tunnel as detailed in `docs/cloudflare-tunnel.md`.
