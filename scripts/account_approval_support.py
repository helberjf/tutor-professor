"""Clear the approval gate for accounts a test fixture just registered.

Registration leaves a new account pending until the administrator approves it
(see scripts/test_admin_account_approval.py, which covers the gate itself).
Fixtures that register a parent and then drive the app have to get past it, and
they care about the feature under test rather than about the queue.
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session, select


def approve_all_accounts(main_module: Any) -> None:
    """Approve every account in the test database."""

    from models.database import User

    with Session(main_module.engine) as session:
        for user in session.exec(select(User)).all():
            if user.status != main_module.USER_STATUS_APPROVED:
                user.status = main_module.USER_STATUS_APPROVED
                session.add(user)
        session.commit()


def enable_all_modules(main_module: Any) -> None:
    """Switch every optional module on for every account in the test database.

    The programming module ships off (see apps/api/services/modules.py), so a
    fixture that drives the coding curriculum has to turn it on first. Tests for
    the switch itself live in scripts/test_account_modules.py; everything else
    just wants the feature under test to be reachable.
    """

    from models.database import User
    from services.modules import MODULE_IDS

    with Session(main_module.engine) as session:
        for user in session.exec(select(User)).all():
            user.enabled_modules = {module_id: True for module_id in MODULE_IDS}
            session.add(user)
        session.commit()


def put_accounts_on_paid_plan(main_module: Any) -> None:
    """Give every test account a plan with room for what the test does.

    The free plan allows one child and no included AI generations, which is a
    product decision, not something most fixtures are testing. A fixture that
    needs a second child subscribes the way a customer would instead of having
    the limit quietly weakened for it.
    """

    from models.database import Subscription, User
    from services.billing_service import PLAN_STUDY, SUBSCRIPTION_ACTIVE

    with Session(main_module.engine) as session:
        for user in session.exec(select(User)).all():
            if user.id is None:
                continue
            existing = session.exec(
                select(Subscription).where(Subscription.user_id == user.id)
            ).first()
            if existing is None:
                session.add(
                    Subscription(
                        user_id=user.id,
                        plan_code=PLAN_STUDY,
                        status=SUBSCRIPTION_ACTIVE,
                    )
                )
            else:
                existing.plan_code = PLAN_STUDY
                existing.status = SUBSCRIPTION_ACTIVE
                session.add(existing)
        session.commit()
