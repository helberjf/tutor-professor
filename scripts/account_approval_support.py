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
