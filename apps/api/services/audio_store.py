"""Shared storage for synthesised speech.

The local cache is a directory, which is exactly right for a server that owns its
disk and useless for anything that does not: a file written by one instance is a
404 on the next, and on a read-only bundle it cannot be written at all. With
Kokoro reached over a tunnel to somebody's laptop, losing the cache is not a
small cost — re-reading a book page would re-synthesise every sentence, every
time, over that tunnel.

So an optional second backend: a private Supabase Storage bucket, addressed by
the same md5 the local cache already uses. Same key means an object written by
one instance is a hit for every other, and a redeploy does not lose the cache.

This is deliberately an *additional* branch. With the environment unset,
`build_audio_store()` returns None and every caller falls back to the local
directory, which is what keeps local development, the container path and the
signed-URL tests behaving exactly as before.

Only the REST API is used — no new dependency, just `requests`, which is already
here for the AI providers.
"""
from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 10


class AudioStoreError(RuntimeError):
    """Raised when the object store cannot be reached or refuses the request."""


class SupabaseAudioStore:
    def __init__(
        self,
        *,
        url: str,
        service_key: str,
        bucket: str,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = url.rstrip("/")
        self.service_key = service_key
        self.bucket = bucket
        self.timeout_seconds = timeout_seconds

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.service_key}",
            "apikey": self.service_key,
        }

    def _object_url(self, filename: str) -> str:
        return f"{self.base_url}/storage/v1/object/{self.bucket}/{filename}"

    def exists(self, filename: str) -> bool:
        """True when the object is already stored.

        A network problem answers False rather than raising: the worst outcome
        is re-synthesising something we already had, which is a slow success
        instead of a failed request.
        """

        try:
            response = requests.head(
                self._object_url(filename),
                headers=self._headers,
                timeout=self.timeout_seconds,
            )
        except requests.RequestException:
            logger.warning("Audio store HEAD failed for %s", filename, exc_info=True)
            return False
        return response.status_code == 200

    def put(self, filename: str, data: bytes) -> None:
        try:
            response = requests.post(
                self._object_url(filename),
                headers={
                    **self._headers,
                    "Content-Type": "audio/mpeg",
                    # Two instances can synthesise the same phrase at once; the
                    # second one overwriting the first with identical bytes is
                    # fine, and failing the request over it would not be.
                    "x-upsert": "true",
                },
                data=data,
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise AudioStoreError(f"Could not upload {filename}") from exc
        if response.status_code >= 400:
            raise AudioStoreError(
                f"Audio store refused {filename}: {response.status_code} {response.text[:200]}"
            )

    def signed_url(self, filename: str, ttl_seconds: int) -> str:
        """A time-limited public URL for a private object."""

        try:
            response = requests.post(
                f"{self.base_url}/storage/v1/object/sign/{self.bucket}/{filename}",
                headers={**self._headers, "Content-Type": "application/json"},
                json={"expiresIn": ttl_seconds},
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise AudioStoreError(f"Could not sign {filename}") from exc
        if response.status_code >= 400:
            raise AudioStoreError(
                f"Audio store refused to sign {filename}: {response.status_code}"
            )
        signed_path = (response.json() or {}).get("signedURL", "")
        if not signed_path:
            raise AudioStoreError(f"Audio store returned no signed URL for {filename}")
        return f"{self.base_url}/storage/v1{signed_path}"


def build_audio_store() -> SupabaseAudioStore | None:
    """The store when all three settings are present, otherwise None.

    All three, deliberately: a half-configured store that silently swallowed
    audio would be worse than no store at all.
    """

    url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    bucket = os.getenv("AUDIO_BUCKET", "").strip()
    if not (url and service_key and bucket):
        return None
    return SupabaseAudioStore(
        url=url,
        service_key=service_key,
        bucket=bucket,
        timeout_seconds=int(os.getenv("AUDIO_STORE_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))),
    )
