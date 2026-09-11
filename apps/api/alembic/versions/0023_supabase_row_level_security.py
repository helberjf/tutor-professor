"""enable row level security and lock the Supabase Data API roles out of public

Revision ID: 0023
Revises: 0022
Create Date: 2026-09-11
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from database_security import harden_public_schema


revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op outside Supabase; see database_security for the full reasoning.
    harden_public_schema(op.get_bind())


def downgrade() -> None:
    # Deliberately irreversible: re-granting the public API roles would reopen
    # every table to anyone holding the publishable key.
    pass
