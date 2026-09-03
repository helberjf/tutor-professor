"""charge for the product: plans per account, usage lines and webhook events

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        return

    # Which period the plan allowance was last credited for. Null means never,
    # which is exactly right for every account that existed before plans did.
    if "ai_credits_period" not in _column_names("user"):
        op.add_column("user", sa.Column("ai_credits_period", sa.String(length=7), nullable=True))

    # No row is created for anybody: an account without a subscription is on the
    # free plan, which is what every existing account already had.
    if not inspector.has_table("subscription"):
        op.create_table(
            "subscription",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("plan_code", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default="none"),
            sa.Column("provider_customer_id", sa.String(length=120), nullable=True),
            sa.Column("provider_subscription_id", sa.String(length=120), nullable=True),
            sa.Column("trial_ends_at", sa.DateTime(), nullable=True),
            sa.Column("current_period_start", sa.DateTime(), nullable=True),
            sa.Column("current_period_end", sa.DateTime(), nullable=True),
            sa.Column(
                "cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("user_id", name="uq_subscription_user"),
        )
        op.create_index("ix_subscription_user_id", "subscription", ["user_id"])
        op.create_index("ix_subscription_plan_code", "subscription", ["plan_code"])
        op.create_index("ix_subscription_status", "subscription", ["status"])
        op.create_index(
            "ix_subscription_provider_customer_id", "subscription", ["provider_customer_id"]
        )
        op.create_index(
            "ix_subscription_provider_subscription_id",
            "subscription",
            ["provider_subscription_id"],
        )

    if not inspector.has_table("usagerecord"):
        op.create_table(
            "usagerecord",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("kind", sa.String(length=40), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("model", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_micros", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("period_key", sa.String(length=7), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_usagerecord_user_id", "usagerecord", ["user_id"])
        op.create_index("ix_usagerecord_kind", "usagerecord", ["kind"])
        op.create_index("ix_usagerecord_period_key", "usagerecord", ["period_key"])
        # The question asked on every generation is "how much has this account
        # used this month", so that pair gets its own index.
        op.create_index("ix_usagerecord_user_period", "usagerecord", ["user_id", "period_key"])

    if not inspector.has_table("billingevent"):
        op.create_table(
            "billingevent",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("provider_event_id", sa.String(length=200), nullable=False),
            sa.Column("event_type", sa.String(length=80), nullable=False),
            sa.Column("received_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "provider", "provider_event_id", name="uq_billingevent_provider_event"
            ),
        )
        op.create_index("ix_billingevent_provider_event_id", "billingevent", ["provider_event_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("billingevent", "usagerecord", "subscription"):
        if inspector.has_table(table):
            op.drop_table(table)
    if inspector.has_table("user") and "ai_credits_period" in _column_names("user"):
        with op.batch_alter_table("user") as batch_op:
            batch_op.drop_column("ai_credits_period")
