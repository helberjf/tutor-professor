'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';

import { api, ApiError, type Objective } from '@/lib/api';
import { CreateObjectiveModal } from './CreateObjectiveModal';
import { ObjectiveCard } from './ObjectiveCard';
import { ObjectiveProgressBar } from './ObjectiveProgressBar';

/** Active objectives first, then archived, each keeping the backend's order. */
function sortObjectives(objectives: Objective[]) {
  return [...objectives].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'archived' ? 1 : -1;
    return 0;
  });
}

export function ObjectivesBoard() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (includeArchived: boolean) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getObjectives({ includeArchived });
      setObjectives(sortObjectives(data));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar seus objetivos.');
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

  const averagePercent = active.length
    ? Math.round(active.reduce((total, objective) => total + objective.progress_percent, 0) / active.length)
    : 0;
  const achievedCount = active.filter((objective) => objective.progress_percent >= 100 && objective.item_count > 0).length;
  const pendingItems = active.reduce(
    (total, objective) => total + (objective.item_count - objective.done_count),
    0,
  );

  function replaceObjective(updated: Objective) {
    setObjectives((previous) => {
      const next = previous.map((objective) => (objective.id === updated.id ? updated : objective));
      // An objective just archived leaves the list unless archived ones are shown.
      return sortObjectives(
        showArchived ? next : next.filter((objective) => objective.status === 'active'),
      );
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.6rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Alcance geral</p>
            <p className="mt-1 text-3xl font-black text-slate-800">{averagePercent}%</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {active.length === 0
                ? 'Nenhum objetivo ativo ainda.'
                : `${active.length} ${active.length === 1 ? 'objetivo ativo' : 'objetivos ativos'} · ${achievedCount} ${achievedCount === 1 ? 'conquistado' : 'conquistados'} · ${pendingItems} ${pendingItems === 1 ? 'item pendente' : 'itens pendentes'}`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-white transition hover:bg-primary-dark"
          >
            <Plus size={18} /> Novo objetivo
          </button>
        </div>

        {active.length > 0 ? (
          <div className="mt-4">
            <ObjectiveProgressBar percent={averagePercent} label="Alcance médio dos objetivos ativos" />
          </div>
        ) : null}

        <label className="mt-4 flex w-fit items-center gap-2 text-sm font-bold text-slate-500">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="h-4 w-4 rounded border-2 border-slate-300 accent-sky-600"
          />
          Mostrar arquivados
        </label>
      </section>

      {error ? (
        <p role="alert" className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm font-semibold text-slate-500">Carregando objetivos...</p>
      ) : visible.length === 0 ? (
        <section className="rounded-[1.6rem] border-2 border-dashed border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            <Target size={28} />
          </span>
          <h2 className="mt-4 text-lg font-black text-slate-800">Defina seu primeiro objetivo</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
            Escreva aonde quer chegar e liste o que precisa estudar para isso. A cada item concluído a
            porcentagem de alcance sobe.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mx-auto mt-5 flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-white transition hover:bg-primary-dark"
          >
            <Plus size={18} /> Criar objetivo
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {visible.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              onChanged={replaceObjective}
              onDeleted={(objectiveId) =>
                setObjectives((previous) => previous.filter((item) => item.id !== objectiveId))
              }
            />
          ))}
        </div>
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
    </div>
  );
}
