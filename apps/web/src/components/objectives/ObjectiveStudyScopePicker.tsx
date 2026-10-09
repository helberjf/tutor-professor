'use client';

import { useId, useState } from 'react';
import type { ObjectiveStudyScope, ObjectiveStudyScopeInput } from '@/lib/api';
import { t, tf } from '@/lib/i18n';
import { filterStudyTargets, MAX_STUDY_TARGETS, missingStudyTargets, toggleStudyTarget } from './objective-study-helpers';
import { useObjectiveStudyOptions } from './ObjectiveStudyOptions';

interface Props {
  value: ObjectiveStudyScopeInput | null;
  onChange: (value: ObjectiveStudyScopeInput | null) => void;
  savedScope?: ObjectiveStudyScope | null;
  disabled?: boolean;
}

export function ObjectiveStudyScopePicker({ value, onChange, savedScope, disabled = false }: Props) {
  const { options, loading, error, reload } = useObjectiveStudyOptions();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const id = useId();
  const discipline = options?.disciplines.find((item) => item.key === value?.discipline_key);
  const subjects = [...new Set(discipline?.targets.map((target) => target.subject).filter((name): name is string => !!name) ?? [])];
  const visible = filterStudyTargets(discipline?.targets ?? [], query, subject);
  const missing = missingStudyTargets(value, options, savedScope);
  const controlClass = 'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-primary disabled:opacity-50';

  function toggle(key: string) {
    if (value) onChange({ ...value, target_keys: toggleStudyTarget(value.target_keys, key) });
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 rounded-2xl border-2 border-sky-100 bg-sky-50/40 p-4">
      <legend className="px-1 text-sm font-black text-slate-700">{t('Disciplina e tópicos do objetivo')}</legend>
      <p className="mb-3 text-xs font-medium leading-5 text-slate-500">{t('Escolha os estudos que a IA deve considerar para avaliar quanto falta.')}</p>
      {loading ? <p role="status" className="text-sm text-slate-500">{t('Carregando disciplinas e tópicos...')}</p> : error ? (
        <div role="alert" className="text-sm text-rose-700">
          <p>{error}</p>
          <button type="button" onClick={reload} className="mt-2 font-bold underline">{t('Tentar novamente')}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <label htmlFor={`${id}-discipline`} className="block text-xs font-bold text-slate-600">{t('Disciplina')}</label>
          <select id={`${id}-discipline`} value={value?.discipline_key ?? ''} className={controlClass}
            onChange={(event) => {
              setQuery(''); setSubject('');
              onChange(event.target.value ? { discipline_key: event.target.value, target_keys: [] } : null);
            }}>
            <option value="">{t('Sem vínculo de estudo')}</option>
            {value && !discipline ? <option value={value.discipline_key}>{savedScope?.discipline ?? value.discipline_key} ({t('indisponível')})</option> : null}
            {options?.disciplines.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
          {value ? (
            <>
              {subjects.length > 1 ? (
                <label className="block text-xs font-bold text-slate-600">
                  {t('Filtrar por matéria')}
                  <select value={subject} onChange={(event) => setSubject(event.target.value)} className={`${controlClass} mt-1`}>
                    <option value="">{t('Todas as matérias')}</option>
                    {subjects.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              ) : null}
              <input type="search" aria-label={t('Buscar tópicos')} value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Buscar tópicos')} className={controlClass} />
              <p className="text-xs font-bold text-sky-700">{tf('{count} tópicos ou assuntos selecionados', { count: value.target_keys.length })}</p>
              {value.target_keys.length >= MAX_STUDY_TARGETS ? <p className="text-xs text-slate-500">{t('Você pode selecionar até 30 tópicos por objetivo.')}</p> : null}
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl bg-white p-2">
                {visible.map((target) => (
                  <label key={target.key} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-sky-50">
                    <input type="checkbox" checked={value.target_keys.includes(target.key)} onChange={() => toggle(target.key)}
                      disabled={!target.available || disabled || (value.target_keys.length >= MAX_STUDY_TARGETS && !value.target_keys.includes(target.key))} className="mt-0.5 h-4 w-4 shrink-0 accent-sky-700" />
                    <span className="min-w-0 break-words text-sm font-semibold text-slate-700">{target.title}
                      {target.subject ? <span className="block text-xs font-normal text-slate-500">{target.subject}</span> : null}
                    </span>
                  </label>
                ))}
                {visible.length === 0 ? <p className="p-2 text-xs leading-5 text-slate-500">{t('Nenhum tópico encontrado. Cadastre tópicos ou assuntos no Controle de estudos.')}</p> : null}
                {missing.map((target) => (
                  <label key={target.key} className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                    <input type="checkbox" checked onChange={() => toggle(target.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-700" />
                    <span className="break-words">{target.title} · {t('indisponível')}</span>
                  </label>
                ))}
              </div>
              {missing.length > 0 ? <p className="text-xs font-semibold text-amber-800">{t('Remova os vínculos indisponíveis ou escolha outros tópicos antes de salvar.')}</p> : null}
            </>
          ) : null}
        </div>
      )}
    </fieldset>
  );
}
