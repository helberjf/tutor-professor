"""Plans, limits, usage lines and the webhook.

No payment gateway is involved: the point is that everything around one already
works, so wiring a gateway later is a checkout call rather than a rewrite.

The webhook checks are the ones that matter most in production. A gateway
retries, and a retried "payment succeeded" that runs twice hands out a free
month; a forged one that is accepted hands out a free plan forever.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-billing-"))
DB_PATH = TMP_DIR / "billing.sqlite"

WEBHOOK_SECRET = "webhook-test-secret"

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["FRONTEND_BASE_URL"] = "http://localhost:3000"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["BILLING_WEBHOOK_SECRET"] = WEBHOOK_SECRET
os.environ["BILLING_PROVIDER"] = "test-gateway"

sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import main  # noqa: E402
from account_approval_support import approve_all_accounts  # noqa: E402
from services import billing_service  # noqa: E402


EMAIL = "assinante@example.com"
PASSWORD = "Senha@Forte123"
CPF = "52998224725"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app), base_url="http://testserver"
    )


def signed(payload: dict) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new(WEBHOOK_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return body, {"x-webhook-signature": signature, "content-type": "application/json"}


def test_trial_expiry_does_not_wait_for_a_webhook() -> None:
    expired = billing_service.effective_status(
        stored_status="trialing",
        trial_ends_at=datetime.utcnow() - timedelta(days=1),
    )
    require(expired == "canceled", f"an expired trial must read as over, got {expired}")

    live = billing_service.effective_status(
        stored_status="trialing",
        trial_ends_at=datetime.utcnow() + timedelta(days=1),
    )
    require(live == "trialing", f"a live trial must read as trialing, got {live}")


def test_a_failed_payment_does_not_lock_a_child_out() -> None:
    entitlement = billing_service.Entitlement(
        plan=billing_service.get_plan(billing_service.PLAN_FAMILY),
        status=billing_service.SUBSCRIPTION_PAST_DUE,
    )
    require(
        entitlement.is_entitled,
        "past_due must keep working while the gateway retries the card",
    )
    canceled = billing_service.Entitlement(
        plan=billing_service.get_plan(billing_service.PLAN_FAMILY),
        status=billing_service.SUBSCRIPTION_CANCELED,
    )
    require(not canceled.is_entitled, "a canceled subscription is not entitled")


def test_an_unknown_plan_code_falls_back_instead_of_crashing() -> None:
    plan = billing_service.get_plan("plan-that-was-retired")
    require(plan.code == billing_service.PLAN_FREE, "an unknown code must fall back to free")


async def run_http_checks() -> None:
    main.on_startup()
    async with new_client() as client:
        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Teste",
                    "email": EMAIL,
                    "cpf": CPF,
                    "password": PASSWORD,
                    "child_name": "Lia",
                },
            ),
            201,
            "register",
        )
        approve_all_accounts(main)
        assert_status(
            await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}),
            200,
            "login",
        )

        plans = await client.get("/api/billing/plans")
        assert_status(plans, 200, "list plans")
        codes = [plan["code"] for plan in plans.json()]
        require("free" in codes and "family" in codes, f"expected the public catalogue, got {codes}")
        require("school" not in codes, "a quote-only plan must not be offered as self-serve")

        subscription = await client.get("/api/billing/subscription")
        assert_status(subscription, 200, "read subscription")
        body = subscription.json()
        require(body["plan"]["code"] == "free", f"a new account starts free, got {body}")
        require(body["children_used"] == 1, f"expected the registered child, got {body}")

        # The free plan allows one child; the second one is refused with a
        # message that says what to do, not just "no".
        second = await client.post(
            "/api/parent/children", json={"name": "Bia", "age_group": "7-9"}
        )
        assert_status(second, 402, "second child on the free plan")
        require("plano" in second.json()["detail"].lower(), f"expected an upgrade message, got {second.text}")

        # Starting a trial needs no gateway.
        trial = await client.post("/api/billing/checkout", json={"plan_code": "family"})
        assert_status(trial, 200, "start a trial")
        after_trial = (await client.get("/api/billing/subscription")).json()
        require(after_trial["plan"]["code"] == "family", f"expected the family plan, got {after_trial}")
        require(after_trial["status"] == "trialing", f"expected a trial, got {after_trial}")

        # And the limit moves with the plan.
        assert_status(
            await client.post("/api/parent/children", json={"name": "Bia", "age_group": "7-9"}),
            200,
            "second child on the family trial",
        )

        assert_status(
            await client.post("/api/billing/checkout", json={"plan_code": "free"}),
            422,
            "the free plan is not something to check out",
        )


async def run_webhook_checks() -> None:
    async with new_client() as client:
        payload = {
            "id": "evt_1",
            "type": "payment.succeeded",
            "data": {"customer_email": EMAIL, "plan_code": "study"},
        }
        body, headers = signed(payload)

        # A forged signature is refused before anything is read.
        assert_status(
            await client.post(
                "/api/billing/webhook",
                content=body,
                headers={**headers, "x-webhook-signature": "0" * 64},
            ),
            401,
            "forged webhook signature",
        )

        first = await client.post("/api/billing/webhook", content=body, headers=headers)
        assert_status(first, 202, "first delivery")
        require(first.json()["status"] == "applied", f"expected it to apply, got {first.text}")

        # The retry the gateway will send changes nothing.
        second = await client.post("/api/billing/webhook", content=body, headers=headers)
        assert_status(second, 202, "retried delivery")
        require(second.json()["status"] == "duplicate", f"expected a duplicate, got {second.text}")

    with Session(main.engine) as session:
        user = session.exec(select(main.User).where(main.User.email == EMAIL)).first()
        require(user is not None and user.id is not None, "the account should exist")
        record = main.get_subscription(session, user.id)
        require(record is not None, "the webhook should have created a subscription row")
        require(record.plan_code == "study", f"expected the study plan, got {record.plan_code}")
        require(record.status == "active", f"expected active, got {record.status}")
        events = session.exec(select(main.BillingEvent)).all()
        require(len(events) == 1, f"the retry must not add a second event row, got {len(events)}")


def test_usage_is_recorded_and_priced() -> None:
    with Session(main.engine) as session:
        user = session.exec(select(main.User).where(main.User.email == EMAIL)).first()
        require(user is not None and user.id is not None, "the account should exist")
        main.record_usage(
            session=session,
            user_id=user.id,
            kind=main.USAGE_AI_GENERATION,
            provider="gemini",
            model="gemini-3.1-flash-lite",
            cost_micros=30_000,
        )
        main.record_usage(
            session=session,
            user_id=user.id,
            kind=main.USAGE_AI_GENERATION_OWN_KEY,
            provider="gemini",
            model="gemini-3.1-flash-lite",
        )
        metered = main.count_metered_generations(session, user.id)
        require(metered == 1, f"only the platform-key call is metered, got {metered}")
        cost = main.month_cost_cents(session, user.id)
        require(cost == 3, f"30000 micros is 3 cents, got {cost}")


def test_plan_credits_top_up_once_per_period() -> None:
    """The plan allowance arrives as credits, and only once a period."""

    with Session(main.engine) as session:
        user = session.exec(select(main.User).where(main.User.email == EMAIL)).first()
        require(user is not None and user.id is not None, "the account should exist")
        # The webhook checks left this account on the study plan.
        user.ai_credits = 0
        user.ai_credits_period = None
        session.add(user)
        session.commit()

        main.top_up_plan_credits(session, user)
        plan = main.get_plan("study")
        require(
            user.ai_credits == plan.monthly_ai_generations,
            f"expected {plan.monthly_ai_generations} credits, got {user.ai_credits}",
        )

        # Spending them and asking again in the same period must not refill.
        user.ai_credits = 5
        session.add(user)
        session.commit()
        main.top_up_plan_credits(session, user)
        require(user.ai_credits == 5, f"a second top-up in the same period refilled: {user.ai_credits}")

        # Credits the administrator granted by hand survive the next period.
        user.ai_credits = plan.monthly_ai_generations + 500
        user.ai_credits_period = "1999-01"
        session.add(user)
        session.commit()
        main.top_up_plan_credits(session, user)
        require(
            user.ai_credits == plan.monthly_ai_generations + 500,
            f"the top-up took away granted credits: {user.ai_credits}",
        )


def main_entry() -> None:
    test_trial_expiry_does_not_wait_for_a_webhook()
    test_a_failed_payment_does_not_lock_a_child_out()
    test_an_unknown_plan_code_falls_back_instead_of_crashing()
    asyncio.run(run_http_checks())
    asyncio.run(run_webhook_checks())
    test_usage_is_recorded_and_priced()
    test_plan_credits_top_up_once_per_period()
    print("billing and usage: ok")


if __name__ == "__main__":
    main_entry()
