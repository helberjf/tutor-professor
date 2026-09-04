"""Which certificate authorities outbound HTTPS calls should trust.

On Linux — a container, a VPS, a serverless host — certifi's bundle is enough and
this returns True, the requests default.

Windows is the exception, and it is why this exists. Python does not read the
Windows certificate store, so a machine whose trust comes from there (a company
laptop with an inspecting proxy, or a fresh install missing an intermediate)
fails every HTTPS call with "unable to get local issuer certificate" even though
the browser on the same machine is perfectly happy. Merging certifi with the
system store fixes it without asking anyone to turn verification off.

Every outbound HTTPS call in this codebase should pass `verify=get_requests_verify()`.
"""
from __future__ import annotations

import os
import ssl
import tempfile
from functools import lru_cache
from pathlib import Path

import certifi


@lru_cache(maxsize=1)
def get_requests_verify() -> str | bool:
    """A CA bundle path, or True to use the requests default.

    Cached because building the bundle reads the whole system store, and the
    answer cannot change while the process is alive.
    """

    custom_ca_bundle = os.getenv("REQUESTS_CA_BUNDLE_OVERRIDE", "").strip() or os.getenv(
        "GEMINI_CA_BUNDLE", ""
    ).strip()
    if custom_ca_bundle:
        return custom_ca_bundle

    if os.name != "nt":
        return True

    certifi_path = Path(certifi.where())
    if not certifi_path.exists():
        return True

    bundle_path = Path(tempfile.gettempdir()) / "english_kids_tutor_windows_ca_bundle.pem"
    seen_blocks: set[str] = set()
    bundle_parts: list[str] = []

    for block in certifi_path.read_text(encoding="ascii", errors="ignore").split(
        "-----END CERTIFICATE-----"
    ):
        block = block.strip()
        if not block:
            continue
        pem = f"{block}\n-----END CERTIFICATE-----\n"
        seen_blocks.add(pem)
        bundle_parts.append(pem)

    for store_name in ("ROOT", "CA"):
        try:
            certificates = ssl.enum_certificates(store_name)
        except Exception:
            continue

        for certificate, encoding, _trust in certificates:
            if encoding != "x509_asn":
                continue
            pem = ssl.DER_cert_to_PEM_cert(certificate)
            if pem in seen_blocks:
                continue
            seen_blocks.add(pem)
            bundle_parts.append(pem)

    if not bundle_parts:
        return True

    bundle_path.write_text("\n".join(bundle_parts), encoding="ascii")
    return str(bundle_path)
