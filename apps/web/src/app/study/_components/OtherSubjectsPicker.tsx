'use client';

import { ChevronDown, Layers } from 'lucide-react';

import { t as translate } from '@/lib/i18n';

/**
 * "Outras matérias" holds two lists studied the same way: the general subjects
 * and, once the module is switched on, programming. The subjects themselves are
 * chosen inside the list, like in programming, so this only picks the list.
 */
export function OtherSubjectsPicker({
  selectedValue, onSelectGeneral, onSelectCoding,
}: {
  selectedValue: 'general' | 'coding';
  onSelectGeneral: () => void;
  onSelectCoding: () => void;
}) {
  return (
    <div className="mb-6 rounded-[1.1rem] border-2 border-slate-100 bg-white/80 p-3 sm:rounded-[1.4rem] sm:p-4">
      <label
        htmlFor="other-subjects-picker"
        className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400"
      >
        {translate("Abrir lista")}
      </label>
      <div className="relative">
        <Layers
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <select
          id="other-subjects-picker"
          value={selectedValue}
          onChange={(event) => {
            if (event.target.value === 'coding') onSelectCoding();
            else onSelectGeneral();
          }}
          className="min-h-12 w-full cursor-pointer appearance-none rounded-2xl border-2 border-slate-200 bg-white pl-11 pr-11 text-sm font-bold text-slate-700 outline-none transition hover:border-slate-300 focus:border-primary"
        >
          <option value="general">{translate("Matérias gerais")}</option>
          <option value="coding">{translate("Programação")}</option>
        </select>
        <ChevronDown
          size={18}
          aria-hidden
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </div>
  );
}
