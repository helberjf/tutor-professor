'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, ClipboardList, Clock, Flame, Timer } from 'lucide-react';
import { api, type ActivityPeriod, type ActivityPeriodSummary, type DailyActivitySummarySchema, type StudyDashboard, type StudyDay } from '@/lib/api';

function getLocalDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateLabel(value: string | null) {
  if (!value) return 'Nenhum registro';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

export function DashboardOverview({
  dashboard,
  pomodoroState,
}: {
  dashboard: StudyDashboard | null;
  pomodoroState: { completedByDate: Record<string, number> };
}) {
  const [activityMonth, setActivityMonth] = useState<DailyActivitySummarySchema[] | null>(null);
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('year');
  const [periodSummary, setPeriodSummary] = useState<ActivityPeriodSummary | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  // How many 30-day windows back the calendars below are showing. Zero is the
  // window ending today; the history used to stop dead at that edge.
  const [windowOffset, setWindowOffset] = useState(0);

  const windowEndDate = useMemo(() => {
    if (windowOffset === 0) return null;
    const end = new Date();
    end.setDate(end.getDate() - windowOffset * 30);
    return getLocalDateValue(end);
  }, [windowOffset]);

  useEffect(() => {
    let cancelled = false;
    const loadMonth = async () => {
      try {
        const data = await api.getActivityMonth(windowEndDate ?? undefined);
        if (!cancelled) setActivityMonth(data);
      } catch {
        // Keep the existing StudyDay fallback if the activity feed is offline.
      }
    };
    void loadMonth();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadMonth();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [windowEndDate]);

  useEffect(() => {
    let cancelled = false;
    setPeriodLoading(true);
    api.getActivitySummary(activityPeriod)
      .then((data) => {
        if (!cancelled) setPeriodSummary(data);
      })
      .catch(() => {
        if (!cancelled) setPeriodSummary(null);
      })
      .finally(() => {
        if (!cancelled) setPeriodLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityPeriod]);

  const allDays = useMemo(() => {
    const backendMap = new Map<string, StudyDay>();
    const activityMap = new Map<string, DailyActivitySummarySchema>();
    if (dashboard) {
      for (const day of dashboard.recent_days) backendMap.set(day.study_date, day);
      backendMap.set(dashboard.today.study_date, dashboard.today);
    }
    for (const day of activityMonth ?? []) activityMap.set(day.activity_date, day);

    const result: Array<{
      date: string;
      pomodoroCount: number;
      isStudyDay: boolean;
      activityCount: number;
      activityDuration: number;
    }> = [];
    const fallbackDates = Array.from({ length: 30 }, (_, index) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - index));
      return getLocalDateValue(d);
    });
    const dateKeys = activityMonth?.length ? activityMonth.map((day) => day.activity_date) : fallbackDates;
    for (const key of dateKeys) {
      const backend = backendMap.get(key);
      const activity = activityMap.get(key);
      const localCount = pomodoroState.completedByDate[key] ?? 0;
      // The study-day rows the dashboard ships only cover the most recent
      // window, so older days take their count from the activity feed instead.
      const backendCount = Math.max(backend?.pomodoro_count ?? 0, activity?.pomodoro_count ?? 0);
      const activityCount = activity?.total_activities ?? 0;
      result.push({
        date: key,
        pomodoroCount: Math.max(localCount, backendCount),
        isStudyDay: activityMonth === null ? (backend?.is_study_day ?? false) : activityCount > 0,
        activityCount,
        activityDuration: activity?.total_duration_seconds ?? 0,
      });
    }
    return result;
  }, [activityMonth, dashboard, pomodoroState.completedByDate]);

  const maxPomodoros = useMemo(() => Math.max(1, ...allDays.map((d) => d.pomodoroCount)), [allDays]);
  const totalPomodoros = useMemo(() => allDays.reduce((sum, day) => sum + day.pomodoroCount, 0), [allDays]);
  const studyDays = useMemo(() => allDays.filter((day) => day.isStudyDay).length, [allDays]);
  const totalActivityDuration = useMemo(() => allDays.reduce((sum, day) => sum + day.activityDuration, 0), [allDays]);
  // Today's numbers come from the server's own view of today, so that browsing
  // back through the calendars below never relabels an older day as "hoje".
  const pomodoroToday = dashboard?.today.pomodoro_count ?? 0;
  const activityToday = dashboard?.today.activity_count ?? 0;
  const thisWeekActivities = useMemo(() => allDays.slice(-7).reduce((sum, day) => sum + day.activityCount, 0), [allDays]);
  const previousWeekActivities = useMemo(() => allDays.slice(-14, -7).reduce((sum, day) => sum + day.activityCount, 0), [allDays]);
  const weeklyDelta = thisWeekActivities - previousWeekActivities;
  const questionMetrics = dashboard?.question_metrics ?? [];
  const windowStart = allDays[0]?.date ?? null;
  const windowEnd = allDays[allDays.length - 1]?.date ?? null;
  // "30 dias" and "mês" are two different spans, and saying both on one screen
  // was the confusing part. The calendars below always say which 30 days they
  // are, and the selector below says which calendar month it means.
  const windowLabel = windowOffset === 0
    ? 'últimos 30 dias'
    : `${formatDateLabel(windowStart)} até ${formatDateLabel(windowEnd)}`;
  const periodLabels: Record<ActivityPeriod, string> = {
    day: 'Hoje',
    month: 'Mês atual',
    year: 'Ano atual',
    all: 'Todo o período',
  };
  const currentPeriodLabel = periodLabels[activityPeriod];
  const periodDateLabel = periodSummary?.start_date
    ? `${formatDateLabel(periodSummary.start_date)} até ${formatDateLabel(periodSummary.end_date)}`
    : 'Nenhuma atividade registrada ainda';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <SummaryCard icon={<Flame size={22} />} value={`${dashboard?.study_streak_count ?? 0}`} label="Sequência (dias)" tone="amber" />
        <SummaryCard icon={<Timer size={22} />} value={`${pomodoroToday}`} label="Pomodoros hoje" tone="sky" />
        <SummaryCard icon={<Timer size={22} />} value={`${totalPomodoros}`} label={`Pomodoros · ${windowLabel}`} tone="violet" />
        <SummaryCard icon={<BookOpen size={22} />} value={`${studyDays}`} label={`Dias ativos · ${windowLabel}`} tone="emerald" />
        <SummaryCard icon={<Clock size={22} />} value={formatDurationCompact(totalActivityDuration)} label={`Tempo registrado · ${activityToday} atividades hoje`} tone="sky" />
        <SummaryCard icon={<ClipboardList size={22} />} value={periodLoading ? '…' : `${periodSummary?.questions_answered ?? 0}`} label={`Questões · ${currentPeriodLabel.toLowerCase()}`} tone="amber" />
      </div>

      <div className="rounded-[1.4rem] border-2 border-emerald-100 bg-emerald-100/70 p-5 dark:border-emerald-300/30 dark:bg-emerald-400/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-200">Atividade por período</p>
            <h2 className="mt-1 text-xl font-black text-slate-800 dark:text-slate-50">O que você fez · {currentPeriodLabel}</h2>
            <p className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-100">{periodDateLabel}</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-100">
            Período
            <select
              value={activityPeriod}
              onChange={(event) => setActivityPeriod(event.target.value as ActivityPeriod)}
              className="rounded-xl border-2 border-emerald-200 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none focus:border-emerald-400 dark:border-emerald-300/30 dark:bg-slate-950/60 dark:text-slate-50"
            >
              <option value="day">Dia</option>
              <option value="month">Mês</option>
              <option value="year">Ano</option>
              <option value="all">Geral</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-3 text-center dark:border-emerald-300/20 dark:bg-slate-950/45">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-50">{periodLoading ? '…' : periodSummary?.questions_answered ?? 0}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-200">Questões feitas</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-3 text-center dark:border-emerald-300/20 dark:bg-slate-950/45">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-50">{periodLoading ? '…' : periodSummary?.topics_studied ?? 0}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-200">Tópicos estudados</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-3 text-center dark:border-emerald-300/20 dark:bg-slate-950/45">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-50">{periodLoading ? '…' : periodSummary?.subjects_studied ?? 0}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-200">Matérias</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-white px-4 py-3 dark:border-emerald-300/20 dark:bg-slate-950/45">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-emerald-100">Matérias estudadas no período</p>
          {(periodSummary?.subject_names ?? []).length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {(periodSummary?.subject_names ?? []).map((name) => (
                <span key={name} className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100">{name}</span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-200">As matérias aparecerão aqui assim que você responder ou concluir uma atividade neste período.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[1.4rem] border-2 border-sky-100 bg-sky-100/70 p-4 dark:border-sky-300/30 dark:bg-sky-400/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-100">Comparativo semanal</p>
          <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-100">{thisWeekActivities} atividades nos 7 últimos dias da janela · {previousWeekActivities} nos 7 anteriores</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-sm font-black ${weeklyDelta >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-100' : 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-100'}`}>
          {previousWeekActivities === 0 ? 'Primeira semana' : `${weeklyDelta >= 0 ? '+' : ''}${weeklyDelta} eventos`}
        </span>
      </div>

      <div className="rounded-[1.4rem] border-2 border-amber-100 bg-white/90 p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-500">Questões por matéria</p>
            <h2 className="mt-1 text-xl font-black text-slate-800">Acertos e erros do Modo questões</h2>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
            <ClipboardList size={14} /> {questionMetrics.length} matéria{questionMetrics.length === 1 ? '' : 's'}
          </span>
        </div>

        {questionMetrics.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
            Ainda não há questões respondidas. Abra uma matéria em Programação, entre em Modo questões e resolva algumas para preencher este painel.
          </p>
        ) : (
          <div className="space-y-3">
            {questionMetrics.map((metric) => {
              const accuracy = Math.min(100, Math.max(0, metric.accuracy_percent));
              return (
                <article key={metric.subject_id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-800">{metric.subject_name}</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {metric.resolved_count} questão{metric.resolved_count === 1 ? '' : 'ões'} resolvida{metric.resolved_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-sm font-black text-amber-700 shadow-sm">
                      {accuracy}% de acerto
                    </span>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-rose-100">
                    <div className="h-2 rounded-full bg-emerald-400 transition-all" style={{ width: `${accuracy}%` }} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black">
                    <span className="rounded-xl bg-white px-2 py-2 text-slate-600">{metric.resolved_count} feitas</span>
                    <span className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-700">{metric.correct_count} acertos</span>
                    <span className="rounded-xl bg-rose-50 px-2 py-2 text-rose-700">{metric.error_count} erros</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[1.4rem] border-2 border-slate-100 bg-white/90 px-4 py-3">
        <p className="mr-auto text-sm font-black text-slate-700">
          Janela de 30 dias · <span className="font-bold text-slate-500">{formatDateLabel(windowStart)} até {formatDateLabel(windowEnd)}</span>
        </p>
        <button
          type="button"
          onClick={() => setWindowOffset((current) => current + 1)}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border-2 border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
        >
          <ChevronLeft size={16} /> 30 dias antes
        </button>
        <button
          type="button"
          onClick={() => setWindowOffset((current) => Math.max(0, current - 1))}
          disabled={windowOffset === 0}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border-2 border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          30 dias depois <ChevronRight size={16} />
        </button>
        {windowOffset === 0 ? null : (
          <button
            type="button"
            onClick={() => setWindowOffset(0)}
            className="inline-flex min-h-11 items-center rounded-xl border-2 border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Voltar para hoje
          </button>
        )}
      </div>

      <div className="rounded-[1.4rem] border-2 border-slate-100 bg-white/90 p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Pomodoros — {windowLabel}</p>
        <div className="flex items-end gap-[3px]" style={{ height: '72px' }}>
          {allDays.map((day) => (
            <div
              key={day.date}
              className="flex flex-1 flex-col items-center"
              title={`${day.date}: ${day.pomodoroCount} pomodoro${day.pomodoroCount !== 1 ? 's' : ''}`}
            >
              <div
                className={`w-full rounded-t-sm transition-all ${day.pomodoroCount > 0 ? 'bg-sky-400' : 'bg-slate-100'}`}
                style={{ height: `${Math.max(3, (day.pomodoroCount / maxPomodoros) * 68)}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-slate-400">
          <span>30 dias atrás</span>
          <span>Hoje</span>
        </div>
      </div>

      <div className="rounded-[1.4rem] border-2 border-slate-100 bg-white/90 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Atividade — {windowLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {allDays.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.activityCount} atividade${day.activityCount === 1 ? '' : 's'}`}
              className={`h-5 w-5 rounded-[4px] ${
                day.activityCount > 0 ? 'bg-emerald-400' : day.pomodoroCount > 0 ? 'bg-sky-300' : 'bg-slate-100'
              }`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-emerald-400" /> Atividade registrada</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-sky-300" /> Só pomodoro</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-slate-100 border border-slate-200" /> Sem atividade</span>
        </div>
      </div>

      <div className="rounded-[1.4rem] border-2 border-slate-100 bg-white/90 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Histórico recente</p>
        <div className="space-y-1">
          {allDays.slice(-14).reverse().map((day) => (
            <div key={day.date} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
              <span className="w-24 shrink-0 text-xs font-bold text-slate-700 sm:w-32 sm:text-sm">{formatDateLabel(day.date)}</span>
              <span className={`flex-1 text-xs font-semibold ${day.activityCount > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                {day.activityCount > 0 ? `${day.activityCount} atividade${day.activityCount === 1 ? '' : 's'}` : day.isStudyDay ? 'Estudo' : '—'}
              </span>
              {day.pomodoroCount > 0 ? (
                <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-700">
                  <Timer size={11} /> {day.pomodoroCount}
                </span>
              ) : (
                <span className="w-12" />
              )}
            </div>
          ))}
        </div>
        {dashboard?.last_study_date && (
          <p className="mt-3 text-xs text-slate-400">
            Último estudo registrado: <span className="font-bold">{formatDateLabel(dashboard.last_study_date)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function formatDurationCompact(seconds: number) {
  if (seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'amber' | 'sky' | 'violet' | 'emerald' }) {
  const toneStyles = {
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
    violet: 'border-violet-100 bg-violet-50 text-violet-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  }[tone];

  return (
    <div className={`rounded-[1.25rem] border-2 p-4 ${toneStyles}`}>
      {icon}
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="text-xs font-bold">{label}</p>
    </div>
  );
}
