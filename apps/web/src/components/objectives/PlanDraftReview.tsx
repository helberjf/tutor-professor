'use client';

import { Archive, ArrowRight, Ban, Check, RotateCcw, X } from 'lucide-react';

import type { Objective, PlanDraft } from '@/lib/api';
import { areaChipClass, areaLabel } from './objective-areas';
import type { RevisionDiff } from './plan-helpers';

interface Props {
  draft: PlanDraft;
  title: string;
  onTitleChange: (title: string) => void;
  chosen: ReadonlySet<number>;
  onTogglePriority: (index: number) => void;
  removedItems: Readonly<Record<number, ReadonlySet<number>>>;
  onToggleItem: (priorityIndex: number, itemIndex: number) => void;
  /** Only when revising: what changes against the current plan. */
  diff?: RevisionDiff | null;
  archive?: ReadonlySet<number>;
  onToggleArchive?: (objectiveId: number) => void;
}

/**
 * The draft before anything is saved.
 *
 * Every priority can be left out and every item removed, because a plan the
 * learner did not choose is a plan they will not follow. In a revision the
 * same screen says what continues, what is new and what leaves the plan.
 */
export function PlanDraftReview({
  draft,
  title,
  onTitleChange,
  chosen,
  onTogglePriority,
  removedItems,
  onToggleItem,
  diff = null,
  archive,
  onToggleArchive,
}: Props) {
  const keptById = new Map<number, Objective>();
  for (const change of diff?.changes ?? []) {
    if (change.kind === 'kept') keptById.set(change.index, change.objective);
  }

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Nome do plano</span>
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          maxLength={120}
          className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-black text-slate-800 outline-none focus:border-primary"
        />
      </label>

      <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Maior gargalo</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{draft.diagnosis}</p>
        {draft.focus ? (
          <p className="mt-2 text-sm font-bold leading-6 text-indigo-800">Foco: {draft.focus}</p>
        ) : null}
      </section>

      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          Prioridades, na ordem sugerida
        </p>
        <ol className="mt-3 space-y-3">
          {draft.priorities.map((priority, index) => {
            const selected = chosen.has(index);
            const kept = keptById.get(index);
            const removed = removedItems[index];
            return (
              <li
                key={`${priority.title}-${index}`}
                className={`rounded-2xl border-2 p-4 transition ${
                  selected ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={`${selected ? 'Deixar de fora' : 'Incluir'} ${priority.title}`}
                    onClick={() => onTogglePriority(index)}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${
                      selected ? 'border-primary-dark bg-primary-dark text-white' : 'border-slate-300 bg-white text-transparent'
                    }`}
                  >
                    <Check size={15} strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-400">{index + 1}.</span>
                      <span aria-hidden="true">{priority.icon_emoji || kept?.icon_emoji || '🎯'}</span>
                      <h4 className="text-sm font-black text-slate-800 sm:text-base">{priority.title}</h4>
                      {diff ? (
                        kept ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[0.68rem] font-black text-sky-700">
                            <RotateCcw size={11} /> Continua · {kept.progress_percent}%
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-black text-emerald-700">
                            Nova
                          </span>
                        )
                      ) : null}
                    </div>
                    {priority.why ? (
                      <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{priority.why}</p>
                    ) : null}

                    {kept ? (
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        Os itens atuais continuam como estão ({kept.done_count} de {kept.item_count} concluídos).
                        {priority.items.length ? ' Itens novos:' : ' Nenhum item novo.'}
                      </p>
                    ) : null}

                    {priority.items.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {priority.items.map((item, itemIndex) => {
                          const isRemoved = removed?.has(itemIndex) ?? false;
                          return (
                            <li
                              key={`${item.title}-${itemIndex}`}
                              className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-bold ${isRemoved ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                  {item.title}
                                </p>
                                {item.notes && !isRemoved ? (
                                  <p className="mt-0.5 text-xs font-medium leading-5 text-slate-500">{item.notes}</p>
                                ) : null}
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-black ${areaChipClass(item.area)}`}>
                                    {areaLabel(item.area)}
                                  </span>
                                  {item.weight > 1 ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-black text-slate-500">
                                      peso {item.weight}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {selected ? (
                                <button
                                  type="button"
                                  onClick={() => onToggleItem(index, itemIndex)}
                                  aria-label={`${isRemoved ? 'Manter' : 'Remover'} ${item.title}`}
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                                >
                                  {isRemoved ? <RotateCcw size={15} /> : <X size={15} />}
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {diff && diff.dropped.length ? (
        <section className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
            <Archive size={14} /> Saem do plano
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-amber-900">
            A revisão deixou estas prioridades de fora. Marcadas serão arquivadas (nada é apagado);
            desmarcadas continuam no fim do plano.
          </p>
          <ul className="mt-3 space-y-2">
            {diff.dropped.map((objective) => {
              const archiving = archive?.has(objective.id) ?? false;
              return (
                <li key={objective.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={archiving}
                    aria-label={`${archiving ? 'Manter' : 'Arquivar'} ${objective.title}`}
                    onClick={() => onToggleArchive?.(objective.id)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${
                      archiving ? 'border-amber-700 bg-amber-700 text-white' : 'border-slate-300 bg-white text-transparent'
                    }`}
                  >
                    <Check size={15} strokeWidth={3} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{objective.title}</span>
                  <span className="text-xs font-black text-slate-500">{objective.progress_percent}%</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {draft.avoid.length ? (
        <section>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            <Ban size={14} /> Não priorizar agora
          </p>
          <ul className="mt-2 space-y-1.5">
            {draft.avoid.map((entry) => (
              <li key={entry.title} className="rounded-xl bg-rose-50 px-3 py-2 text-sm">
                <span className="font-black text-rose-700">{entry.title}</span>
                {entry.reason ? <span className="font-medium text-slate-600"> — {entry.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft.shortest_path.length ? (
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Caminho mais curto</p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5">
            {draft.shortest_path.map((step, index) => (
              <li key={`${step}-${index}`} className="flex items-center gap-1.5">
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">{step}</span>
                {index < draft.shortest_path.length - 1 ? (
                  <ArrowRight size={13} className="text-slate-400" aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
