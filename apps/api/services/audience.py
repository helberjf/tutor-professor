"""Who the generated content is for, from the profile's age band.

The band is not a gate — it tunes vocabulary, examples and tone. It also carries
the extra rules a minor's content needs, which is why every generator asks this
module instead of assuming an audience of its own.
"""

from __future__ import annotations

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
