"""Plans, limits and what an account has spent.

The plan catalogue lives in code rather than in a table on purpose. Prices and
limits change through a deploy, which is reviewable and revertable; a row edited
in production at 2am is neither. The gateway keeps its own copy of the prices —
this side only needs to know what each plan allows.

Nothing here talks to a payment gateway. An account with no subscription row is
on the free plan, so the whole app works with billing switched off, and turning
a gateway on later changes which plan an account is on, not how limits work.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

PLAN_FREE = "free"
PLAN_FAMILY = "family"
PLAN_STUDY = "study"
PLAN_SCHOOL = "school"

SUBSCRIPTION_TRIALING = "trialing"
SUBSCRIPTION_ACTIVE = "active"
SUBSCRIPTION_PAST_DUE = "past_due"
SUBSCRIPTION_CANCELED = "canceled"
# The states that still entitle an account to its plan. past_due is deliberately
# included: a card that failed this morning should not lock a child out of their
# lesson before the gateway has finished retrying.
ENTITLED_STATUSES = (SUBSCRIPTION_TRIALING, SUBSCRIPTION_ACTIVE, SUBSCRIPTION_PAST_DUE)

UNLIMITED = -1


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    description: str
    price_cents: int
    currency: str = "BRL"
    interval: str = "month"
    max_children: int = 1
    monthly_ai_generations: int = 0
    trial_days: int = 0
    is_public: bool = True

    @property
    def is_free(self) -> bool:
        return self.price_cents == 0


PLANS: tuple[Plan, ...] = (
    Plan(
        code=PLAN_FREE,
        name="Gratuito",
        description=(
            "Uma crianca, licoes e revisao. A IA com Gemini usa o limite diario "
            "definido para a conta."
        ),
        price_cents=0,
        max_children=1,
        monthly_ai_generations=0,
    ),
    Plan(
        code=PLAN_FAMILY,
        name="Familia",
        description="Ate 3 criancas, com o mesmo controle diario de IA da conta.",
        price_cents=3490,
        max_children=3,
        monthly_ai_generations=300,
        trial_days=14,
    ),
    Plan(
        code=PLAN_STUDY,
        name="Estudo",
        description="Criancas ilimitadas e controle diario de IA pelo administrador.",
        price_cents=6900,
        max_children=UNLIMITED,
        monthly_ai_generations=1500,
        trial_days=14,
    ),
    Plan(
        code=PLAN_SCHOOL,
        name="Escola",
        description="Turmas, painel do professor e cobranca anual por assento.",
        price_cents=0,  # quoted per seat; not self-serve
        max_children=UNLIMITED,
        monthly_ai_generations=UNLIMITED,
        is_public=False,
    ),
)

PLANS_BY_CODE: dict[str, Plan] = {plan.code: plan for plan in PLANS}
DEFAULT_PLAN = PLANS_BY_CODE[PLAN_FREE]


def get_plan(code: str | None) -> Plan:
    """The plan for a code, falling back to free.

    A code that no longer exists — a plan retired between deploys — must not
    turn into a crash on every request the account makes.
    """

    return PLANS_BY_CODE.get((code or "").strip().lower(), DEFAULT_PLAN)


def public_plans() -> list[Plan]:
    return [plan for plan in PLANS if plan.is_public]


def period_key(moment: datetime | None = None) -> str:
    """The bucket a usage line belongs to: "2026-09"."""

    now = moment or datetime.utcnow()
    return f"{now.year:04d}-{now.month:02d}"


@dataclass
class Entitlement:
    """What an account may do right now."""

    plan: Plan
    status: str
    trial_ends_at: datetime | None = None
    current_period_end: datetime | None = None
    generations_used: int = 0
    children_count: int = 0
    warnings: list[str] = field(default_factory=list)

    @property
    def is_entitled(self) -> bool:
        return self.status in ENTITLED_STATUSES

    @property
    def generations_remaining(self) -> int:
        if self.plan.monthly_ai_generations == UNLIMITED:
            return UNLIMITED
        return max(0, self.plan.monthly_ai_generations - self.generations_used)

    def may_add_child(self) -> bool:
        if not self.is_entitled:
            return False
        if self.plan.max_children == UNLIMITED:
            return True
        return self.children_count < self.plan.max_children

    def may_generate(self) -> bool:
        if not self.is_entitled:
            return False
        if self.plan.monthly_ai_generations == UNLIMITED:
            return True
        return self.generations_used < self.plan.monthly_ai_generations


def effective_status(
    *,
    stored_status: str | None,
    trial_ends_at: datetime | None,
    now: datetime | None = None,
) -> str:
    """Read the status as of this moment.

    A trial that ran out is over whether or not the gateway has told us yet, so
    the expiry is decided here rather than waiting for a webhook that might be
    late or never arrive.
    """

    status = (stored_status or SUBSCRIPTION_ACTIVE).strip().lower()
    if status != SUBSCRIPTION_TRIALING:
        return status
    if trial_ends_at is None:
        return status
    return status if trial_ends_at > (now or datetime.utcnow()) else SUBSCRIPTION_CANCELED


def upgrade_message(plan: Plan, reason: str) -> str:
    if reason == "children":
        limit = "ilimitadas" if plan.max_children == UNLIMITED else plan.max_children
        return (
            f"Seu plano {plan.name} permite {limit} criancas. "
            "Mude de plano em Configuracoes para adicionar mais."
        )
    if reason == "generations":
        return (
            f"Voce usou todas as geracoes por IA do plano {plan.name} neste mes. "
            "Voce pode usar sua propria chave de IA ou mudar de plano."
        )
    if reason == "inactive":
        return "Sua assinatura nao esta ativa. Atualize o pagamento para continuar."
    return "Seu plano nao permite esta acao."
