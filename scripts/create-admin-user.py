"""Create (or repair) the administrator account that approves new signups.

Thin wrapper around apps/api/admin_bootstrap.py, which holds the real work so it
also ships inside the Docker image.

Usage (from the repository root, with the backend virtualenv active):

    python scripts/create-admin-user.py
    python scripts/create-admin-user.py --email admin@seudominio.com --password "sua-senha"

Without --password the script asks for it without echoing to the terminal.
"""
from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"

sys.path.insert(0, str(API_DIR))

from admin_bootstrap import run  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(run())
