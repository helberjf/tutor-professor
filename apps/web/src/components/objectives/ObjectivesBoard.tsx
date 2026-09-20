'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Plus, Sparkles, Target } from 'lucide-react';

import { api, ApiError, type Objective, type StudyPlan } from '@/lib/api';
import { ObjectiveCard } from './ObjectiveCard';
import { ObjectiveProgressBar } from './ObjectiveProgressBar';
import { PlanPanel } from './PlanPanel';
import { t } from '@/lib/i18n';

// Dois diálogos que só existem depois de um clique. Estaticamente importados,
// o assistente de plano inteiro descia junto com a lista de objetivos.
const CreateObjectiveModal = dynamic(
  () => import('./CreateObjectiveModal').then((m) => m.CreateObjectiveModal),
  { ssr: false },
);
const CreatePlanWizard = dynamic(
  () => import('./CreatePlanWizard').then((m) => m.CreatePlanWizard),
  { ssr: false },
);

/** Active objectives first, then archived, each keeping the backend's order. */
function sortObjectives(objectives: Objective[]) {
  return [...objectives].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'archived' ? 1 : -1;
    return 0;
  });
}

export function ObjectivesBoard() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  // False when the server has objectives but not plans yet: the plan button hides.
  const [plansAvailable, setPlansAvailable] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serverOutdated, setServerOutdated] = useState(false);
  const [creating, setCreating] = useState(false);
  // null: closed. { plan: null }: new plan. { plan }: revising that plan.
  const [planWizard, setPlanWizard] = useState<{ plan: StudyPlan | null } | null>(null);

  const load = useCallback(async (includeArchived: boolean) => {
    setLoading(true);
    setError('');
    setServerOutdated(false);
    try {
      const [data, loadedPlans] = await Promise.all([
        api.getObjectives({ includeArchived }),
        api.getPlans({ includeArchived }).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
      ]);
      setObjectives(sortObjectives(data));
      setPlans(loadedPlans ?? []);
      setPlansAvailable(loadedPlans !== null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        setServerOutdated(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : t("Não foi possível carregar seus objetivos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(showArchived);
  }, [load, showArchived]);

  const visible = useMemo(
    () => (showArchived ? objectives : objectives.filter((objective) => objective.status === 'active')),
    [objectives, showArchived],
  );

  const active = useMemo(
    () => objectives.filter((objective) => objective.status === 'active'),
    [objectives],
  );

  const visiblePlans = useMemo(
    () => (showArchived ? plans : plans.filter((plan) => plan.status === 'active')),
    [plans, showArchived],
  );

  // A plan's priorities live inside its panel; only the rest are listed below.
  const looseObjectives = useMemo(() => {
    const planIds = new Set(plans.map((plan) => plan.id));
    return visible.filter((objective) => objective.plan_id == null || !planIds.has(objective.plan_id));
  }, [visible, plans]);

  const averagePercent = active.length
    ? Math.round(active.reduce((total, objective) => total + objective.progress_percent, 0) / active.length)
    : 0;
  const achievedCount = active.filter((objective) => objective.progress_percent >= 100 && objective.item_count > 0).length;
  const pendingItems = active.reduce(
    (total, objective) => total + (objective.item_count - objective.done_count),
    0,
  );
  const canPlan = plansAvailable && !serverOutdated;

  function replaceObjective(updated: Objective) {
    setObjectives((previous) => {
      const next = previous.map((objective) => (objective.id === updated.id ? updated : objective));
      // An objective just archived leaves the list unless archived ones are shown.
      return sortObjectives(
        showArchived ? next : next.filter((objective) => objective.status === 'active'),
      );
    });
  }

  function removeObjective(objectiveId: number) {
    setObjectives((previous) => previous.filter((item) => item.id !== objectiveId));
  }

  function handlePlanChanged(updated: StudyPlan) {
    const previous = plans.find((plan) => plan.id === updated.id);
    setPlans((list) => list.map((plan) => (plan.id === updated.id ? updated : plan)));
    // Archiving a plan takes its priorities out of the active list, and back.
    if (previous && previous.status !== updated.status) void load(showArchived);
  }

  function handlePlanDeleted(planId: number) {
    setPlans((list) => list.filter((plan) => plan.id !== planId));
    // Its objectives were either deleted or became standalone ones.
    void load(showArchived);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.6rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Alcance geral")}</p>
            <p className="mt-1 text-3xl font-black text-slate-800">{averagePercent}%</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {active.length === 0
                ? t("Nenhum objetivo ativo ainda.")
                : `${active.length} ${active.length === 1 ? 'objetivo ativo' : 'objetivos ativos'} · ${achievedCount} ${achievedCount === 1 ? 'conquistado' : 'conquistados'} · ${pendingItems} ${pendingItems === 1 ? 'item pendente' : 'itens pendentes'}`}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {canPlan ? (
              <button
                type="button"
                onClick={() => setPlanWizard({ plan: null })}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-800"
              >
                <Sparkles size={18} /> {t("Criar plano")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={serverOutdated}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-dark px-5 py-3 text-sm font-black text-white transition hover:bg-primary-dark"
            >
              <Plus size={18} /> {t("Novo objetivo")}
            </button>
          </div>
        </div>

        {active.length > 0 ? (
          <div className="mt-4">
            <ObjectiveProgressBar percent={averagePercent} label={t("Alcance médio dos objetivos ativos")} />
          </div>
        ) : null}

        <label className="mt-4 flex w-fit items-center gap-2 text-sm font-bold text-slate-500">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            disabled={serverOutdated}
            className="h-4 w-4 rounded border-2 border-slate-300 accent-sky-600"
          />
          {t("Mostrar arquivados")}
        </label>
      </section>

      {error ? (
        <p role="alert" className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </p>
      ) : null}

      {serverOutdated ? (
        <section role="alert" className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <h2 className="font-black">{t("Os objetivos ainda não chegaram ao servidor")}</h2>
          <p className="mt-1 font-semibold leading-6">
            {t("Esta tela já está no aplicativo, mas o servidor ainda está em uma versão anterior. Tente novamente mais tarde ou continue pela lição e pela revisão.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 font-black">
            <Link href="/lesson" className="rounded-xl bg-amber-700 px-3 py-2 text-white hover:bg-amber-800">{t("Abrir a lição")}</Link>
            <Link href="/review" className="rounded-xl border-2 border-amber-300 px-3 py-2 text-amber-950 hover:bg-amber-100">{t("Ir para a revisão")}</Link>
          </div>
        </section>
      ) : null}

      {loading ? (
        <p className="text-sm font-semibold text-slate-500">{t("Carregando objetivos...")}</p>
      ) : serverOutdated ? null : (
        <>
          {visiblePlans.map((plan) => (
            <PlanPanel
              key={plan.id}
              plan={plan}
              onChanged={handlePlanChanged}
              onDeleted={handlePlanDeleted}
              onRevise={(target) => setPlanWizard({ plan: target })}
              onObjectiveChanged={replaceObjective}
              onObjectiveDeleted={removeObjective}
            />
          ))}

          {looseObjectives.length === 0 && visiblePlans.length === 0 ? (
            <section className="rounded-[1.6rem] border-2 border-dashed border-slate-200 bg-white p-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Target size={28} />
              </span>
              <h2 className="mt-4 text-lg font-black text-slate-800">{t("Defina seu primeiro objetivo")}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
                {t("Escreva aonde quer chegar e liste o que precisa estudar para isso. Cada dia de estudo conclui o próximo item da área correspondente, e você pode marcar o que quiser à mão. Sem saber por onde começar? Crie um plano: ele ordena as prioridades para você.")}
              </p>
              <div className="mx-auto mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                {canPlan ? (
                  <button
                    type="button"
                    onClick={() => setPlanWizard({ plan: null })}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-800"
                  >
                    <Sparkles size={18} /> {t("Criar plano")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-dark px-5 py-3 text-sm font-black text-white transition hover:bg-primary-dark"
                >
                  <Plus size={18} /> {t("Criar objetivo")}
                </button>
              </div>
            </section>
          ) : null}

          {looseObjectives.length > 0 ? (
            <div className="space-y-4">
              {visiblePlans.length > 0 ? (
                <p className="px-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Outros objetivos")}</p>
              ) : null}
              {looseObjectives.map((objective) => (
                <ObjectiveCard
                  key={objective.id}
                  objective={objective}
                  onChanged={replaceObjective}
                  onDeleted={removeObjective}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      {creating ? (
        <CreateObjectiveModal
          onClose={() => setCreating(false)}
          onCreated={(objective) => {
            setObjectives((previous) => sortObjectives([...previous, objective]));
            setCreating(false);
          }}
        />
      ) : null}

      {planWizard ? (
        <CreatePlanWizard
          plan={planWizard.plan}
          onClose={() => setPlanWizard(null)}
          onSaved={() => {
            setPlanWizard(null);
            void load(showArchived);
          }}
        />
      ) : null}
    </div>
  );
}
