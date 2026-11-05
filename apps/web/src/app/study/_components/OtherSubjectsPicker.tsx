'use client';

import { ChevronDown, Code2, Layers, Loader2, Plus, Trash2 } from 'lucide-react';

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
  disciplines, selectedValue, codingEnabled, loading = false, onSelect, onCreateDiscipline, onDeleteDiscipline,
}: {
  disciplines: StudyDiscipline[];
  selectedValue: DisciplineSelection;
  codingEnabled: boolean;
  loading?: boolean;
  onSelect: (value: DisciplineSelection) => void;
  onCreateDiscipline: () => void;
  /** Present when the selected entry is a discipline that can be removed. */
  onDeleteDiscipline?: () => void;
}) {
  const empty = disciplines.length === 0 && !codingEnabled;
  const selected = disciplines.find((item) => selectedValue === `discipline:${item.id}`);
  return (
    <div className="discipline-picker mb-6 rounded-3xl p-4 sm:p-5">
      <label
        htmlFor="other-subjects-picker"
        className="mb-1 block text-sm font-black text-slate-800"
      >
        {translate("Disciplina")}
      </label>
      <p id="discipline-picker-hint" className="mb-4 text-sm font-medium text-slate-500">
        {translate("Selecione onde continuar seus estudos.")}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <span aria-hidden className="discipline-picker-icon pointer-events-none absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-xl">
            {loading ? <Loader2 size={20} className="animate-spin" />
              : selected?.icon_emoji || (selectedValue === 'coding' ? <Code2 size={22} /> : <Layers size={22} />)}
          </span>
          <select
            id="other-subjects-picker"
            aria-label={translate("Abrir lista de disciplinas")}
            aria-describedby="discipline-picker-hint"
            aria-busy={loading}
            value={selectedValue}
            disabled={empty || loading}
            onChange={(event) => onSelect(event.target.value as DisciplineSelection)}
            className="discipline-picker-select min-h-16 w-full min-w-0 cursor-pointer appearance-none truncate rounded-2xl py-5 pl-16 pr-12 text-base font-black outline-none transition disabled:cursor-default sm:text-lg"
          >
            {selectedValue === '' && (
              <option value="">{loading ? translate("Carregando") : empty ? translate("Nenhuma disciplina ainda") : translate("Escolha uma disciplina")}</option>
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
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-primary"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCreateDiscipline}
            aria-label={translate("Criar nova disciplina")}
            className="discipline-picker-create flex min-h-12 flex-1 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition sm:flex-none"
          >
            <Plus size={18} /> {translate("Nova disciplina")}
          </button>
          {onDeleteDiscipline && !loading && (
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
