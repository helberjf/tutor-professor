"""Who the generated content is for, from the profile's age band.

The band is not a gate — it tunes vocabulary, examples and tone. It also carries
the extra rules a minor's content needs, which is why every generator asks this
module instead of assuming an audience of its own.
"""

from __future__ import annotations

from datetime import date

# The one module that names a child on purpose: saying which bands are a
# minor's, and what that means for generated content, is what it is for.
CHILD_AGE_GROUPS = frozenset({"4-6", "7-9", "10-12"})
TEEN_AGE_GROUPS = frozenset({"13-17"})


def normalize_age_group(age_group: str | None) -> str:
    return " ".join(str(age_group or "").split())[:40]


def is_minor(age_group: str | None) -> bool:
    band = normalize_age_group(age_group)
    return band in CHILD_AGE_GROUPS or band in TEEN_AGE_GROUPS


def audience_note(age_group: str | None) -> str:
    """One line describing the learner, for the top of a generation prompt."""

    band = normalize_age_group(age_group)
    if band in CHILD_AGE_GROUPS:
        return (
            f"Learner: a child aged {band}. Every example must be age-appropriate, "
            "gentle and safe, with no adult themes."
        )
    if band in TEEN_AGE_GROUPS:
        return (
            "Learner: a teenager (13-17). Keep examples age-appropriate and free of "
            "adult themes, but do not talk down to them."
        )
    if band:
        return (
            f"Learner: an adult (age group {band}). Use everyday adult contexts - "
            "work, travel, home, study - and do not talk down to them."
        )
    return (
        "Learner: an adult. Use everyday adult contexts - work, travel, home, study - "
        "and do not talk down to them."
    )


def story_format(age_group: str | None) -> str:
    """What kind of book to write for this learner."""

    band = normalize_age_group(age_group)
    if band in CHILD_AGE_GROUPS:
        return "illustrated picture-book for children"
    if band in TEEN_AGE_GROUPS:
        return "short illustrated story for teenage readers"
    return "short illustrated story for adult learners"


def content_rule(age_group: str | None) -> str:
    """The content restriction that applies to this learner."""

    if is_minor(age_group):
        return "Age-appropriate content only: nothing violent, frightening or adult."
    return "Keep the content appropriate for a general audience."


# ── From a birth date to a band ──────────────────────────────────────────────
# The band used to be picked from a dropdown, which was a guess that went stale
# the day after a birthday. A date is a fact, so the band is derived from it and
# keeps being right without anybody editing the profile again.

# The clause the terms of use state for a minor's profile. It lives here so the
# screen that shows it and the document that promises it cannot drift apart.
SUPERVISION_NOTICE = (
    "Este perfil e de um menor de 18 anos: pelos termos de uso, o estudo deve ser "
    "acompanhado por um adulto responsavel, que responde pela conta."
)

MIN_SUPPORTED_AGE = 4
MAX_SUPPORTED_AGE = 120


def age_on(birth_date: date | None, today: date | None = None) -> int | None:
    """Whole years old, or None when there is no date to work from."""

    if birth_date is None:
        return None
    today = today or date.today()
    if birth_date > today:
        return None
    years = today.year - birth_date.year
    # Subtract the year that has not come round yet: somebody born on 31 December
    # is not a year older on 30 December.
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return max(0, years)


def band_from_age(age: int | None) -> str | None:
    if age is None:
        return None
    if age <= 6:
        return "4-6"
    if age <= 9:
        return "7-9"
    if age <= 12:
        return "10-12"
    if age <= 17:
        return "13-17"
    return "18+"


def band_from_birth_date(birth_date: date | None, today: date | None = None) -> str | None:
    return band_from_age(age_on(birth_date, today))


def resolve_age_group(
    birth_date: date | None,
    stored_age_group: str | None = None,
    today: date | None = None,
) -> str:
    """The band to write content for.

    The birth date wins when there is one. Profiles created before the date was
    asked for keep the band they were saved with, so nothing about them changes
    until somebody fills the date in.
    """

    derived = band_from_birth_date(birth_date, today)
    if derived:
        return derived
    return normalize_age_group(stored_age_group) or "18+"


def requires_adult_supervision(
    birth_date: date | None,
    stored_age_group: str | None = None,
    today: date | None = None,
) -> bool:
    """True when the terms' supervision clause applies to this profile."""

    return is_minor(resolve_age_group(birth_date, stored_age_group, today))
