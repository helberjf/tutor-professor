'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Sparkles } from 'lucide-react';
import { ApiError, api, type BillingPlan, type BillingSubscription } from '@/lib/api';

const UNLIMITED = -1;

function formatPrice(plan: BillingPlan): string {
  if (plan.price_cents === 0) return 'Gratuito';
  const value = (plan.price_cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: plan.currency,
  });
  return `${value}/${plan.interval === 'year' ? 'ano' : 'mes'}`;
}

function formatLimit(value: number, singular: string, plural: string): string {
  if (value === UNLIMITED) return `${plural} ilimitados`;
  return `${value} ${value === 1 ? singular : plural}`;
}

const STATUS_LABEL: Record<string, string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
};

export function BillingSection() {
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [current, catalogue] = await Promise.all([
        api.getMySubscription(),
        api.listBillingPlans(),
      ]);
      setSubscription(current);
      setPlans(catalogue);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel carregar o plano.');
    }
  }

  useEffect(() => {
    void load();
    // Loading once on mount is deliberate: the plan does not change while the
    // page is open unless this component itself changes it, and it reloads then.
  }, []);

  async function choose(plan: BillingPlan) {
    setBusyPlan(plan.code);
    setError('');
    setMessage('');
    try {
      const result = await api.startCheckout(plan.code);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }
      setMessage(result.detail);
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? (cause.detail ?? cause.message)
          : 'Nao foi possivel mudar de plano.',
      );
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <section className="kid-surface mb-6 border-amber-200 p-5 md:p-8">
      <div className="flex items-center gap-3">
        <CreditCard className="text-amber-600" size={28} />
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Assinatura</p>
          <h2 className="text-2xl font-black text-slate-800 md:text-3xl">Seu plano</h2>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>
      ) : null}

      {subscription === null ? (
        <div className="mt-6 flex items-center justify-center rounded-2xl border-2 border-slate-100 bg-white p-8">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-[1.25rem] border-2 border-slate-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xl font-black text-slate-800">{subscription.plan.name}</p>
                <p className="text-sm font-semibold text-slate-500">
                  {formatPrice(subscription.plan)} ·{' '}
                  {STATUS_LABEL[subscription.status] ?? subscription.status}
                </p>
              </div>
              {subscription.trial_ends_at ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                  Teste ate {new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR')}
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="Criancas" value={String(subscription.children_used)} />
              <Metric
                label="Geracoes no mes"
                value={String(subscription.generations_used)}
              />
              <Metric
                label="Custo de IA no mes"
                value={(subscription.month_cost_cents / 100).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: subscription.plan.currency,
                })}
              />
            </div>
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => {
              const isCurrent = plan.code === subscription.plan.code;
              return (
                <li
                  key={plan.code}
                  className={`rounded-[1.25rem] border-2 p-4 ${
                    isCurrent ? 'border-primary bg-primary-light/40' : 'border-slate-100 bg-white'
                  }`}
                >
                  <p className="text-lg font-black text-slate-800">{plan.name}</p>
                  <p className="text-sm font-black text-primary-dark">{formatPrice(plan)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">{plan.description}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    {formatLimit(plan.max_children, 'crianca', 'criancas')} ·{' '}
                    Creditos de IA definidos diariamente pelo administrador
                  </p>
                  {isCurrent ? (
                    <p className="mt-4 text-sm font-black text-primary-dark">Plano atual</p>
                  ) : plan.price_cents === 0 ? null : (
                    <button
                      type="button"
                      onClick={() => void choose(plan)}
                      disabled={busyPlan !== null}
                      className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-white transition hover:bg-primary-dark disabled:opacity-60"
                    >
                      {busyPlan === plan.code ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      {plan.trial_days > 0 ? `Testar ${plan.trial_days} dias` : 'Assinar'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-800">{value}</p>
    </div>
  );
}
