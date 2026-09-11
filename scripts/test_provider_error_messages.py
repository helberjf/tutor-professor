"""AI provider failures read as causes a parent can act on, and never leak the key."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from services.phrase_generator_service import format_provider_request_error  # noqa: E402


SECRET_KEY = "AIzaSyTESTSECRET0123456789abcdefghijk"


def http_error(status: int, body: object | str) -> requests.HTTPError:
    response = requests.Response()
    response.status_code = status
    response._content = (body if isinstance(body, str) else json.dumps(body)).encode("utf-8")
    response.url = f"https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key={SECRET_KEY}"
    return requests.HTTPError(f"{status} Client Error for url: {response.url}", response=response)


class ProviderErrorMessageTests(unittest.TestCase):
    def test_connection_error_never_repeats_the_url_with_the_key(self) -> None:
        exc = requests.ConnectionError(
            "HTTPSConnectionPool(host='generativelanguage.googleapis.com', port=443): Max retries "
            f"exceeded with url: /v1beta/models/x:generateContent?key={SECRET_KEY}"
        )

        message = format_provider_request_error("Gemini", exc)

        self.assertNotIn(SECRET_KEY, message)
        self.assertIn("fora do ar", message)

    def test_timeout_says_the_provider_was_slow(self) -> None:
        message = format_provider_request_error("Gemini", requests.Timeout(f"read timeout ?key={SECRET_KEY}"))

        self.assertNotIn(SECRET_KEY, message)
        self.assertIn("demorou", message)

    def test_rejected_key_points_to_settings(self) -> None:
        for status, body in (
            (401, {"error": {"message": "Incorrect API key provided."}}),
            (403, {"error": {"message": "Permission denied."}}),
            (400, {"error": {"message": "API key not valid. Please pass a valid API key."}}),
        ):
            with self.subTest(status=status):
                message = format_provider_request_error("Gemini", http_error(status, body))
                self.assertIn("recusou a chave de API", message)
                self.assertIn("Configuracoes", message)
                self.assertNotIn(SECRET_KEY, message)

    def test_quota_and_outage_are_told_apart(self) -> None:
        quota = format_provider_request_error("OpenAI", http_error(429, {"error": {"message": "Rate limit reached"}}))
        outage = format_provider_request_error("OpenAI", http_error(503, "Service Unavailable"))

        self.assertIn("limite de uso", quota)
        self.assertIn("Rate limit reached", quota)
        self.assertIn("instavel", outage)
        self.assertNotEqual(quota, outage)

    def test_other_refusals_keep_the_status_and_a_bounded_detail(self) -> None:
        message = format_provider_request_error("Anthropic", http_error(400, "x" * 5000))

        self.assertIn("HTTP 400", message)
        self.assertLess(len(message), 450)


if __name__ == "__main__":
    unittest.main(verbosity=2)
