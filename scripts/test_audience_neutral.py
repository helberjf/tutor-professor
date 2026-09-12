"""Generated content follows the profile's age band, not an assumed audience.

The app used to be for children, and the prompts said so: "child-safe lessons",
"practical for a child", "a children's picture-book". An adult who signed up got
content written for a seven-year-old.

Two things are pinned here, and they pull in opposite directions on purpose:

  - no generator may hardcode a child audience any more;
  - a profile whose age band *is* a child's must still get the content rules a
    child needs. Dropping the audience entirely would have been the easy change
    and the wrong one.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"

os.environ.setdefault("APP_ENV", "test")
sys.path.insert(0, str(API))

from services.audience import (  # noqa: E402
    audience_note,
    content_rule,
    is_minor,
    story_format,
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read(relative: str) -> str:
    return (API / relative).read_text(encoding="utf-8")


def test_bands_are_classified() -> None:
    for band in ("4-6", "7-9", "10-12", "13-17"):
        require(is_minor(band), f"{band} is a minor's band")
    for band in ("18+", "", "adult"):
        require(not is_minor(band), f"{band} must not be treated as a minor's band")


def test_the_note_describes_the_learner_in_front_of_you() -> None:
    child = audience_note("7-9")
    require("child aged 7-9" in child, "a child's band must say so")
    require("safe" in child.casefold(), "a child's band must carry the safety wording")

    teen = audience_note("13-17")
    require("teenager" in teen.casefold(), "the teenage band must say so")
    require("do not talk down" in teen.casefold(), "a teenager should not be talked down to")

    adult = audience_note("18+")
    require("adult" in adult.casefold(), "the adult band must say so")
    require("child" not in adult.casefold(), "an adult must never be described as a child")

    # An empty band is the common case for a profile created before age bands
    # were asked for. It must not silently become a child's.
    require("adult" in audience_note("").casefold(), "an unset band defaults to an adult")


def test_content_rules_survive_for_minors() -> None:
    for band in ("4-6", "7-9", "10-12", "13-17"):
        require(
            "age-appropriate" in content_rule(band).casefold(),
            f"the content rule for {band} must stay age-appropriate",
        )
    require(
        "general audience" in content_rule("18+").casefold(),
        "an adult still gets a general-audience rule, not a free pass",
    )
    require("children" in story_format("7-9"), "a child's story is still a children's book")
    require("adult" in story_format("18+"), "an adult gets a story written for an adult")


def test_no_generator_hardcodes_a_child() -> None:
    banned = re.compile(r"child-safe|for a child\b|for children\b|children's .*picture-book", re.IGNORECASE)
    for relative in (
        "services/phrase_generator_service.py",
        "services/book_service.py",
        "services/study_question_service.py",
        "services/language_question_service.py",
        "services/diverse_question_service.py",
    ):
        source = read(relative)
        # The audience module is allowed to name a child: describing the bands is
        # its whole job, and it is the one place that should.
        offenders = [line.strip() for line in source.splitlines() if banned.search(line)]
        require(not offenders, f"{relative} still assumes a child audience: {offenders[:3]}")


def test_the_tutor_prompt_speaks_to_a_student_of_any_age() -> None:
    prompt = (API / "prompts" / "tutor_system_prompt.txt").read_text(encoding="utf-8")
    require("qualquer idade" in prompt, "the tutor must state it teaches any age")
    require("mundo infantil" not in prompt, "the tutor must not reach for a child's analogies by default")
    require("menor de idade" in prompt, "the tutor must keep the rules that protect a minor")
    require("estudante" in prompt, "the tutor addresses a student")


def test_user_facing_api_copy_dropped_the_child() -> None:
    for relative in ("main.py", "services/billing_service.py", "schemas/schemas.py"):
        source = read(relative)
        offenders = [
            line.strip()
            for line in source.splitlines()
            if re.search(r"crian[çc]a", line, re.IGNORECASE)
        ]
        require(not offenders, f"{relative} still says crianca: {offenders[:3]}")


def run() -> None:
    test_bands_are_classified()
    test_the_note_describes_the_learner_in_front_of_you()
    test_content_rules_survive_for_minors()
    test_no_generator_hardcodes_a_child()
    test_the_tutor_prompt_speaks_to_a_student_of_any_age()
    test_user_facing_api_copy_dropped_the_child()
    print("audience neutrality: all checks passed")


if __name__ == "__main__":
    run()
