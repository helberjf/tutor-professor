'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { BarChart3, Check, Copy, Download, Loader2, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';

import {
  ApiError,
  api,
  type StudyLogAnalysis,
  type StudyLogAnalysisItem,
  type StudyLogPeriodStats,
} from '@/lib/api';
import { getActiveLocale, t, tf } from '@/lib/i18n';

import {
  barPercent,
  formatMinutes,
  formatPeriodLabel,
  isValidPeriod,
  notebookFileName,
  presetOf,
  presetRange,
  weekdayLabels,
  type PeriodPreset,
} from './study-log-helpers';

const DeepeningMarkdown = dynamic(
  () => import('@/components/coding/DeepeningMarkdown').then((module) => module.DeepeningMarkdown),
  { ssr: false, loading: () => <Loader2 className="animate-spin text-slate-400" size={20} /> },
);

const actionClass =
  'inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:border-primary hover:bg-sky-50 hover:text-primary disabled:opacity-50';
const inputClass =
  'mt-1 min-h-11 w-full min-w-0 rounded-2xl border-2 border-slate-200 bg-white px-3 text-base text-slate-700 outline-none transition focus:border-primary';

function countLabel(count: number): string {
  return count === 1 ? t("1 registro") : tf("{count} registros", { count });
}

function daysLabel(count: number): string {
  return count === 1 ? t("1 dia") : tf("{count} dias", { count });
}

function deltaLabel(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return t("igual ao período anterior");
  return delta > 0
    ? tf("+{time} que o período anterior", { time: formatMinutes(delta) })
    : tf("−{time} que o período anterior", { time: formatMinutes(-delta) });
}

/** Time and entries together, leaving the time out when none was logged. */
function amountLabel(minutes: number, entries: number): string {
  return [minutes ? formatMinutes(minutes) : null, countLabel(entries)].filter(Boolean).join(' · ');
}

function parseUtc(timestamp: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`);
}

function toItem(analysis: StudyLogAnalysis): StudyLogAnalysisItem {
  const { id, period_start, period_end, title, created_at, updated_at } = analysis;
  return { id, period_start, period_end, title, created_at, updated_at };
}

function Tile({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border-2 border-slate-100 bg-white p-3 sm:p-4">
      <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black leading-tight text-slate-800 sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function PeriodNumbers({ stats, locale }: { stats: StudyLogPeriodStats; locale: string }) {
  // Time when any was logged; otherwise the count of entries draws the bars.
  const byTime = stats.total_minutes > 0;
  const dayValue = (day: { minutes: number; entries: number }) => (byTime ? day.minutes : day.entries);
  const dayMax = Math.max(0, ...stats.daily.map(dayValue));
  const weekdayMax = Math.max(0, ...stats.weekdays.map(dayValue));
  const groupMax = Math.max(0, ...stats.disciplines.map(dayValue));
  const shortDay = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const labelOf = (value: string) => shortDay.format(new Date(`${value}T00:00:00Z`));
  const weekdays = weekdayLabels(locale);
  const untimedDays = byTime && stats.daily.some((day) => day.entries > 0 && day.minutes === 0);
  const { reviews, sheets } = stats;
  const pending = reviews.weak.length > 0 || reviews.never_reviewed > 0 || sheets.without_sheet > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Tile
          label={t("Tempo registrado")}
          value={formatMinutes(stats.total_minutes)}
          helper={deltaLabel(stats.total_minutes, stats.previous.total_minutes)}
        />
        <Tile
          label={t("Dias com estudo")}
          value={`${stats.study_days}/${stats.days}`}
          helper={tf("maior sequência: {days}", { days: daysLabel(stats.longest_streak) })}
        />
        <Tile
          label={t("Registros")}
          value={String(stats.entry_count)}
          helper={tf("{count} com ficha", { count: sheets.with_sheet })}
        />
        <Tile
          label={t("Revisões")}
          value={reviews.score === null ? '—' : `${reviews.score}%`}
          helper={
            reviews.sessions === 0
              ? t("nenhuma revisão no período")
              : reviews.sessions === 1
                ? t("1 revisão")
                : tf("{count} revisões", { count: reviews.sessions })
          }
        />
      </div>

      <section>
        <h3 className="text-sm font-black text-slate-700">{t("Dia a dia")}</h3>
        <div
          role="img"
          aria-label={t("Tempo registrado em cada dia do período")}
          className="mt-2 flex h-28 items-end gap-[2px] border-b-2 border-slate-100"
        >
          {stats.daily.map((day) => {
            const untimed = byTime && day.entries > 0 && day.minutes === 0;
            return (
              <div
                key={day.date}
                className="flex h-full min-w-0 flex-1 items-end"
                title={`${labelOf(day.date)}: ${amountLabel(day.minutes, day.entries)}`}
              >
                <div
                  className={`w-full rounded-t-md ${untimed ? 'bg-slate-300' : 'bg-primary'}`}
                  style={{ height: `${untimed ? 8 : barPercent(dayValue(day), dayMax)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-400">
          <span>{labelOf(stats.start)}</span>
          <span>{labelOf(stats.end)}</span>
        </div>
        {untimedDays ? (
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {t("Cinza: dia com registro sem tempo (tópico estudado ou lição concluída).")}
          </p>
        ) : null}
      </section>

      <section>
        <h3 className="text-sm font-black text-slate-700">{t("Dia da semana")}</h3>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {stats.weekdays.map((day, index) => (
            <div key={weekdays[index]} className="text-center" title={`${weekdays[index]}: ${amountLabel(day.minutes, day.entries)}`}>
              <div className="flex h-14 items-end rounded-xl bg-slate-50 px-1.5">
                <div className="w-full rounded-t-md bg-primary/70" style={{ height: `${barPercent(dayValue(day), weekdayMax)}%` }} />
              </div>
              <p className="mt-1 text-[11px] font-bold capitalize text-slate-500">{weekdays[index]}</p>
            </div>
          ))}
        </div>
      </section>

      {stats.disciplines.length ? (
        <section>
          <h3 className="text-sm font-black text-slate-700">{t("Por disciplina")}</h3>
          <ul className="mt-2 space-y-3">
            {stats.disciplines.map((group) => (
              <li key={group.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-black text-slate-800">{group.name}</span>
                  <span className="shrink-0 text-xs font-bold text-slate-500">{amountLabel(group.minutes, group.entries)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${barPercent(dayValue(group), groupMax)}%` }} />
                </div>
                {group.subjects.some((subject) => subject.name) ? (
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    {group.subjects
                      .map((subject) => `${subject.name ?? t("Sem matéria")} (${amountLabel(subject.minutes, subject.entries)})`)
                      .join(' · ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending ? (
        <section className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          <h3 className="font-black">{t("Para revisar")}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {reviews.weak.map((weak) => (
              <li key={`${weak.discipline}-${weak.title}`} className="break-words">
                {weak.title} — {weak.score}%
              </li>
            ))}
            {reviews.never_reviewed ? (
              <li>
                {reviews.never_reviewed === 1
                  ? t("1 ficha ainda não revisada")
                  : tf("{count} fichas ainda não revisadas", { count: reviews.never_reviewed })}
              </li>
            ) : null}
            {sheets.without_sheet ? (
              <li>
                {sheets.without_sheet === 1
                  ? t("1 registro sem ficha")
                  : tf("{count} registros sem ficha", { count: sheets.without_sheet })}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * How a period went: the numbers the app computes (time, study days, the
 * rhythm, the disciplines, what is left to review) and, on request, the AI's
 * reading of them. Analyses are kept, one per period, and listed to reopen.
 */
export function StudyLogAnalysisModal({
  today,
  aiAvailable,
  onClose,
}: {
  today: string;
  aiAvailable: boolean;
  onClose: () => void;
}) {
  const locale = getActiveLocale();
  const [preset, setPreset] = useState<PeriodPreset>('week');
  const [range, setRange] = useState(() => presetRange('week', today));
  const [stats, setStats] = useState<StudyLogPeriodStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [analyses, setAnalyses] = useState<StudyLogAnalysisItem[] | null>(null);
  const [analysis, setAnalysis] = useState<StudyLogAnalysis | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const analysisRef = useRef<StudyLogAnalysis | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  // Rendered on <body>: a fixed layer inside the page's spaced column would
  // inherit its top margin; the page behind also stops scrolling.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      setMounted(false);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !writing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, writing]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    let cancelled = false;
    api
      .getStudyLogAnalyses()
      .then((items) => {
        if (!cancelled) setAnalyses(items);
      })
      .catch(() => {
        if (!cancelled) setAnalyses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const valid = isValidPeriod(range.start, range.end);
  useEffect(() => {
    setStats(null);
    setStatsError('');
    if (!valid) return;
    let cancelled = false;
    api
      .getStudyLogPeriod(range.start, range.end)
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch((err) => {
        if (!cancelled) setStatsError(err instanceof ApiError ? err.message : t("Não foi possível calcular o período."));
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, valid]);

  // The stored analysis of the period on screen, if there is one.
  const stored = analyses?.find((item) => item.period_start === range.start && item.period_end === range.end) ?? null;
  const storedId = stored?.id ?? null;
  const storedStamp = stored?.updated_at ?? null;
  useEffect(() => {
    setError('');
    const current = analysisRef.current;
    if (storedId === null) {
      setAnalysis(null);
      return;
    }
    if (current?.id === storedId && current.updated_at === storedStamp) return;
    setAnalysis(null);
    let cancelled = false;
    api
      .getStudyLogAnalysis(storedId)
      .then((value) => {
        if (!cancelled) setAnalysis(value);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("Não foi possível abrir a análise."));
      });
    return () => {
      cancelled = true;
    };
  }, [storedId, storedStamp]);

  function choosePreset(next: PeriodPreset) {
    setPreset(next);
    if (next !== 'custom') setRange(presetRange(next, today));
  }

  function openStored(item: StudyLogAnalysisItem) {
    setPreset(presetOf(item.period_start, item.period_end, today));
    setRange({ start: item.period_start, end: item.period_end });
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function write() {
    setWriting(true);
    setError('');
    try {
      const result = await api.createStudyLogAnalysis(range.start, range.end);
      setAnalysis(result);
      setAnalyses((current) => [toItem(result), ...(current ?? []).filter((item) => item.id !== result.id)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Não foi possível escrever a análise."));
    } finally {
      setWriting(false);
    }
  }

  async function remove() {
    if (!analysis || !window.confirm(t("Excluir esta análise? Dá para gerar outra depois."))) return;
    try {
      await api.deleteStudyLogAnalysis(analysis.id);
      setAnalyses((current) => (current ?? []).filter((item) => item.id !== analysis.id));
      setAnalysis(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Não foi possível excluir a análise."));
    }
  }

  const periodLabel = valid ? formatPeriodLabel(range.start, range.end, locale) : '';
  const markdown = analysis
    ? `# ${analysis.title}\n\n*${formatPeriodLabel(analysis.period_start, analysis.period_end, locale)}*\n\n${analysis.content}\n`
    : '';
  const stale = Boolean(
    analysis?.stats &&
      stats &&
      (analysis.stats.entry_count !== stats.entry_count || analysis.stats.total_minutes !== stats.total_minutes),
  );

  async function copy() {
    if (!markdown || !navigator.clipboard) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
  }

  function download() {
    if (!analysis) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = notebookFileName(`${t("Análise")} ${analysis.period_start} ${analysis.period_end}`);
    link.click();
    URL.revokeObjectURL(url);
  }

  const presets: Array<{ value: PeriodPreset; label: string }> = [
    { value: 'week', label: t("7 dias") },
    { value: 'month', label: t("30 dias") },
    { value: 'custom', label: t("Personalizado") },
  ];

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-log-analysis-title"
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-3 lg:p-4"
    >
      <div className="flex min-h-[100dvh] w-full flex-col dialog-sheet text-slate-900 shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:min-h-0 sm:max-w-4xl sm:rounded-3xl lg:h-[calc(100dvh-2rem)]">
        <header className="border-b border-slate-200 px-5 pb-4 pt-[calc(1rem_+_env(safe-area-inset-top))] sm:px-7 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-primary">{t("Análise do período")}</p>
              <h2 id="study-log-analysis-title" className="mt-1 break-words text-xl font-black leading-tight text-slate-900 sm:text-2xl">
                {periodLabel || t("Análise do período")}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={writing}
              aria-label={t("Fechar análise")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex w-full rounded-2xl border-2 border-slate-200 bg-white p-1 sm:w-auto sm:max-w-md" role="group" aria-label={t("Período")}>
            {presets.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => choosePreset(option.value)}
                aria-pressed={preset === option.value}
                disabled={writing}
                className={`inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3 text-sm font-black transition ${
                  preset === option.value ? 'bg-primary-dark text-white' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {preset === 'custom' ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
              <label className="block min-w-0 text-xs font-black text-slate-600">
                {t("De")}
                <input
                  type="date"
                  value={range.start}
                  max={range.end || today}
                  disabled={writing}
                  onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block min-w-0 text-xs font-black text-slate-600">
                {t("Até")}
                <input
                  type="date"
                  value={range.end}
                  min={range.start}
                  max={today}
                  disabled={writing}
                  onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
          ) : null}
        </header>

        <main
          ref={mainRef}
          className="flex-1 space-y-8 overflow-y-auto px-5 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pb-8"
        >
          {!valid ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              {t("Escolha um período de até um ano, com o fim depois do começo.")}
            </p>
          ) : statsError ? (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{statsError}</p>
          ) : stats ? (
            <PeriodNumbers stats={stats} locale={locale} />
          ) : (
            <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <Loader2 className="animate-spin" size={16} /> {t("Calculando o período…")}
            </p>
          )}

          {valid && stats ? (
            <section className="border-t-2 border-slate-100 pt-6">
              <h3 className="flex items-center gap-2 text-lg font-black text-slate-800">
                <Sparkles size={18} className="text-violet-600" /> {t("Análise da IA")}
              </h3>
              {error ? (
                <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>
              ) : null}

              {writing ? (
                <p className="mt-3 flex items-center gap-2 rounded-2xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
                  <Loader2 className="animate-spin" size={16} /> {t("A IA está lendo seus registros…")}
                </p>
              ) : analysis ? (
                <div className="mt-3">
                  <p className="text-xs font-bold text-slate-400">
                    {tf("Gerada em {when}", {
                      when: new Intl.DateTimeFormat(locale, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(parseUtc(analysis.updated_at)),
                    })}
                  </p>
                  {stale ? (
                    <p className="mt-2 rounded-2xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
                      {t("Os registros desse período mudaram depois desta análise. Refaça para incluir o que mudou.")}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copy()} className={actionClass}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? t("Copiado") : t("Copiar")}
                    </button>
                    <button type="button" onClick={download} className={actionClass}>
                      <Download size={15} /> {t("Baixar .md")}
                    </button>
                    {aiAvailable ? (
                      <button type="button" onClick={() => void write()} className={actionClass}>
                        <RotateCcw size={15} /> {t("Refazer")}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void remove()} className={`${actionClass} hover:border-rose-300 hover:text-rose-700`}>
                      <Trash2 size={15} /> {t("Excluir")}
                    </button>
                  </div>
                  {/* The title goes in as the document's heading, so it lines up with the text. */}
                  <div className="mt-6 text-[0.95rem]">
                    <DeepeningMarkdown content={`# ${analysis.title}\n\n${analysis.content}`} />
                  </div>
                </div>
              ) : (analyses === null || storedId !== null) && !error ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-500">
                  <Loader2 className="animate-spin" size={16} /> {t("Abrindo a análise…")}
                </p>
              ) : stats.entry_count === 0 ? (
                <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                  {t("Nada registrado nesse período.")}
                </p>
              ) : !aiAvailable ? (
                <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                  {t("Configure uma chave de IA na Área da conta para a IA analisar o período.")}
                </p>
              ) : (
                <div className="mt-3 rounded-2xl bg-violet-50 p-4">
                  <p className="text-sm font-semibold leading-6 text-slate-700">
                    {t("A IA lê os números acima e os seus registros e escreve o que eles mostram: o que você estudou, seu ritmo, o que revisar e os próximos passos.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void write()}
                    className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-violet-700 px-4 text-sm font-black text-white transition hover:bg-violet-800"
                  >
                    <Sparkles size={16} /> {t("Analisar com IA")}
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {analyses && analyses.length > 0 ? (
            <section className="border-t-2 border-slate-100 pt-6">
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-700">
                <BarChart3 size={16} className="text-slate-400" /> {t("Análises anteriores")}
              </h3>
              <ul className="mt-2 space-y-2">
                {analyses.map((item) => {
                  const current = item.id === storedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openStored(item)}
                        disabled={writing}
                        aria-current={current ? 'true' : undefined}
                        className={`flex min-h-11 w-full flex-col items-start rounded-2xl border-2 px-4 py-2 text-left transition ${
                          current ? 'border-primary bg-sky-50' : 'border-slate-100 bg-white hover:border-primary'
                        }`}
                      >
                        <span className="break-words text-sm font-black text-slate-700">{item.title}</span>
                        <span className="text-xs font-bold text-slate-400">
                          {formatPeriodLabel(item.period_start, item.period_end, locale)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </main>
      </div>
    </div>,
    document.body,
  );
}
