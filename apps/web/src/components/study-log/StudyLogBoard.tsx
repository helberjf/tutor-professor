'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Clock3, Layers, ListFilter, Loader2, NotebookPen, RotateCcw, Search } from 'lucide-react';

import {
  ApiError,
  api,
  type StudyLogEntry,
  type StudyLogEntryItem,
  type StudyLogOptions,
  type UpdateStudyLogPayload,
} from '@/lib/api';
import { t, tf } from '@/lib/i18n';
import { getLocalDateKey } from '@/lib/pomodoro';

import { StudyLogComposer } from './StudyLogComposer';
import { StudyLogEntryCard, type EntryBusy } from './StudyLogEntryCard';
import { filterEntries, formatMinutes, groupByDay, groupByDiscipline, studyLogTotals } from './study-log-helpers';

type LogView = 'day' | 'discipline';

const VIEW_STORAGE_KEY = 'english-kids-tutor:study-log:view';
const DAYS_PER_PAGE = 21;

function toItem(entry: StudyLogEntry): StudyLogEntryItem {
  return {
    id: entry.id,
    studied_on: entry.studied_on,
    title: entry.title,
    title_is_auto: entry.title_is_auto,
    discipline: entry.discipline,
    subject: entry.subject,
    subject_id: entry.subject_id,
    subject_is_auto: entry.subject_is_auto,
    source: entry.source,
    source_id: entry.source_id,
    source_filename: entry.source_filename,
    duration_minutes: entry.duration_minutes,
    has_content: entry.has_content,
    has_summary: entry.has_summary,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}

function sortEntries(entries: StudyLogEntryItem[]): StudyLogEntryItem[] {
  return [...entries].sort((a, b) => {
    if (a.studied_on !== b.studied_on) return a.studied_on < b.studied_on ? 1 : -1;
    return b.id - a.id;
  });
}

function formatDayHeading(value: string, today: string): string {
  if (value === today) return t("Hoje");
  const [year, month, day] = value.split('-').map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function countLabel(count: number): string {
  return count === 1 ? t("1 registro") : tf("{count} registros", { count });
}

function StatCell({ icon, tint, value, label, helper }: { icon: ReactNode; tint: string; value: string; label: string; helper: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 text-center sm:px-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
      <p className="flex min-h-[2.25rem] items-center text-lg font-black leading-tight text-slate-800 sm:text-xl">{value}</p>
      <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-slate-400">{label}</p>
      <p className="text-xs font-semibold leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function readStoredView(): LogView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'discipline' ? 'discipline' : 'day';
  } catch {
    return 'day';
  }
}

export function StudyLogBoard() {
  const [today, setToday] = useState(() => getLocalDateKey());
  const [requestedDate, setRequestedDate] = useState(() => getLocalDateKey());
  const [options, setOptions] = useState<StudyLogOptions | null>(null);
  const [entries, setEntries] = useState<StudyLogEntryItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [view, setView] = useState<LogView>('day');
  const [query, setQuery] = useState('');
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE);
  const [details, setDetails] = useState<Record<number, StudyLogEntry>>({});
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState<Record<number, EntryBusy | undefined>>({});
  const [entryErrors, setEntryErrors] = useState<Record<number, string | undefined>>({});

  useEffect(() => {
    const now = getLocalDateKey();
    setToday(now);
    setView(readStoredView());
    const requested = new URLSearchParams(window.location.search).get('date');
    if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= now) setRequestedDate(requested);
    else setRequestedDate(now);
  }, []);

  const refreshOptions = useCallback((attempt = 0) => {
    api.getStudyLogOptions().then(setOptions).catch(() => {
      // The form still works without suggestions, so a failure only retries a
      // couple of times; the list says it when the API is really down.
      if (attempt < 2) window.setTimeout(() => refreshOptions(attempt + 1), 1500 * (attempt + 1));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    api.getStudyLog()
      .then((items) => {
        if (!cancelled) setEntries(sortEntries(items));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("Não foi possível carregar os registros."));
      });
    refreshOptions(0);
    return () => {
      cancelled = true;
    };
  }, [reloadNonce, refreshOptions]);

  function chooseView(next: LogView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Remembering the view is a convenience; the page works without it.
    }
  }

  function setEntryBusy(id: number, value: EntryBusy | undefined) {
    setBusy((current) => ({ ...current, [id]: value }));
  }

  function setEntryError(id: number, value: string | undefined) {
    setEntryErrors((current) => ({ ...current, [id]: value }));
  }

  function storeEntry(entry: StudyLogEntry) {
    setDetails((current) => ({ ...current, [entry.id]: entry }));
    setEntries((current) => sortEntries([...(current ?? []).filter((item) => item.id !== entry.id), toItem(entry)]));
  }

  function toggleEntry(id: number, open: boolean) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
    if (open && !details[id]) {
      api.getStudyLogEntry(id)
        .then((entry) => setDetails((current) => ({ ...current, [entry.id]: entry })))
        .catch((err) => setEntryError(id, err instanceof ApiError ? err.message : t("Não foi possível abrir o registro.")));
    }
  }

  async function generateSheet(id: number, regenerate: boolean) {
    setEntryBusy(id, 'summary');
    setEntryError(id, undefined);
    try {
      storeEntry(await api.summarizeStudyLogEntry(id, { regenerate }));
      refreshOptions();
    } catch (err) {
      setEntryError(id, err instanceof ApiError ? err.message : t("Não foi possível escrever a ficha."));
    } finally {
      setEntryBusy(id, undefined);
    }
  }

  function handleCreated(entry: StudyLogEntry) {
    storeEntry(entry);
    setOpenIds((current) => new Set(current).add(entry.id));
    refreshOptions();
    // Unless the account is known to have no AI, ask for the sheet: when the
    // options failed to load, the answer to this request says what is missing.
    if (entry.can_summarize && options?.ai_available !== false) void generateSheet(entry.id, false);
  }

  async function saveEntry(id: number, payload: UpdateStudyLogPayload): Promise<boolean> {
    setEntryBusy(id, 'saving');
    setEntryError(id, undefined);
    try {
      storeEntry(await api.updateStudyLogEntry(id, payload));
      if (payload.discipline !== undefined || payload.subject !== undefined) refreshOptions();
      return true;
    } catch (err) {
      setEntryError(id, err instanceof ApiError ? err.message : t("Não foi possível salvar."));
      return false;
    } finally {
      setEntryBusy(id, undefined);
    }
  }

  async function deleteEntry(id: number) {
    if (!window.confirm(t("Excluir este registro? A ficha e o texto dele somem junto."))) return;
    setEntryBusy(id, 'deleting');
    try {
      await api.deleteStudyLogEntry(id);
      setEntries((current) => (current ?? []).filter((item) => item.id !== id));
      setDetails((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (err) {
      setEntryError(id, err instanceof ApiError ? err.message : t("Não foi possível excluir o registro."));
    } finally {
      setEntryBusy(id, undefined);
    }
  }

  const totals = useMemo(() => studyLogTotals(entries ?? [], today), [entries, today]);
  const visibleEntries = useMemo(() => filterEntries(entries ?? [], query), [entries, query]);
  const dayGroups = useMemo(() => groupByDay(visibleEntries), [visibleEntries]);
  const disciplineGroups = useMemo(() => groupByDiscipline(visibleEntries), [visibleEntries]);
  const weekDelta = totals.weekMinutes - totals.previousWeekMinutes;

  function renderCard(item: StudyLogEntryItem, showDate: boolean) {
    return (
      <StudyLogEntryCard
        key={item.id}
        item={item}
        detail={details[item.id]}
        options={options}
        today={today}
        showDate={showDate}
        open={openIds.has(item.id)}
        busy={busy[item.id]}
        error={entryErrors[item.id]}
        onToggle={(open) => toggleEntry(item.id, open)}
        onGenerateSheet={(regenerate) => void generateSheet(item.id, regenerate)}
        onSave={(payload) => saveEntry(item.id, payload)}
        onDelete={() => void deleteEntry(item.id)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="app-surface border-primary/30 p-4 sm:p-6">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <StatCell
            icon={<Clock3 size={16} className="text-sky-700" />}
            tint="bg-sky-100"
            value={formatMinutes(totals.todayMinutes)}
            label={t("Hoje")}
            helper={countLabel(totals.todayCount)}
          />
          <StatCell
            icon={<CalendarDays size={16} className="text-emerald-700" />}
            tint="bg-emerald-100"
            value={formatMinutes(totals.weekMinutes)}
            label={t("7 dias")}
            helper={
              weekDelta === 0
                ? t("igual à semana anterior")
                : weekDelta > 0
                  ? tf("+{time} que a semana anterior", { time: formatMinutes(weekDelta) })
                  : tf("−{time} que a semana anterior", { time: formatMinutes(-weekDelta) })
            }
          />
          <StatCell
            icon={<NotebookPen size={16} className="text-violet-700" />}
            tint="bg-violet-100"
            value={`${totals.weekStudyDays}/7`}
            label={t("Dias com estudo")}
            helper={countLabel(totals.weekCount)}
          />
        </div>
      </section>

      <StudyLogComposer options={options} today={today} defaultDate={requestedDate} onCreated={handleCreated} />

      <section className="app-surface border-slate-100 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Tudo o que você estudou")}</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{t("Seus registros")}</h2>
          </div>
          <div className="flex w-full rounded-2xl border-2 border-slate-200 bg-white p-1 sm:w-auto" role="group" aria-label={t("Como agrupar")}>
            <button
              type="button"
              onClick={() => chooseView('day')}
              aria-pressed={view === 'day'}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-black transition ${
                view === 'day' ? 'bg-primary-dark text-white' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <CalendarDays size={15} /> {t("Por dia")}
            </button>
            <button
              type="button"
              onClick={() => chooseView('discipline')}
              aria-pressed={view === 'discipline'}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-black transition ${
                view === 'discipline' ? 'bg-primary-dark text-white' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Layers size={15} /> {t("Por disciplina")}
            </button>
          </div>
        </div>

        <label className="mt-4 flex min-h-12 items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 focus-within:border-primary">
          <Search size={16} className="shrink-0 text-slate-400" />
          <span className="sr-only">{t("Filtrar registros")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Filtrar por título, disciplina ou matéria")}
            className="min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none"
          />
        </label>

        <div className="mt-4">
          {loadError ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-amber-300 px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100"
              >
                <RotateCcw size={14} /> {t("Tentar de novo")}
              </button>
            </div>
          ) : entries === null ? (
            <p className="flex items-center gap-2 py-6 text-sm font-bold text-slate-500">
              <Loader2 className="animate-spin" size={16} /> {t("Carregando registros…")}
            </p>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center">
              <NotebookPen size={28} className="mx-auto text-primary" />
              <p className="mt-2 font-black text-slate-800">{t("Nada registrado ainda")}</p>
              <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-500">
                {t("Registre o que estudou hoje. Tópicos marcados como estudados e lições concluídas também aparecem aqui.")}
              </p>
            </div>
          ) : visibleEntries.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
              <ListFilter size={16} /> {t("Nenhum registro com esse filtro.")}
            </p>
          ) : view === 'day' ? (
            <div className="space-y-6">
              {dayGroups.slice(0, visibleDays).map((group) => (
                <div key={group.day}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-black text-slate-800">{formatDayHeading(group.day, today)}</h3>
                    <p className="text-xs font-bold text-slate-400">
                      {countLabel(group.entries.length)}
                      {group.minutes ? ` · ${formatMinutes(group.minutes)}` : ''}
                    </p>
                  </div>
                  <div className="space-y-2">{group.entries.map((item) => renderCard(item, false))}</div>
                </div>
              ))}
              {dayGroups.length > visibleDays ? (
                <button
                  type="button"
                  onClick={() => setVisibleDays((count) => count + DAYS_PER_PAGE)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-primary"
                >
                  {t("Mostrar dias anteriores")}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {disciplineGroups.map((group) => (
                <details key={group.discipline} className="group/discipline rounded-[1.25rem] border-2 border-slate-100 bg-slate-50">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 break-words text-lg font-black text-slate-800">{group.discipline}</span>
                    <span className="text-xs font-bold text-slate-500">
                      {countLabel(group.count)}
                      {group.minutes ? ` · ${formatMinutes(group.minutes)}` : ''}
                    </span>
                  </summary>
                  <div className="space-y-4 px-3 pb-4 sm:px-4">
                    {group.subjects.map((subject) => (
                      <div key={subject.subject ?? '—'}>
                        <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
                          <span className="text-sm font-black text-slate-700">{subject.subject ?? t("Sem matéria")}</span>
                          <span className="text-xs font-bold text-slate-400">
                            {countLabel(subject.entries.length)}
                            {subject.minutes ? ` · ${formatMinutes(subject.minutes)}` : ''}
                          </span>
                        </p>
                        <div className="space-y-2">{subject.entries.map((item) => renderCard(item, true))}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
