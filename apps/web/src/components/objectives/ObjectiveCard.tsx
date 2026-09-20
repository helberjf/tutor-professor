'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore, CalendarClock, Check, Loader2, Plus, Trash2, Trophy } from 'lucide-react';

import { api, type Objective, type ObjectiveArea } from '@/lib/api';
import { ObjectiveProgressBar } from './ObjectiveProgressBar';
import { areaChipClass, areaLabel, deadlineLabel, OBJECTIVE_AREAS } from './objective-areas';
import { t } from '@/lib/i18n';

interface Props {
  objective: Objective;
  onChanged: (objective: Objective) => void;
  onDeleted: (objectiveId: number) => void;
}

/**
 * One objective: the percentage on top, the study behind it underneath.
 *
 * Every write answers with the recalculated objective, so the card replaces its
 * own state with what the server returned instead of adjusting the percentage
 * locally. Two devices checking items at once then agree, and a failed request
 * leaves nothing half-applied on screen.
 */
export function ObjectiveCard({ objective, onChanged, onDeleted }: Props) {
  const [itemTitle, setItemTitle] = useState('');
  const [itemArea, setItemArea] = useState<ObjectiveArea>('free');
  const [itemWeight, setItemWeight] = useState(1);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const achieved = objective.progress_percent >= 100 && objective.item_count > 0;
  const deadline = deadlineLabel(objective.days_remaining, objective.target_date);
  const isLate = objective.days_remaining !== null && objective.days_remaining < 0 && !achieved;

  async function run<T>(action: () => Promise<T>, fallbackMessage: string): Promise<T | null> {
    setError('');
    try {
      return await action();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : fallbackMessage);
      return null;
    }
  }

  async function toggleItem(itemId: number, done: boolean) {
    setBusyItemId(itemId);
    const updated = await run(
      () => api.updateObjectiveItem(itemId, { done }),
      t("Não foi possível atualizar o item."),
    );
    if (updated) onChanged(updated);
    setBusyItemId(null);
  }

  async function removeItem(itemId: number) {
    setBusyItemId(itemId);
    const updated = await run(
      () => api.deleteObjectiveItem(itemId),
      t("Não foi possível remover o item."),
    );
    if (updated) onChanged(updated);
    setBusyItemId(null);
  }

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    const clean = itemTitle.trim();
    if (!clean) return;
    setAdding(true);
    const updated = await run(
      () => api.addObjectiveItem(objective.id, { title: clean, area: itemArea, weight: itemWeight }),
      t("Não foi possível adicionar o item."),
    );
    if (updated) {
      onChanged(updated);
      setItemTitle('');
      setItemWeight(1);
    }
    setAdding(false);
  }

  async function toggleArchive() {
    const updated = await run(
      () => api.updateObjective(objective.id, {
        status: objective.status === 'archived' ? 'active' : 'archived',
      }),
      t("Não foi possível arquivar o objetivo."),
    );
    if (updated) onChanged(updated);
  }

  async function removeObjective() {
    if (!confirm(`Excluir "${objective.title}" e todos os seus itens?`)) return;
    const result = await run(
      () => api.deleteObjective(objective.id),
      t("Não foi possível excluir o objetivo."),
    );
    if (result !== null) onDeleted(objective.id);
  }

  return (
    <article className="rounded-[1.6rem] border-2 border-slate-100 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-5">
      <header className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-xl">
          {objective.icon_emoji || '🎯'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-slate-800 sm:text-lg">{objective.title}</h3>
            {achieved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                <Trophy size={13} /> {t("Conquistado")}
              </span>
            ) : null}
            {objective.status === 'archived' ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">{t("Arquivado")}</span>
            ) : null}
          </div>

          {objective.description ? (
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{objective.description}</p>
          ) : null}

          {deadline ? (
            <p className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold ${isLate ? 'text-rose-600' : 'text-slate-400'}`}>
              <CalendarClock size={14} /> {deadline}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleArchive()}
            aria-label={objective.status === 'archived' ? t("Reativar objetivo") : t("Arquivar objetivo")}
            title={objective.status === 'archived' ? t("Reativar objetivo") : t("Arquivar objetivo")}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            {objective.status === 'archived' ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>
          <button
            type="button"
            onClick={() => void removeObjective()}
            aria-label={t("Excluir objetivo")}
            title={t("Excluir objetivo")}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <div className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Alcance")}</p>
          <p className="text-2xl font-black text-slate-800">{objective.progress_percent}%</p>
        </div>
        <div className="mt-2">
          <ObjectiveProgressBar
            percent={objective.progress_percent}
            label={`Alcance do objetivo ${objective.title}`}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-400">
          {objective.item_count === 0
            ? t("Adicione o que precisa estudar para começar a medir.")
            : `${objective.done_count} de ${objective.item_count} itens concluídos · peso ${objective.done_weight} de ${objective.total_weight}`}
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {objective.items.map((item) => {
          const busy = busyItemId === item.id;
          return (
            <li
              key={item.id}
              className={`flex items-start gap-3 rounded-2xl border-2 px-3 py-2.5 transition ${
                item.done ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100 bg-white'
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                aria-label={`${item.done ? 'Desmarcar' : 'Concluir'} ${item.title}`}
                disabled={busy}
                onClick={() => void toggleItem(item.id, !item.done)}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition disabled:opacity-50 ${
                  item.done ? 'border-emerald-500 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-transparent hover:border-primary'
                }`}
              >
                {busy ? <Loader2 size={14} className="animate-spin text-slate-500" /> : <Check size={15} strokeWidth={3} />}
              </button>

              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${item.done ? 'text-emerald-800 line-through' : 'text-slate-700'}`}>
                  {item.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-black ${areaChipClass(item.area)}`}>
                    {areaLabel(item.area)}
                  </span>
                  {item.weight > 1 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-black text-slate-500">
                      peso {item.weight}
                    </span>
                  ) : null}
                  {/* A box that ticks itself is only reassuring while it is
                      clear who ticked it. Unchecking it hands it back. */}
                  {item.auto_completed ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.68rem] font-black text-emerald-700">
                      {t("concluído estudando")}
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void removeItem(item.id)}
                disabled={busy}
                aria-label={`Remover ${item.title}`}
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
      </ul>

      <form onSubmit={addItem} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label={`Novo item de estudo para ${objective.title}`}
          value={itemTitle}
          onChange={(event) => setItemTitle(event.target.value)}
          placeholder={t("O que falta estudar?")}
          maxLength={200}
          className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
        />
        <select
          aria-label={`Área do novo item de ${objective.title}`}
          value={itemArea}
          onChange={(event) => setItemArea(event.target.value as ObjectiveArea)}
          className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
        >
          {OBJECTIVE_AREAS.map((area) => (
            <option key={area.id} value={area.id}>{area.label}</option>
          ))}
        </select>
        <select
          aria-label={`Peso do novo item de ${objective.title}`}
          value={itemWeight}
          onChange={(event) => setItemWeight(Number(event.target.value))}
          className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
        >
          {[1, 2, 3, 5, 8, 10].map((weight) => (
            <option key={weight} value={weight}>peso {weight}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={adding || !itemTitle.trim()}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-dark px-4 text-sm font-black text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("Adicionar")}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>
      ) : null}
    </article>
  );
}
