"""A shared-secret door in front of Kokoro, for when it is exposed by a tunnel.

While the tunnel exposed the API, Kokoro was safe by accident: it listened on
localhost and the only thing reaching it was an already-authenticated request.
Pointing the tunnel at Kokoro directly removes that, and Kokoro has no
authentication of its own — anyone who learns the hostname can drive synthesis
on this machine indefinitely. The hostname is not a secret either: it is stored
in a database row and appears in the API's logs.

So the tunnel points here instead of at Kokoro. This checks one header and
forwards; everything else it refuses. Small on purpose — a bigger thing in this
position would be its own risk.

Run it next to Kokoro:

    KOKORO_PROXY_TOKEN="<same value the API sends>" \\
    python scripts/kokoro_auth_proxy.py

Then point the tunnel at 127.0.0.1:8899 rather than 127.0.0.1:8880.

The API sends the token as `X-Kokoro-Token`; set KOKORO_AUTH_TOKEN there to the
same value.
"""
from __future__ import annotations

import hmac
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("kokoro-proxy")

TOKEN = os.getenv("KOKORO_PROXY_TOKEN", "").strip()
UPSTREAM = os.getenv("KOKORO_UPSTREAM", "http://127.0.0.1:8880").rstrip("/")
LISTEN_HOST = os.getenv("KOKORO_PROXY_HOST", "127.0.0.1")
LISTEN_PORT = int(os.getenv("KOKORO_PROXY_PORT", "8899"))
UPSTREAM_TIMEOUT = float(os.getenv("KOKORO_PROXY_TIMEOUT", "30"))
MAX_BODY_BYTES = int(os.getenv("KOKORO_PROXY_MAX_BODY", str(64 * 1024)))

# Only what the API actually calls. Anything else is refused rather than
# forwarded, so this cannot become a general-purpose open proxy.
ALLOWED_PATHS = {"/v1/audio/speech"}


class KokoroProxyHandler(BaseHTTPRequestHandler):
    server_version = "KokoroAuthProxy/1.0"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 - base class name
        logger.info("%s - %s", self.address_string(), fmt % args)

    def _refuse(self, status: int, message: str) -> None:
        body = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - base class name
        # A liveness probe that reveals nothing and needs no token.
        if self.path == "/healthz":
            self._refuse(200, "ok")
            return
        self._refuse(404, "not found")

    def do_POST(self) -> None:  # noqa: N802 - base class name
        if self.path not in ALLOWED_PATHS:
            self._refuse(404, "not found")
            return

        provided = self.headers.get("X-Kokoro-Token", "")
        if not hmac.compare_digest(provided, TOKEN):
            # Deliberately the same answer as a missing path: a caller without
            # the token learns nothing about what is behind this.
            logger.warning("Rejected a request without a valid token")
            self._refuse(404, "not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._refuse(400, "bad request")
            return
        if length <= 0 or length > MAX_BODY_BYTES:
            self._refuse(413, "payload too large")
            return
        payload = self.rfile.read(length)

        upstream = Request(
            f"{UPSTREAM}{self.path}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(upstream, timeout=UPSTREAM_TIMEOUT) as response:
                body = response.read()
                content_type = response.headers.get("Content-Type", "audio/mpeg")
        except HTTPError as exc:
            logger.warning("Kokoro answered %s", exc.code)
            self._refuse(502, "upstream error")
            return
        except (URLError, TimeoutError) as exc:
            logger.warning("Kokoro is not reachable: %s", exc)
            self._refuse(502, "upstream unavailable")
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    if not TOKEN:
        print(
            "KOKORO_PROXY_TOKEN is not set. Refusing to start: without it this would "
            "be an open door to Kokoro.\n"
            'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(32))"',
            file=sys.stderr,
        )
        return 2

    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), KokoroProxyHandler)
    logger.info("Guarding %s on http://%s:%s", UPSTREAM, LISTEN_HOST, LISTEN_PORT)
    logger.info("Point the tunnel here, not at Kokoro directly.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Stopping")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
