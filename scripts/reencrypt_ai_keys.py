"""Move stored AI API keys off the SESSION_SECRET-derived key, before rotating it.

Keys saved before the key split use the legacy envelope, whose Fernet key is
derived from SESSION_SECRET. Rotating SESSION_SECRET without acting first makes
every one of them permanently unreadable.

This rewrites each row under AI_ENCRYPTION_KEY instead, using the vault's own
`reencrypt_if_stale` — there is no new cryptography here, only a pass over the
rows. Afterwards SESSION_SECRET is no longer load-bearing for stored keys and
can be rotated freely.

Run it against the database that still has the OLD secret in its environment:

    cd apps/api
    DATABASE_URL=postgresql://...           \\
    SESSION_SECRET="<the OLD value>"        \\
    AI_ENCRYPTION_KEY="<the NEW value>"     \\
    APP_ENV=development                     \\
    python ../scripts/reencrypt_ai_keys.py

It ends by proving the work: it rebuilds a vault with a deliberately wrong
session secret and decrypts every row again. If that passes, the old secret is
genuinely no longer needed. Nothing is written unless every row re-encrypts, and
the script is safe to run twice — a row already carrying the current envelope is
reported as "already current" and left alone.

A row can also be unreadable because it was written under a secret nobody has any
more, which makes it dead weight: no rotation can save it, since it is already
lost. Refusing to touch the rest because of it helps nobody, so --skip-unreadable
clears those rows and names them. The account is then simply asked to configure
its key again, which is what it would have to do anyway.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(API_DIR / ".env")

from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from models.database import UserAISettings  # noqa: E402
from services.key_vault import KeyVaultError, build_key_vault  # noqa: E402


WRONG_SECRET = "deliberately-not-the-old-session-secret"


def main_entry() -> int:
    skip_unreadable = "--skip-unreadable" in sys.argv

    if not os.getenv("AI_ENCRYPTION_KEY", "").strip():
        print(
            "AI_ENCRYPTION_KEY is not set. Without it this would re-encrypt the rows "
            "under the very secret you are trying to stop depending on.",
            file=sys.stderr,
        )
        return 2

    vault = main.key_vault
    upgraded = 0
    already_current = 0
    empty = 0
    unreadable: list[int] = []

    with Session(main.engine) as session:
        records = list(session.exec(select(UserAISettings)).all())
        for record in records:
            if not record.api_key_encrypted:
                empty += 1
                continue
            try:
                rewritten = vault.reencrypt_if_stale(record.api_key_encrypted)
            except KeyVaultError as exc:
                if not skip_unreadable:
                    print(
                        f"Row {record.id} (user {record.user_id}) could not be read: {exc}\n"
                        "Nothing was written. Check that SESSION_SECRET is the OLD value, "
                        "or re-run with --skip-unreadable to clear rows nobody can decrypt.",
                        file=sys.stderr,
                    )
                    return 1
                # Already lost whatever we do: no rotation can recover a row
                # written under a secret nobody has. Clearing it turns an
                # undecryptable blob into an honest "no key configured".
                unreadable.append(record.user_id)
                record.api_key_encrypted = ""
                session.add(record)
                continue
            if rewritten is None:
                already_current += 1
                continue
            record.api_key_encrypted = rewritten
            session.add(record)
            upgraded += 1
        session.commit()

    print(
        f"{len(records)} stored key rows: {upgraded} re-encrypted, "
        f"{already_current} already current, {empty} empty, "
        f"{len(unreadable)} cleared as unreadable."
    )
    if unreadable:
        print(
            "These accounts must configure their AI key again: "
            + ", ".join(str(user_id) for user_id in unreadable)
        )

    # The proof. A vault that cannot possibly know the old secret must still be
    # able to read every row; otherwise something is still tied to it.
    probe = build_key_vault(session_secret=WRONG_SECRET)
    with Session(main.engine) as session:
        for record in session.exec(select(UserAISettings)).all():
            if not record.api_key_encrypted:
                continue
            try:
                probe.decrypt(record.api_key_encrypted)
            except KeyVaultError:
                print(
                    f"Row {record.id} still needs SESSION_SECRET to be read. "
                    "Do NOT rotate SESSION_SECRET yet.",
                    file=sys.stderr,
                )
                return 1

    print("Verified: no stored AI key depends on SESSION_SECRET any more.")
    print("SESSION_SECRET can now be rotated. Remember that doing so signs everyone out.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_entry())
