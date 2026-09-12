"""The birth date decides the age band, and with it the supervision clause.

Picking a band from a dropdown was a guess that went stale the day after a
birthday, and it also meant nothing in the product actually knew whether a minor
was studying. A date knows both.

Pinned here:

  - signup and the account area accept a date and derive the band from it;
  - the band follows the birthday without anybody editing the profile;
  - a profile under 18 reports `requires_adult_supervision` with the notice the
    terms of use state, and one over 18 does not;
  - profiles saved before the date was asked for keep working on their stored
    band;
  - an impossible date is refused rather than quietly stored.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-birth-date-"))

os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'birth.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["SESSION_SECRET"] = "test-session-secret-for-birth-date"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "birth-admin@example.com"

sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts, enable_all_modules  # noqa: E402
from models.database import ChildProfile, Subscription, User  # noqa: E402
from services import billing_service  # noqa: E402
from services.audience import (  # noqa: E402
    SUPERVISION_NOTICE,
    band_from_birth_date,
    requires_adult_supervision,
    resolve_age_group,
)

VALID_CPF = "52998224725"
EMAIL = "nascimento@example.com"
PASSWORD = "Senha@Forte123"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def years_ago(years: int, *, days: int = 0) -> date:
    today = date.today()
    try:
        anchor = today.replace(year=today.year - years)
    except ValueError:  # 29 February
        anchor = today.replace(year=today.year - years, day=28)
    return anchor - timedelta(days=days)


def test_band_follows_the_calendar() -> None:
    """A pure check on the rule, including the day the band changes."""

    today = date(2026, 9, 12)
    cases = [
        (date(2020, 9, 13), "4-6"),    # 5
        (date(2019, 9, 12), "7-9"),    # 7
        (date(2016, 9, 12), "10-12"),  # 10
        (date(2013, 9, 13), "10-12"),  # 12, birthday tomorrow
        (date(2013, 9, 12), "13-17"),  # 13 today
        (date(2008, 9, 13), "13-17"),  # 17, birthday tomorrow
        (date(2008, 9, 12), "18+"),    # 18 today
    ]
    for born, expected in cases:
        got = band_from_birth_date(born, today)
        require(got == expected, f"{born} should be {expected}, got {got}")

    require(
        band_from_birth_date(date(2027, 1, 1), today) is None,
        "a date in the future is not an age",
    )
    require(
        resolve_age_group(None, "7-9", today) == "7-9",
        "a profile with no date keeps the band it was saved with",
    )
    require(
        resolve_age_group(None, None, today) == "18+",
        "with nothing to go on, the learner is an adult",
    )
    require(
        requires_adult_supervision(date(2008, 9, 13), None, today),
        "seventeen is still a minor",
    )
    require(
        not requires_adult_supervision(date(2008, 9, 12), None, today),
        "eighteen is not",
    )


async def register(client: httpx.AsyncClient, birth_date: str | None) -> dict[str, str]:
    payload = {
        "first_name": "Maria",
        "last_name": "Responsavel",
        "email": EMAIL,
        "cpf": VALID_CPF,
        "password": PASSWORD,
        "child_name": "Joao",
    }
    if birth_date is not None:
        payload["birth_date"] = birth_date
    created = await client.post("/api/auth/register", json=payload)
    require(created.status_code == 201, f"register failed: {created.text}")
    approve_all_accounts(main)
    enable_all_modules(main)
    login = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    require(login.status_code == 200, f"login failed: {login.text}")
    return {"Authorization": f"Bearer {login.json()['token']}"}


async def test_signup_stores_the_date_and_derives_the_band(
    client: httpx.AsyncClient,
) -> dict[str, str]:
    born = years_ago(9, days=10)  # a nine-year-old
    headers = await register(client, born.isoformat())

    settings = await client.get("/api/parent/settings", headers=headers)
    require(settings.status_code == 200, f"settings failed: {settings.text}")
    body = settings.json()
    require(body["birth_date"] == born.isoformat(), "the date should come back as it was sent")
    require(body["age_group"] == "7-9", f"a nine-year-old is 7-9, got {body['age_group']}")
    require(body["age"] == 9, f"age should be 9, got {body['age']}")
    require(body["requires_adult_supervision"] is True, "a nine-year-old needs an adult alongside")
    require(
        body["supervision_notice"] == SUPERVISION_NOTICE,
        "the clause the terms state should travel with the profile",
    )
    return headers


async def test_account_area_updates_the_date(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    grown = years_ago(30)
    saved = await client.post(
        "/api/parent/settings",
        headers=headers,
        json={"child_name": "Joao", "birth_date": grown.isoformat()},
    )
    require(saved.status_code == 200, f"saving the date failed: {saved.text}")
    body = saved.json()
    require(body["age_group"] == "18+", f"a thirty-year-old is 18+, got {body['age_group']}")
    require(body["requires_adult_supervision"] is False, "an adult studies alone")
    require(body["supervision_notice"] is None, "no clause to show for an adult")

    # A band sent alongside the date must not win over it: the date is the fact.
    confused = await client.post(
        "/api/parent/settings",
        headers=headers,
        json={"age_group": "4-6", "birth_date": grown.isoformat()},
    )
    require(confused.json()["age_group"] == "18+", "the date decides, not the band field")


async def test_an_impossible_date_is_refused(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    future = (date.today() + timedelta(days=1)).isoformat()
    refused = await client.post(
        "/api/parent/settings", headers=headers, json={"birth_date": future}
    )
    require(refused.status_code == 422, f"a future date should be refused, got {refused.status_code}")
    require("futuro" in refused.json()["detail"], "the message should say why")

    ancient = await client.post(
        "/api/parent/settings", headers=headers, json={"birth_date": "1700-01-01"}
    )
    require(ancient.status_code == 422, "an impossible age should be refused")


async def test_a_profile_without_a_date_keeps_working(
    client: httpx.AsyncClient, headers: dict[str, str]
) -> None:
    """The eight profiles already in production have no date. Nothing may break."""

    with Session(main.engine) as session:
        child = session.exec(select(ChildProfile).order_by(ChildProfile.id)).first()
        child.birth_date = None
        child.age_group = "10-12"
        session.add(child)
        session.commit()

    settings = await client.get("/api/parent/settings", headers=headers)
    body = settings.json()
    require(body["birth_date"] is None, "no date is a valid state")
    require(body["age_group"] == "10-12", "the stored band still decides")
    require(body["age"] is None, "with no date there is no age to report")
    require(body["requires_adult_supervision"] is True, "a 10-12 profile is still a minor's")


async def test_a_second_profile_takes_a_date_too(
    client: httpx.AsyncClient, headers: dict[str, str]
) -> None:
    born = years_ago(15)
    payload = {"name": "Bia", "birth_date": born.isoformat(), "target_language": "English"}

    # The free plan allows one student, and this account already has one: the
    # limit answers before anything else, which is the behaviour to keep.
    blocked = await client.post("/api/parent/children", headers=headers, json=payload)
    require(blocked.status_code == 402, f"the plan limit should answer first, got {blocked.status_code}")

    with Session(main.engine) as session:
        user = session.exec(select(User).where(User.email == EMAIL)).first()
        session.add(
            Subscription(
                user_id=user.id,
                plan_code=billing_service.PLAN_FAMILY,
                status=billing_service.SUBSCRIPTION_ACTIVE,
                current_period_end=datetime.utcnow() + timedelta(days=30),
            )
        )
        session.commit()

    created = await client.post("/api/parent/children", headers=headers, json=payload)
    require(created.status_code == 200, f"creating a profile failed: {created.text}")
    body = created.json()
    require(body["age_group"] == "13-17", f"a fifteen-year-old is 13-17, got {body['age_group']}")
    require(body["requires_adult_supervision"] is True, "a teenager still studies with an adult")


async def test_onboarding_takes_the_date(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    born = years_ago(41)
    done = await client.post(
        "/api/onboarding/complete",
        headers=headers,
        json={
            "child_name": "Maria",
            "birth_date": born.isoformat(),
            "target_language": "English",
            "correct_levels": [1, 2],
        },
    )
    require(done.status_code == 200, f"onboarding failed: {done.text}")
    body = done.json()
    require(body["age_group"] == "18+", f"expected 18+, got {body['age_group']}")
    require(body["requires_adult_supervision"] is False, "an adult needs no supervision clause")

    state = await client.get("/api/onboarding/state", headers=headers)
    require(
        state.json()["birth_date"] == born.isoformat(),
        "the guided first run should come back pre-filled with the date",
    )


async def run() -> None:
    main.on_startup()
    test_band_follows_the_calendar()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await test_signup_stores_the_date_and_derives_the_band(client)
        await test_account_area_updates_the_date(client, headers)
        await test_an_impossible_date_is_refused(client, headers)
        await test_a_profile_without_a_date_keeps_working(client, headers)
        await test_a_second_profile_takes_a_date_too(client, headers)
        await test_onboarding_takes_the_date(client, headers)
    print("birth date and audience: all checks passed")


if __name__ == "__main__":
    asyncio.run(run())
