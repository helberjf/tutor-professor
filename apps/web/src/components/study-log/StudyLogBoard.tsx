'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  Clock3,
  Layers,
  ListFilter,
  Loader2,
  NotebookPen,
  NotebookText,
  Pencil,
  Repeat2,
  RotateCcw,
  Search,
} from 'lucide-react';

import {
  ApiError,
  api,
  type StudyLogEntry,
  type StudyLogEntryItem,
  type StudyLogOptions,
  type StudyLogSearchResult,
  type UpdateStudyLogPayload,
} from '@/lib/api';
import { t, tf } from '@/lib/i18n';
import { getLocalDateKey } from '@/lib/pomodoro';

import { StudyLogAnalysisModal } from './StudyLogAnalysisModal';
import { StudyLogComposer } from './StudyLogComposer';
import { StudyLogEntryCard, type EntryBusy } from './StudyLogEntryCard';
import { StudyLogNotebookModal } from './StudyLogNotebookModal';
import { StudyLogReviewModal, type ReviewScope } from './StudyLogReviewModal';
import { filterEntries, formatMinutes, groupByDay, groupByDiscipline, nameKey, studyLogTotals } from './study-log-helpers';

type LogView = 'day' | 'discipline';

interface RenameState {
  kind: 'discipline' | 'subject';
  discipline: string;
  /** The subject being renamed; null for the entries without one. */
  subject: string | null;
  value: string;
}

const VIEW_STORAGE_KEY = 'english-kids-tutor:study-log:view';
const DAYS_PER_PAGE = 21;
const SEARCH_DELAY_MS = 300;

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
    last_reviewed_at: entry.last_reviewed_at,
    review_count: entry.review_count,
    last_review_score: entry.last_review_score,
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

/** Notebook, review and rename for a discipline or a subject. Icons alone on phones. */
function GroupActions({ onNotebook, onReview, onRename }: { onNotebook: () => void; onReview: () => void; onRename: () => void }) {
  const buttonClass =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-2.5 text-xs font-black text-slate-600 transition hover:border-primary hover:text-primary sm:px-3';
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" onClick={onNotebook} className={buttonClass} aria-label={t("Caderno")} title={t("Caderno")}>
        <NotebookText size={15} /> <span className="hidden sm:inline">{t("Caderno")}</span>
      </button>
      <button type="button" onClick={onReview} className={buttonClass} aria-label={t("Revisar")} title={t("Revisar")}>
        <Repeat2 size={15} /> <span className="hidden sm:inline">{t("Revisar")}</span>
      </button>
      <button type="button" onClick={onRename} className={buttonClass} aria-label={t("Renomear")} title={t("Renomear")}>
        <Pencil size={15} /> <span className="hidden sm:inline">{t("Renomear")}</span>
      </button>
    </span>
  );
}

function RenameForm({
  state,
  suggestions,
  mergeWith,
  busy,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: RenameState;
  suggestions: string[];
  mergeWith: string | null;
  busy: boolean;
  error: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const listId = `rename-${state.kind}-${nameKey(state.discipline)}-${nameKey(state.subject ?? '')}`.replace(/\s+/g, '-');
  return (
    <form
      className="rounded-2xl border-2 border-primary/30 bg-white p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        <span className="text-xs font-black text-slate-600">
          {state.kind === 'discipline' ? t("Novo nome da disciplina") : t("Novo nome da matéria")}
        </span>
        <input
          autoFocus
          value={state.value}
          onChange={(event) => onChange(event.target.value)}
          list={listId}
          maxLength={100}
          placeholder={state.kind === 'subject' ? t("Em branco: fica sem matéria") : undefined}
          className="mt-1.5 min-h-11 w-full min-w-0 rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-primary"
        />
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        {mergeWith
          ? tf("Já existe \"{name}\": os registros vão para lá e os dois grupos viram um só.", { name: mergeWith })
          : state.kind === 'discipline'
            ? t("Muda só aqui no Controle de estudos; em Outras disciplinas o nome continua o mesmo.")
            : t("Vale para todos os registros desta matéria.")}
      </p>
      {error ? <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary-dark px-4 text-sm font-black text-white transition hover:bg-primary"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
          {mergeWith ? t("Juntar") : t("Renomear")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-primary"
        >
          {t("Cancelar")}
        </button>
      </div>
    </form>
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
  const [searchHits, setSearchHits] = useState<Map<number, StudyLogSearchResult> | null>(null);
  const [searching, setSearching] = useState(false);
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE);
  const [details, setDetails] = useState<Record<number, StudyLogEntry>>({});
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState<Record<number, EntryBusy | undefined>>({});
  const [entryErrors, setEntryErrors] = useState<Record<number, string | undefined>>({});
  const [notebook, setNotebook] = useState<{ discipline: string; subject?: string | null } | null>(null);
  const [review, setReview] = useState<(ReviewScope & { heading: string }) | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState('');

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

  // The filter answers at once for titles, disciplines and subjects; the text
  // and the sheets are searched on the server, a moment after typing stops.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchHits(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api.searchStudyLog(trimmed)
        .then((results) => {
          if (!cancelled) setSearchHits(new Map(results.map((result) => [result.id, result])));
        })
        .catch(() => {
          if (!cancelled) setSearchHits(new Map());
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

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

  function fetchDetail(id: number) {
    api.getStudyLogEntry(id)
      .then((entry) => setDetails((current) => ({ ...current, [entry.id]: entry })))
      .catch((err) => setEntryError(id, err instanceof ApiError ? err.message : t("Não foi possível abrir o registro.")));
  }

  /** After a rename or a batch of sheets, names and flags changed on many entries at once. */
  async function reloadAll() {
    try {
      setEntries(sortEntries(await api.getStudyLog()));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Não foi possível carregar os registros."));
    }
    setDetails({});
    refreshOptions();
    openIds.forEach((id) => fetchDetail(id));
  }

  function toggleEntry(id: number, open: boolean) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
    if (open && !details[id]) fetchDetail(id);
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

  function startRename(kind: RenameState['kind'], discipline: string, subject: string | null) {
    setRenameError('');
    setRenaming({ kind, discipline, subject, value: kind === 'discipline' ? discipline : subject ?? '' });
  }

  async function submitRename() {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (renaming.kind === 'discipline' && !value) {
      setRenameError(t("Escolha o novo nome da disciplina."));
      return;
    }
    setRenameBusy(true);
    setRenameError('');
    try {
      if (renaming.kind === 'discipline') await api.renameStudyLogDiscipline(renaming.discipline, value);
      else await api.renameStudyLogSubject(renaming.discipline, renaming.subject ?? '', value);
      setRenaming(null);
      await reloadAll();
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : t("Não foi possível renomear."));
    } finally {
      setRenameBusy(false);
    }
  }

  const totals = useMemo(() => studyLogTotals(entries ?? [], today), [entries, today]);
  const visibleEntries = useMemo(() => {
    const local = filterEntries(entries ?? [], query);
    if (!searchHits) return local;
    const localIds = new Set(local.map((item) => item.id));
    return (entries ?? []).filter((item) => localIds.has(item.id) || searchHits.has(item.id));
  }, [entries, query, searchHits]);
  const dayGroups = useMemo(() => groupByDay(visibleEntries), [visibleEntries]);
  const disciplineGroups = useMemo(() => groupByDiscipline(visibleEntries), [visibleEntries]);
  const allDisciplineNames = useMemo(() => groupByDiscipline(entries ?? []).map((group) => group.discipline), [entries]);
  const weekDelta = totals.weekMinutes - totals.previousWeekMinutes;

  function renameSuggestions(state: RenameState): string[] {
    if (state.kind === 'discipline') {
      return [...new Set([...allDisciplineNames, ...(options?.disciplines ?? []).map((option) => option.name)])];
    }
    const group = groupByDiscipline(entries ?? []).find((item) => nameKey(item.discipline) === nameKey(state.discipline));
    return (group?.subjects ?? []).map((subject) => subject.subject).filter((name): name is string => Boolean(name));
  }

  function mergeTarget(state: RenameState): string | null {
    const key = nameKey(state.value);
    if (!key || key === nameKey(state.kind === 'discipline' ? state.discipline : state.subject ?? '')) return null;
    if (state.kind === 'discipline') {
      return allDisciplineNames.find((name) => nameKey(name) === key) ?? null;
    }
    return renameSuggestions(state).find((name) => nameKey(name) === key) ?? null;
  }

  function isRenaming(kind: RenameState['kind'], discipline: string, subject: string | null) {
    return (
      renaming?.kind === kind &&
      nameKey(renaming.discipline) === nameKey(discipline) &&
      (kind === 'discipline' || nameKey(renaming.subject ?? '') === nameKey(subject ?? ''))
    );
  }

  function renderRenameForm() {
    if (!renaming) return null;
    return (
      <RenameForm
        state={renaming}
        suggestions={renameSuggestions(renaming)}
        mergeWith={mergeTarget(renaming)}
        busy={renameBusy}
        error={renameError}
        onChange={(value) => setRenaming((current) => (current ? { ...current, value } : current))}
        onCancel={() => setRenaming(null)}
        onSubmit={() => void submitRename()}
      />
    );
  }

  function renderCard(item: StudyLogEntryItem, showDate: boolean) {
    const hit = searchHits?.get(item.id);
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
        snippet={hit && hit.field !== 'title' ? hit.snippet : null}
        onToggle={(open) => toggleEntry(item.id, open)}
        onGenerateSheet={(regenerate) => void generateSheet(item.id, regenerate)}
        onSave={(payload) => saveEntry(item.id, payload)}
        onDelete={() => void deleteEntry(item.id)}
        onReview={() => setReview({ heading: item.title, entryId: item.id })}
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
        <div className="mt-4 flex border-t border-slate-100 pt-4 sm:justify-end">
          <button
            type="button"
            onClick={() => setAnalysisOpen(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-white px-4 text-sm font-black text-primary transition hover:bg-primary-light sm:w-auto"
          >
            <BarChart3 size={16} /> {t("Analisar período")}
          </button>
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

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 focus-within:border-primary">
            {searching ? <Loader2 size={16} className="shrink-0 animate-spin text-slate-400" /> : <Search size={16} className="shrink-0 text-slate-400" />}
            <span className="sr-only">{t("Buscar nos registros")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Buscar no título, no texto e na ficha")}
              className="min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setReview({ heading: t("Revisar fichas") })}
            disabled={!entries?.some((item) => item.has_summary)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-white px-4 text-sm font-black text-primary transition hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Repeat2 size={16} /> {t("Revisar fichas")}
          </button>
        </div>

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
              <ListFilter size={16} /> {searching ? t("Buscando…") : t("Nenhum registro com essa busca.")}
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
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Disciplina inteira")}</span>
                      <GroupActions
                        onNotebook={() => setNotebook({ discipline: group.discipline })}
                        onReview={() => setReview({ heading: group.discipline, discipline: group.discipline })}
                        onRename={() => startRename('discipline', group.discipline, null)}
                      />
                    </div>
                    {isRenaming('discipline', group.discipline, null) ? renderRenameForm() : null}
                    {group.subjects.map((subject) => (
                      <div key={subject.subject ?? '—'}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                          <span className="min-w-0">
                            <span className="block break-words text-sm font-black text-slate-700">{subject.subject ?? t("Sem matéria")}</span>
                            <span className="text-xs font-bold text-slate-400">
                              {countLabel(subject.entries.length)}
                              {subject.minutes ? ` · ${formatMinutes(subject.minutes)}` : ''}
                            </span>
                          </span>
                          <GroupActions
                            onNotebook={() => setNotebook({ discipline: group.discipline, subject: subject.subject ?? '' })}
                            onReview={() =>
                              setReview({
                                heading: `${group.discipline} › ${subject.subject ?? t("Sem matéria")}`,
                                discipline: group.discipline,
                                subject: subject.subject ?? '',
                              })
                            }
                            onRename={() => startRename('subject', group.discipline, subject.subject)}
                          />
                        </div>
                        {isRenaming('subject', group.discipline, subject.subject) ? (
                          <div className="mb-2">{renderRenameForm()}</div>
                        ) : null}
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

      {notebook ? (
        <StudyLogNotebookModal
          discipline={notebook.discipline}
          subject={notebook.subject}
          aiAvailable={options?.ai_available !== false}
          onClose={() => setNotebook(null)}
          onSheetsWritten={() => void reloadAll()}
        />
      ) : null}
      {review ? (
        <StudyLogReviewModal
          discipline={review.discipline}
          subject={review.subject}
          entryId={review.entryId}
          heading={review.heading}
          onClose={() => setReview(null)}
          onReviewed={storeEntry}
        />
      ) : null}
      {analysisOpen ? (
        <StudyLogAnalysisModal
          today={today}
          aiAvailable={options?.ai_available !== false}
          onClose={() => setAnalysisOpen(false)}
        />
      ) : null}
    </div>
  );
}
