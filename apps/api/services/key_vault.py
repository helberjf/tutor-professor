"""Encryption envelope for the AI API keys stored per account.

The first version of this derived the Fernet key straight from SESSION_SECRET.
That tied two unrelated lifetimes together: SESSION_SECRET signs session tokens
and should be rotatable at any sign of trouble, while the key that encrypts a
stored API key can never change without making every stored key unreadable.
Rotating one meant destroying the other.

So the two are separated here, and the ciphertext carries a version prefix:

    v2:<fernet token>   encrypted with AI_ENCRYPTION_KEY (or a previous one)
    <fernet token>      legacy, encrypted with the SESSION_SECRET-derived key

Old rows keep decrypting untouched; anything written from now on is v2. Set
AI_ENCRYPTION_KEYS_OLD (comma-separated) while rotating: the new key encrypts,
every listed key still decrypts, and `reencrypt_if_stale` upgrades a row the
next time it is read.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Iterable

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

logger = logging.getLogger(__name__)

CURRENT_VERSION = "v2"
_VERSION_SEPARATOR = ":"


class KeyVaultError(RuntimeError):
    """Raised when a stored key cannot be read with any configured key."""


def derive_fernet_key(secret: str) -> bytes:
    """Turn any passphrase into the 32-byte urlsafe-base64 key Fernet wants."""

    return base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())


class KeyVault:
    def __init__(
        self,
        *,
        primary_secret: str,
        previous_secrets: Iterable[str] = (),
        legacy_secret: str | None = None,
    ) -> None:
        if not primary_secret:
            raise ValueError("primary_secret is required")
        self._primary = Fernet(derive_fernet_key(primary_secret))
        # MultiFernet decrypts with any key it holds and encrypts with the first,
        # which is exactly the shape of a rotation window.
        current_ring = [self._primary] + [
            Fernet(derive_fernet_key(secret)) for secret in previous_secrets if secret
        ]
        self._current = MultiFernet(current_ring)
        self._legacy = (
            Fernet(derive_fernet_key(legacy_secret)) if legacy_secret else None
        )

    def encrypt(self, plaintext: str) -> str:
        token = self._primary.encrypt(plaintext.encode()).decode()
        return f"{CURRENT_VERSION}{_VERSION_SEPARATOR}{token}"

    def decrypt(self, stored: str) -> str:
        if not stored:
            return ""
        version, token = self._split(stored)
        if version == CURRENT_VERSION:
            try:
                return self._current.decrypt(token.encode()).decode()
            except InvalidToken as exc:
                raise KeyVaultError(
                    "Stored AI key could not be decrypted with AI_ENCRYPTION_KEY "
                    "or any key in AI_ENCRYPTION_KEYS_OLD."
                ) from exc
        # No prefix: written before the split, so it belongs to the legacy key.
        if self._legacy is None:
            raise KeyVaultError("A legacy-encrypted AI key needs SESSION_SECRET to read.")
        try:
            return self._legacy.decrypt(token.encode()).decode()
        except InvalidToken as exc:
            raise KeyVaultError(
                "Stored AI key could not be decrypted with the legacy SESSION_SECRET key."
            ) from exc

    def is_stale(self, stored: str) -> bool:
        """True when the row would be written differently today."""

        if not stored:
            return False
        version, token = self._split(stored)
        if version != CURRENT_VERSION:
            return True
        # A v2 row encrypted with a rotated-out key still decrypts, but should be
        # rewritten with the current one.
        try:
            self._primary.decrypt(token.encode())
        except InvalidToken:
            return True
        return False

    def reencrypt_if_stale(self, stored: str) -> str | None:
        """Return the row rewritten under the current key, or None if fresh."""

        if not self.is_stale(stored):
            return None
        return self.encrypt(self.decrypt(stored))

    @staticmethod
    def _split(stored: str) -> tuple[str, str]:
        prefix, separator, rest = stored.partition(_VERSION_SEPARATOR)
        if separator and prefix == CURRENT_VERSION:
            return prefix, rest
        return "", stored


def build_key_vault(*, session_secret: str) -> KeyVault:
    """Assemble the vault from the environment.

    Falls back to SESSION_SECRET when AI_ENCRYPTION_KEY is unset so an existing
    deployment keeps working after an upgrade; the warning is the nudge to set
    the dedicated key.
    """

    primary = os.getenv("AI_ENCRYPTION_KEY", "").strip()
    previous = [
        item.strip()
        for item in os.getenv("AI_ENCRYPTION_KEYS_OLD", "").split(",")
        if item.strip()
    ]
    if not primary:
        logger.warning(
            "AI_ENCRYPTION_KEY is unset; falling back to SESSION_SECRET for stored "
            "AI keys. Rotating SESSION_SECRET will make them unreadable. Generate "
            "one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
        primary = session_secret
    return KeyVault(
        primary_secret=primary,
        previous_secrets=previous,
        legacy_secret=session_secret,
    )
