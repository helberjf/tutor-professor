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
