'use client';

import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Ban,
  CalendarClock,
  ChevronDown,
  Compass,
  PlayCircle,
  RefreshCcw,
  Trash2,
  Trophy,
} from 'lucide-react';

import { api, type Objective, type StudyPlan } from '@/lib/api';
import { ObjectiveCard } from './ObjectiveCard';
import { ObjectiveProgressBar } from './ObjectiveProgressBar';
import { deadlineLabel } from './objective-areas';
import { activePriorities, archivedPriorities, isFinished, withObjective, withoutObjective } from './plan-helpers';

interface Props {
  plan: StudyPlan;
  onChanged: (plan: StudyPlan) => void;
  onDeleted: (planId: number, objectivesDeleted: boolean) => void;
  onRevise: (plan: StudyPlan) => void;
  /** Keeps the board's own objective list in step with changes made here. */
  onObjectiveChanged: (objective: Objective) => void;
  onObjectiveDeleted: (objectiveId: number) => void;
}

function daysUntil(targetDate: string | null) {
  if (!targetDate) return null;
  const [year, month, day] = targetDate.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * One plan: where it stands, what to do next, and the priorities in order.
 *
 * Only the next step is open by default. Ten open checklists is a wall; the
 * point of a plan is to say which one matters now.
 */
export function PlanPanel({ plan, onChanged, onDeleted, onRevise, onObjectiveChanged, onObjectiveDeleted }: Props) {
  const active = activePriorities(plan);
  const archived = archivedPriorities(plan);
  const next = active.find((objective) => objective.id === plan.next_objective_id) ?? null;
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(next ? [next.id] : []));
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const finished = plan.active_count > 0 && plan.next_objective_id === null;
  const deadline = deadlineLabel(daysUntil(plan.target_date), plan.target_date);

  function toggle(objectiveId: number) {
    setExpanded((previous) => {
      const updated = new Set(previous);
      if (updated.has(objectiveId)) updated.delete(objectiveId);
      else updated.add(objectiveId);
      return updated;
    });
  }

  function openNext() {
    if (!next) return;
    setExpanded((previous) => new Set(previous).add(next.id));
    requestAnimationFrame(() => {
      document.getElementById(`plan-objective-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handleObjectiveChanged(updated: Objective) {
    onObjectiveChanged(updated);
    onChanged(withObjective(plan, updated));
  }

  function handleObjectiveDeleted(objectiveId: number) {
    onObjectiveDeleted(objectiveId);
    onChanged(withoutObjective(plan, objectiveId));
  }

  async function toggleArchive() {
    setBusy(true);
    setError('');
    try {
      onChanged(await api.updatePlan(plan.id, { status: plan.status === 'archived' ? 'active' : 'archived' }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível arquivar o plano.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Excluir o plano "${plan.title}"? As prioridades continuam na sua lista como objetivos comuns.`)) return;
    const alsoObjectives = confirm(
      'Excluir também os objetivos e itens deste plano? Escolha "Cancelar" para mantê-los com o progresso atual.',
    );
    setBusy(true);
    setError('');
    try {
      await api.deletePlan(plan.id, { deleteObjectives: alsoObjectives });
      onDeleted(plan.id, alsoObjectives);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir o plano.');
      setBusy(false);
    }
  }

  function renderPriority(objective: Objective, position: number | null) {
    const open = expanded.has(objective.id);
    const done = isFinished(objective);
    const isNext = objective.id === plan.next_objective_id;
    return (
      <li key={objective.id} id={`plan-objective-${objective.id}`} className="scroll-mt-24">
        <button
          type="button"
          onClick={() => toggle(objective.id)}
          aria-expanded={open}
          className={`flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition hover:border-primary ${
            isNext ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-white'
          }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
              done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {done ? <Trophy size={15} /> : position ?? '•'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{objective.icon_emoji || '🎯'}</span>
              <span className="truncate text-sm font-black text-slate-800">{objective.title}</span>
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <ObjectiveProgressBar
                percent={objective.progress_percent}
                label={`Alcance da prioridade ${objective.title}`}
                compact
              />
              <span className="w-10 shrink-0 text-right text-xs font-black text-slate-600">
                {objective.progress_percent}%
              </span>
            </span>
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {open ? (
          <div className="mt-2">
            <ObjectiveCard
              objective={objective}
              onChanged={handleObjectiveChanged}
              onDeleted={handleObjectiveDeleted}
            />
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <section className="rounded-[1.6rem] border-2 border-indigo-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
          <Compass size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Plano{plan.revision > 1 ? ` · revisão ${plan.revision}` : ''}
            {plan.status === 'archived' ? ' · arquivado' : ''}
          </p>
          <h2 className="mt-0.5 text-lg font-black text-slate-800 sm:text-xl">{plan.title}</h2>
          {deadline ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400">
              <CalendarClock size={14} /> {deadline}
            </p>
          ) : null}
        </div>
        <p className="text-3xl font-black text-slate-800">{plan.progress_percent}%</p>
      </header>

      <div className="mt-3">
        <ObjectiveProgressBar percent={plan.progress_percent} label={`Alcance do plano ${plan.title}`} />
        <p className="mt-2 text-xs font-semibold text-slate-400">
          {plan.achieved_count} de {plan.active_count} {plan.active_count === 1 ? 'prioridade concluída' : 'prioridades concluídas'}
        </p>
      </div>

      {plan.diagnosis ? (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Maior gargalo</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{plan.diagnosis}</p>
          {plan.focus ? <p className="mt-2 text-sm font-bold leading-6 text-indigo-800">Foco: {plan.focus}</p> : null}
        </div>
      ) : null}

      {plan.status === 'active' ? (
        next ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">▶ Próximo passo</p>
              <p className="mt-1 font-black text-slate-800">
                {next.icon_emoji || '🎯'} {next.title}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                {next.item_count - next.done_count} {next.item_count - next.done_count === 1 ? 'item pendente' : 'itens pendentes'} · {next.progress_percent}% feito
              </p>
            </div>
            <button
              type="button"
              onClick={openNext}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-4 text-sm font-black text-white transition hover:bg-indigo-800"
            >
              <PlayCircle size={17} /> Continuar
            </button>
          </div>
        ) : finished ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4">
            <Trophy size={22} className="text-emerald-700" />
            <p className="text-sm font-black text-emerald-800">
              Todas as prioridades concluídas. Revise o plano para definir a próxima etapa.
            </p>
          </div>
        ) : null
      ) : null}

      <ol className="mt-4 space-y-2">
        {active.map((objective, index) => renderPriority(objective, index + 1))}
      </ol>

      {archived.length ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            aria-expanded={showArchived}
            className="text-xs font-black text-slate-500 hover:text-slate-700"
          >
            {showArchived ? 'Esconder' : 'Mostrar'} prioridades retiradas ({archived.length})
          </button>
          {showArchived ? <ul className="mt-2 space-y-2">{archived.map((objective) => renderPriority(objective, null))}</ul> : null}
        </div>
      ) : null}

      {plan.avoid.length ? (
        <div className="mt-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            <Ban size={14} /> Não priorizar agora
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {plan.avoid.map((entry) => (
              <li
                key={entry.title}
                title={entry.reason ?? undefined}
                className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700"
              >
                {entry.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.shortest_path.length ? (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Caminho mais curto</p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5">
            {plan.shortest_path.map((step, index) => (
              <li key={`${step}-${index}`} className="flex items-center gap-1.5">
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">{step}</span>
                {index < plan.shortest_path.length - 1 ? (
                  <ArrowRight size={13} className="text-slate-400" aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>
      ) : null}

      <footer className="mt-5 flex flex-wrap gap-2">
        {plan.status === 'active' ? (
          <button
            type="button"
            onClick={() => onRevise(plan)}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
          >
            <RefreshCcw size={16} /> Revisar plano
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void toggleArchive()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-bold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
        >
          {plan.status === 'archived' ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {plan.status === 'archived' ? 'Reativar' : 'Arquivar'}
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-bold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          <Trash2 size={16} /> Excluir
        </button>
      </footer>
    </section>
  );
}
