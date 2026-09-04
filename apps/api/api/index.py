"""Vercel entrypoint.

Vercel puts the deployment root on sys.path, not this file's directory. But
main.py imports its siblings flatly — `from database_bootstrap import ...`,
`from services.key_vault import ...` — which assumes apps/api itself is on the
path, the way uvicorn gives it when run from that directory and the way the test
scripts arrange it explicitly. Hence the insert below; without it every one of
those imports fails at cold start.

Nothing else belongs here. Routes, middleware and the engine are main.py's job.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app  # noqa: E402

__all__ = ["app"]
