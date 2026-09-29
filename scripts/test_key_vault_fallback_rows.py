"""Stored AI keys survive AI_ENCRYPTION_KEY being set after a stretch without it.

While AI_ENCRYPTION_KEY is unset the vault falls back to SESSION_SECRET but still
writes the v2 prefix. A VPS whose compose file never passed the key to the
container ran exactly like that, with the key sitting unused in .env.prod. Once
the key does arrive, those rows must keep decrypting, must still be flagged as
stale so scripts/reencrypt_ai_keys.py moves them, and the script's proof (a
vault built with a wrong session secret) must fail before the move and pass
after it.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from services.key_vault import KeyVaultError, build_key_vault  # noqa: E402

SESSION_SECRET = "session-secret-of-a-running-deployment"
AI_KEY = "dedicated-ai-encryption-key"
WRONG_SECRET = "deliberately-not-the-old-session-secret"
STORED = "sk-user-own-provider-key-1234"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def vault(ai_key: str | None, old: str | None = None, session_secret: str = SESSION_SECRET):
    for name, value in (("AI_ENCRYPTION_KEY", ai_key), ("AI_ENCRYPTION_KEYS_OLD", old)):
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value
    return build_key_vault(session_secret=session_secret)


def main() -> None:
    # Before: the key never reached the process, so rows are v2 under SESSION_SECRET.
    fallback = vault(ai_key=None)
    fallback_row = fallback.encrypt(STORED)
    require(fallback_row.startswith("v2:"), "fallback rows carry the v2 prefix")

    # After: the key arrives. The old row must still read, with no operator step.
    current = vault(ai_key=AI_KEY)
    require(current.decrypt(fallback_row) == STORED, "a fallback row must still decrypt")
    require(current.is_stale(fallback_row), "a fallback row must be flagged for re-encryption")

    # The re-encrypt script's proof must not be fooled while the row still needs
    # SESSION_SECRET...
    probe = vault(ai_key=AI_KEY, session_secret=WRONG_SECRET)
    try:
        probe.decrypt(fallback_row)
    except KeyVaultError:
        pass
    else:
        raise AssertionError("a row still under SESSION_SECRET must fail the wrong-secret probe")

    # ...and must pass once the row has been moved.
    moved = current.reencrypt_if_stale(fallback_row)
    require(moved is not None and moved != fallback_row, "the stale row must be rewritten")
    require(probe.decrypt(moved) == STORED, "a moved row must not need SESSION_SECRET")
    require(current.reencrypt_if_stale(moved) is None, "a moved row is current")

    # Legacy rows (no prefix, written before the split) are untouched by this.
    legacy_row = fallback.encrypt(STORED)[len("v2:"):]
    require(current.decrypt(legacy_row) == STORED, "legacy rows still decrypt")

    # The separation still holds the other way: SESSION_SECRET alone cannot read
    # a row written under the dedicated key.
    try:
        vault(ai_key=None).decrypt(moved)
    except KeyVaultError:
        pass
    else:
        raise AssertionError("SESSION_SECRET must not decrypt rows under AI_ENCRYPTION_KEY")

    # A rotation window listed explicitly keeps working alongside the fallback.
    rotated = vault(ai_key="next-ai-key", old=AI_KEY)
    require(rotated.decrypt(moved) == STORED, "AI_ENCRYPTION_KEYS_OLD still decrypts")
    require(rotated.decrypt(fallback_row) == STORED, "fallback rows survive a rotation too")

    print("Key vault fallback-row checks passed.")


if __name__ == "__main__":
    main()
