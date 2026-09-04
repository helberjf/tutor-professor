"""The API must refuse to boot with a placeholder SESSION_SECRET.

SESSION_SECRET hashes session tokens and derives the Fernet key that encrypts
every user's AI API key. If a deployment ever runs with the value that ships in
the source, sessions are forgeable and stored keys are decryptable by anyone who
can read the repository. Local SQLite development must still work with no setup.

Each case boots the real module in a subprocess so the actual import-time path is
exercised, not a reimplementation of it.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"

# The test owns the complete environment for each subprocess. Prevent an
# ignored local apps/api/.env (often production-shaped) from filling values the
# case intentionally leaves absent.
BOOT = (
    "import dotenv; "
    "dotenv.load_dotenv = lambda *args, **kwargs: False; "
    "import main; print('BOOTED', main.SESSION_SECRET)"
)

POSTGRES_URL = "postgresql://user:pass@db:5432/app"
SQLITE_URL = "sqlite:///./local.sqlite"


def boot(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    import os

    child_env = {**os.environ, **env}
    # Ensure the parent's own values never leak into a case that omits them.
    for key in ("SESSION_SECRET", "APP_ENV"):
        if key not in env:
            child_env.pop(key, None)
    return subprocess.run(
        [sys.executable, "-c", BOOT],
        cwd=API_DIR,
        env=child_env,
        capture_output=True,
        text=True,
        timeout=180,
    )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    # 1. Local SQLite development boots with no configuration at all.
    result = boot({"DATABASE_URL": SQLITE_URL})
    require(result.returncode == 0, f"local sqlite dev must boot: {result.stderr[-600:]}")
    require("BOOTED" in result.stdout, "local sqlite dev must reach startup")
    require(
        "insecure development default" in result.stderr,
        "falling back to the dev secret must warn loudly",
    )

    # 2. A real database with no secret must refuse to start.
    result = boot({"DATABASE_URL": POSTGRES_URL})
    require(result.returncode != 0, "postgres without SESSION_SECRET must not boot")
    require("SESSION_SECRET" in result.stderr, "the failure must name SESSION_SECRET")

    # 3. The placeholder shipped in .env.example must be rejected too — copying the
    #    example file into production is the likeliest way to get here.
    result = boot(
        {"DATABASE_URL": POSTGRES_URL, "SESSION_SECRET": "your-super-secret-session-key"}
    )
    require(result.returncode != 0, "the .env.example placeholder must not boot")

    # 4. An explicit development override stays usable even against postgres.
    result = boot(
        {"DATABASE_URL": POSTGRES_URL, "APP_ENV": "development", "SESSION_SECRET": ""}
    )
    require(result.returncode == 0, f"APP_ENV=development must bypass: {result.stderr[-600:]}")

    # 5. A real secret boots and is the value actually used.
    secret = "PjQ2-a-real-unique-session-secret-value"
    result = boot({"DATABASE_URL": POSTGRES_URL, "SESSION_SECRET": secret})
    require(result.returncode == 0, f"a real secret must boot: {result.stderr[-600:]}")
    require(secret in result.stdout, "the configured secret must be the one in use")

    print("Session secret guard checks passed.")


if __name__ == "__main__":
    main()
