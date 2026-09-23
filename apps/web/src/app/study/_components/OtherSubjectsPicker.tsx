'use client';

import { ChevronDown, Layers, Plus, Trash2 } from 'lucide-react';

import type { StudyDiscipline } from '@/lib/api';
import { t as translate } from '@/lib/i18n';

/** What the picker points at: programming, or one of the other disciplines. */
export type DisciplineSelection = 'coding' | `discipline:${number}` | '';

/**
 * "Outras disciplinas" opens one discipline at a time. Programming is one of
 * them (with its LeetCode trainer); Francês or Direito are others, created
 * here, and each holds its own subjects the way programming holds Python.
 */
export function OtherSubjectsPicker({
  disciplines, selectedValue, codingEnabled, onSelect, onCreateDiscipline, onDeleteDiscipline,
}: {
  disciplines: StudyDiscipline[];
  selectedValue: DisciplineSelection;
  codingEnabled: boolean;
  onSelect: (value: DisciplineSelection) => void;
  onCreateDiscipline: () => void;
  /** Present when the selected entry is a discipline that can be removed. */
  onDeleteDiscipline?: () => void;
}) {
  const empty = disciplines.length === 0 && !codingEnabled;
  return (
    <div className="mb-6 rounded-[1.1rem] border-2 border-slate-100 bg-white/80 p-3 sm:rounded-[1.4rem] sm:p-4">
      <label
        htmlFor="other-subjects-picker"
        className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400"
      >
        {translate("Abrir lista de disciplinas")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Layers
            size={18}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <select
            id="other-subjects-picker"
            value={selectedValue}
            disabled={empty}
            onChange={(event) => onSelect(event.target.value as DisciplineSelection)}
            className="min-h-12 w-full cursor-pointer appearance-none rounded-2xl border-2 border-slate-200 bg-white pl-11 pr-11 text-sm font-bold text-slate-700 outline-none transition hover:border-slate-300 focus:border-primary disabled:cursor-default disabled:opacity-70"
          >
            {selectedValue === '' && (
              <option value="">{empty ? translate("Nenhuma disciplina ainda") : translate("Escolha uma disciplina")}</option>
            )}
            {disciplines.map((discipline) => (
              <option key={discipline.id} value={`discipline:${discipline.id}`}>
                {discipline.icon_emoji ? `${discipline.icon_emoji} ` : ''}{discipline.name}
              </option>
            ))}
            {codingEnabled ? <option value="coding">{translate("Programação")}</option> : null}
          </select>
          <ChevronDown
            size={18}
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCreateDiscipline}
            className="flex min-h-12 flex-1 shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary-dark px-5 text-sm font-black text-white transition hover:bg-primary sm:flex-none"
          >
            {translate("Criar nova disciplina")} <Plus size={18} />
          </button>
          {onDeleteDiscipline && (
            <button
              type="button"
              onClick={onDeleteDiscipline}
              aria-label={translate("Excluir disciplina")}
              title={translate("Excluir disciplina")}
              className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-rose-100 bg-white text-rose-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
