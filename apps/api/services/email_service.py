"""Transactional e-mail.

The app could not tell anybody anything: no verification, no password reset, no
notice that an account was approved. Every one of those turned into a message to
the administrator, which is fine for one family and impossible for a product.

Two backends, chosen by EMAIL_PROVIDER:

  console  (default) writes the message to the log. Development and CI never
           need a mail server, and a missing SMTP setup must not break signup.
  smtp     talks to a real server over STARTTLS or implicit TLS.

Sending never raises at the call site: a mail server having a bad afternoon
should not turn a successful password reset into a 500. Failures are logged and
reported through the return value for callers that care.
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

logger = logging.getLogger(__name__)

PROVIDER_CONSOLE = "console"
PROVIDER_SMTP = "smtp"


@dataclass(frozen=True)
class EmailMessageSpec:
    to: str
    subject: str
    body: str


class EmailService:
    def __init__(
        self,
        *,
        provider: str | None = None,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        sender: str | None = None,
        use_tls: bool | None = None,
    ) -> None:
        self.provider = (provider or os.getenv("EMAIL_PROVIDER", PROVIDER_CONSOLE)).strip().lower()
        self.host = host if host is not None else os.getenv("SMTP_HOST", "")
        self.port = port if port is not None else int(os.getenv("SMTP_PORT", "587"))
        self.username = username if username is not None else os.getenv("SMTP_USERNAME", "")
        self.password = password if password is not None else os.getenv("SMTP_PASSWORD", "")
        self.sender = sender or os.getenv("EMAIL_FROM", "no-reply@tutorprofessor.app")
        self.use_tls = (
            use_tls
            if use_tls is not None
            else os.getenv("SMTP_USE_TLS", "true").lower() == "true"
        )
        if self.provider == PROVIDER_SMTP and not self.host:
            logger.warning(
                "EMAIL_PROVIDER=smtp but SMTP_HOST is empty; falling back to console."
            )
            self.provider = PROVIDER_CONSOLE

    def send(self, message: EmailMessageSpec) -> bool:
        """Deliver the message. Returns False when delivery failed."""

        if self.provider == PROVIDER_CONSOLE:
            logger.info(
                "[email:console] to=%s subject=%s\n%s",
                message.to,
                message.subject,
                message.body,
            )
            return True
        try:
            self._send_smtp(message)
            return True
        except Exception:
            # Deliberately broad: any mail failure is the mail system's problem,
            # not the caller's, and the caller already did the important part.
            logger.exception("Failed to send e-mail to %s", message.to)
            return False

    def _send_smtp(self, message: EmailMessageSpec) -> None:
        email = EmailMessage()
        email["From"] = self.sender
        email["To"] = message.to
        email["Subject"] = message.subject
        email.set_content(message.body)

        context = ssl.create_default_context()
        if self.port == 465:
            with smtplib.SMTP_SSL(self.host, self.port, context=context, timeout=15) as client:
                self._authenticate(client)
                client.send_message(email)
            return

        with smtplib.SMTP(self.host, self.port, timeout=15) as client:
            if self.use_tls:
                client.starttls(context=context)
            self._authenticate(client)
            client.send_message(email)

    def _authenticate(self, client: smtplib.SMTP) -> None:
        if self.username and self.password:
            client.login(self.username, self.password)
