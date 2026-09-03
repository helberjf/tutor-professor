"""Password policy and the brute-force brake on login.

The policy is checked directly and through the HTTP signup, because the whole
point of the server copy is that it holds when the browser is skipped.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
WEB_VALIDATION = REPO_ROOT / "apps" / "web" / "src" / "lib" / "password-validation.ts"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-password-"))
DB_PATH = TMP_DIR / "kids_tutor_password.sqlite"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["MAX_FAILED_LOGINS"] = "3"
os.environ["LOGIN_LOCK_MINUTES"] = "15"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from models.database import User  # noqa: E402
from services.password_policy import (  # noqa: E402
    MIN_LENGTH,
    validate_password_strength,
)


VALID_CPF = "52998224725"
STRONG = "Secret@123"


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app),
        base_url="http://testserver",
    )


class PasswordPolicyTests(unittest.TestCase):
    def test_rejects_each_missing_character_class(self) -> None:
        cases = {
            "Sh0rt@a": "Minimo",  # 7 characters
            "secret@123": "maiuscula",
            "SECRET@123": "minuscula",
            "Secret@abc": "numero",
            "Secret1234": "especial",
        }
        for password, expected_fragment in cases.items():
            with self.subTest(password=password):
                result = validate_password_strength(password)
                self.assertFalse(result.is_valid)
                self.assertTrue(
                    any(expected_fragment in item for item in result.feedback),
                    f"{password!r} should complain about {expected_fragment}: {result.feedback}",
                )

    def test_accepts_a_password_meeting_every_rule(self) -> None:
        result = validate_password_strength(STRONG)
        self.assertTrue(result.is_valid, result.feedback)
        self.assertEqual(result.feedback, ())
        self.assertEqual(result.strength, "strong")

    def test_length_alone_never_substitutes_for_a_missing_rule(self) -> None:
        # Long but all lowercase letters: still refused.
        result = validate_password_strength("a" * 40)
        self.assertFalse(result.is_valid)
        self.assertLess(result.score, 80)

    def test_meeting_every_rule_already_maxes_the_meter(self) -> None:
        # The five rules are worth 20 each, so a password that satisfies all of
        # them is at 100 and the length bonus has nothing left to add.
        self.assertEqual(validate_password_strength("Secret@1").score, 100)
        self.assertEqual(validate_password_strength("Secret@1Secret@1").score, 100)

    def test_length_bonus_only_lifts_a_password_still_missing_a_rule(self) -> None:
        short = validate_password_strength("aaaaaaaa")
        longer = validate_password_strength("aaaaaaaaaaaa")
        self.assertFalse(short.is_valid or longer.is_valid)
        self.assertGreater(longer.score, short.score)

    def test_minimum_length_is_eight(self) -> None:
        self.assertEqual(MIN_LENGTH, 8)


class ClientPolicyMirrorTests(unittest.TestCase):
    """The browser meter and the server rule have to state the same thing."""

    def test_client_module_declares_the_same_rules(self) -> None:
        source = WEB_VALIDATION.read_text(encoding="utf-8")
        self.assertIn(f"PASSWORD_MIN_LENGTH = {MIN_LENGTH}", source)
        for rule in ("[A-Z]", "[a-z]", "[0-9]", "PASSWORD_SPECIAL_PATTERN"):
            self.assertIn(rule, source, f"client validation is missing {rule}")


async def register(client: httpx.AsyncClient, *, email: str, cpf: str, password: str):
    return await client.post(
        "/api/auth/register",
        json={
            "first_name": "Teste",
            "last_name": "Senha",
            "email": email,
            "cpf": cpf,
            "password": password,
            "child_name": "Filho",
        },
    )


async def run_http_checks() -> None:
    main.create_db_and_tables()
    main._run_schema_migrations()

    async with new_client() as client:
        # A weak password is refused by the API, not only by the browser.
        weak = await register(client, email="fraca@example.com", cpf=VALID_CPF, password="secret123")
        if weak.status_code != 422:
            raise AssertionError(f"weak password should be refused: {weak.status_code} {weak.text}")
        if "maiuscula" not in weak.text:
            raise AssertionError(f"the refusal should name what is missing: {weak.text}")

        with Session(main.engine) as session:
            if session.exec(select(User).where(User.email == "fraca@example.com")).first():
                raise AssertionError("a refused signup must not create the account")

        strong = await register(client, email="forte@example.com", cpf=VALID_CPF, password=STRONG)
        if strong.status_code != 201:
            raise AssertionError(f"strong password should be accepted: {strong.status_code} {strong.text}")

        # Wrong passwords lock the account after MAX_FAILED_LOGINS attempts.
        for attempt in range(1, 3):
            failed = await client.post(
                "/api/auth/login",
                json={"email": "forte@example.com", "password": "Wrong@123"},
            )
            if failed.status_code != 401:
                raise AssertionError(f"attempt {attempt} should be a 401, got {failed.status_code}")

        third = await client.post(
            "/api/auth/login", json={"email": "forte@example.com", "password": "Wrong@123"}
        )
        if third.status_code != 401:
            raise AssertionError(f"the attempt that trips the lock still answers 401: {third.status_code}")

        # Now locked: even the right password is refused, with a 429 and Retry-After.
        locked = await client.post(
            "/api/auth/login", json={"email": "forte@example.com", "password": STRONG}
        )
        if locked.status_code != 429:
            raise AssertionError(f"the account should be locked: {locked.status_code} {locked.text}")
        if not locked.headers.get("Retry-After"):
            raise AssertionError("a lock response should say when to retry")

        # The lock clears itself; nothing but time is needed.
        with Session(main.engine) as session:
            user = session.exec(select(User).where(User.email == "forte@example.com")).first()
            user.locked_until = datetime.utcnow() - timedelta(seconds=1)
            session.add(user)
            session.commit()

        reopened = await client.post(
            "/api/auth/login", json={"email": "forte@example.com", "password": STRONG}
        )
        if reopened.status_code != 200:
            raise AssertionError(f"an expired lock should let the login through: {reopened.text}")

        # A successful login resets the counter, so scattered typos never add up.
        with Session(main.engine) as session:
            user = session.exec(select(User).where(User.email == "forte@example.com")).first()
            if user.failed_login_attempts != 0 or user.locked_until is not None:
                raise AssertionError(
                    f"a good login should clear the counter, got {user.failed_login_attempts}/{user.locked_until}"
                )

        # An unknown e-mail is still a plain 401: no account, nothing to lock.
        unknown = await client.post(
            "/api/auth/login", json={"email": "ninguem@example.com", "password": STRONG}
        )
        if unknown.status_code != 401:
            raise AssertionError(f"unknown e-mail should stay a 401: {unknown.status_code}")

    print("Password security HTTP checks passed.")


if __name__ == "__main__":
    asyncio.run(run_http_checks())
    unittest.main(argv=[sys.argv[0]], verbosity=1)
