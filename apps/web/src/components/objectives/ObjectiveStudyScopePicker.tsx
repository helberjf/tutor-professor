'use client';

import { useId, useState } from 'react';
import type { ObjectiveStudyScope, ObjectiveStudyScopeInput } from '@/lib/api';
import { t, tf } from '@/lib/i18n';
import { filterStudyTargets, MAX_STUDY_TARGETS, missingStudyTargets, selectStudyTargets, toggleStudyTarget } from './objective-study-helpers';
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
  const selectable = visible.filter((target) => target.available);
  const allVisibleSelected = selectable.length > 0 && selectable.every((target) => value?.target_keys.includes(target.key));
  const [selectionLimited, setSelectionLimited] = useState(false);
  const missing = missingStudyTargets(value, options, savedScope);
  const controlClass = 'min-h-11 w-full min-w-0 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-primary disabled:opacity-50';

  function toggle(key: string) {
    setSelectionLimited(false);
    if (value) onChange({ ...value, target_keys: toggleStudyTarget(value.target_keys, key) });
  }

  function selectTargets(nextSubject: string, preserveSelection: boolean) {
    if (!value) return;
    const targets = filterStudyTargets(discipline?.targets ?? [], preserveSelection ? query : '', nextSubject);
    const selectedKeys = preserveSelection ? value.target_keys : [];
    const requestedCount = new Set([...selectedKeys, ...targets.filter((target) => target.available).map((target) => target.key)]).size;
    setSelectionLimited(requestedCount > MAX_STUDY_TARGETS);
    onChange({ ...value, target_keys: selectStudyTargets(targets, selectedKeys) });
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-strong)] p-4 sm:p-5">
      <legend className="px-1 text-sm font-bold text-[var(--text-strong)]">{t('Disciplina e tópicos do objetivo')}</legend>
      <p className="mb-4 text-xs leading-5 text-[var(--text-muted)]">{t('Escolha uma matéria para selecionar seus tópicos. Você pode ajustar a seleção abaixo.')}</p>
      {loading ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('Carregando disciplinas e tópicos...')}</p> : error ? (
        <div role="alert" className="text-sm text-rose-700">
          <p>{error}</p>
          <button type="button" onClick={reload} className="mt-2 font-bold underline">{t('Tentar novamente')}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${id}-discipline`} className="block space-y-1.5 text-xs font-bold text-[var(--text-muted)]">
          <span>{t('Disciplina')}</span>
          <select id={`${id}-discipline`} value={value?.discipline_key ?? ''} className={controlClass}
            onChange={(event) => {
              setQuery(''); setSubject(''); setSelectionLimited(false);
              onChange(event.target.value ? { discipline_key: event.target.value, target_keys: [] } : null);
            }}>
            <option value="">{t('Sem vínculo de estudo')}</option>
            {value && !discipline ? <option value={value.discipline_key}>{savedScope?.discipline ?? value.discipline_key} ({t('indisponível')})</option> : null}
            {options?.disciplines.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
          </label>
          {value && subjects.length > 0 ? (
            <label className="block space-y-1.5 text-xs font-bold text-[var(--text-muted)]">
              <span>{t('Filtrar por matéria')}</span>
              <select value={subject} onChange={(event) => {
                const nextSubject = event.target.value;
                setSubject(nextSubject); setQuery(''); selectTargets(nextSubject, false);
              }} className={controlClass}>
                <option value="">{t('Todas as matérias')}</option>
                {subjects.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          ) : null}
          </div>
          {value ? (
            <>
              <input type="search" aria-label={t('Buscar tópicos')} value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Buscar tópicos')} className={controlClass} />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p role="status" aria-live="polite" className="text-xs font-semibold text-[var(--text)]">{tf('{count} tópicos ou assuntos selecionados', { count: value.target_keys.length })}</p>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => selectTargets(subject, true)} disabled={selectable.length === 0 || allVisibleSelected || value.target_keys.length >= MAX_STUDY_TARGETS}
                    className="min-h-10 rounded-lg px-2 text-xs font-bold text-[var(--sky)] transition hover:bg-[var(--surface-tint)] disabled:cursor-default disabled:text-[var(--text-muted)]">
                    {t('Selecionar todos')}
                  </button>
                  <button type="button" onClick={() => { setSelectionLimited(false); onChange({ ...value, target_keys: [] }); }} disabled={value.target_keys.length === 0}
                    className="min-h-10 rounded-lg px-2 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] disabled:opacity-50">
                    {t('Limpar seleção')}
                  </button>
                </div>
              </div>
              {selectionLimited || value.target_keys.length >= MAX_STUDY_TARGETS ? <p role="status" className="text-xs leading-5 text-[var(--text-muted)]">{t('Você pode selecionar até 30 tópicos por objetivo.')}{selectionLimited ? ` ${t('Selecionamos os primeiros 30. Desmarque tópicos para escolher outros.')}` : ''}</p> : null}
              <div className="max-h-60 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-[var(--line-soft)] bg-[var(--surface-strong)] p-1.5">
                {visible.map((target) => (
                  <label key={target.key} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${value.target_keys.includes(target.key) ? 'border-[var(--sky)] bg-[var(--surface-tint)]' : 'border-transparent hover:bg-[var(--surface-muted)]'}`}>
                    <input type="checkbox" checked={value.target_keys.includes(target.key)} onChange={() => toggle(target.key)}
                      disabled={!target.available || disabled || (value.target_keys.length >= MAX_STUDY_TARGETS && !value.target_keys.includes(target.key))} className="mt-0.5 h-5 w-5 shrink-0 accent-sky-600" />
                    <span className="min-w-0 break-words text-sm font-semibold leading-5 text-[var(--text-strong)]">{target.title}
                      {target.subject ? <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{target.subject}</span> : null}
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
