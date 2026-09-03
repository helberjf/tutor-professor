"""Password strength policy, shared by every place that accepts a new password.

The rules mirror apps/web/src/lib/password-validation.ts one for one, so the
meter the person watches while typing and the answer the server gives are never
in disagreement. The server copy is the one that actually protects anything: a
client-only policy is bypassed by any direct HTTP call.

Requirements: at least 8 characters, one uppercase, one lowercase, one digit and
one special character.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


MIN_LENGTH = 8
SPECIAL_CHARACTER_PATTERN = re.compile(r"""[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]""")


@dataclass(frozen=True)
class PasswordStrength:
    is_valid: bool
    strength: str  # weak | fair | good | strong
    score: int  # 0-100
    feedback: tuple[str, ...] = ()


def validate_password_strength(password: str) -> PasswordStrength:
    feedback: list[str] = []
    score = 0

    if len(password) < MIN_LENGTH:
        feedback.append(f"Minimo {MIN_LENGTH} caracteres")
    else:
        score += 20
        # Length beyond the minimum only moves the meter; it never substitutes
        # for a missing character class.
        if len(password) >= 12:
            score += 10
        if len(password) >= 16:
            score += 10

    if not re.search(r"[A-Z]", password):
        feedback.append("Adicione pelo menos uma letra maiuscula")
    else:
        score += 20

    if not re.search(r"[a-z]", password):
        feedback.append("Adicione pelo menos uma letra minuscula")
    else:
        score += 20

    if not re.search(r"[0-9]", password):
        feedback.append("Adicione pelo menos um numero")
    else:
        score += 20

    if not SPECIAL_CHARACTER_PATTERN.search(password):
        feedback.append("Adicione pelo menos um caractere especial (!@#$%^&*)")
    else:
        score += 20

    strength = "weak"
    if score >= 80:
        strength = "strong"
    elif score >= 60:
        strength = "good"
    elif score >= 40:
        strength = "fair"

    return PasswordStrength(
        is_valid=not feedback,
        strength=strength,
        score=min(score, 100),
        feedback=tuple(feedback),
    )


def password_policy_detail(result: PasswordStrength) -> str:
    """A single sentence naming everything the password is still missing."""

    return "Senha fraca. " + "; ".join(result.feedback) + "."
