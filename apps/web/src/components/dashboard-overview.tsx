'use client';

import { useMemo, type ReactNode } from 'react';
import { BookOpen, ClipboardList, Flame, Timer } from 'lucide-react';
import { type StudyDashboard, type StudyDay } from '@/lib/api';

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
  const allDays = useMemo(() => {
    const backendMap = new Map<string, StudyDay>();
    if (dashboard) {
      for (const day of dashboard.recent_days) backendMap.set(day.study_date, day);
      backendMap.set(dashboard.today.study_date, dashboard.today);
    }

    const result: Array<{ date: string; pomodoroCount: number; isStudyDay: boolean }> = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = getLocalDateValue(d);
      const backend = backendMap.get(key);
      const localCount = pomodoroState.completedByDate[key] ?? 0;
      const backendCount = backend?.pomodoro_count ?? 0;
      result.push({
        date: key,
        pomodoroCount: Math.max(localCount, backendCount),
        isStudyDay: backend?.is_study_day ?? false,
      });
    }
    return result;
  }, [dashboard, pomodoroState.completedByDate]);

  const maxPomodoros = useMemo(() => Math.max(1, ...allDays.map((d) => d.pomodoroCount)), [allDays]);
  const totalPomodoros = useMemo(() => allDays.reduce((sum, day) => sum + day.pomodoroCount, 0), [allDays]);
  const studyDays = useMemo(() => allDays.filter((day) => day.isStudyDay).length, [allDays]);
  const pomodoroToday = allDays[allDays.length - 1]?.pomodoroCount ?? 0;
  const questionMetrics = dashboard?.question_metrics ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={<Flame size={22} />} value={`${dashboard?.study_streak_count ?? 0}`} label="Sequência (dias)" tone="amber" />
        <SummaryCard icon={<Timer size={22} />} value={`${pomodoroToday}`} label="Pomodoros hoje" tone="sky" />
        <SummaryCard icon={<Timer size={22} />} value={`${totalPomodoros}`} label="Pomodoros (30 dias)" tone="violet" />
        <SummaryCard icon={<BookOpen size={22} />} value={`${studyDays}`} label="Dias de estudo (30 dias)" tone="emerald" />
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

      <div className="rounded-[1.4rem] border-2 border-slate-100 bg-white/90 p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Pomodoros — últimos 30 dias</p>
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
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Atividade — últimos 30 dias</p>
        <div className="flex flex-wrap gap-1.5">
          {allDays.map((day) => (
            <div
              key={day.date}
              title={day.date}
              className={`h-5 w-5 rounded-[4px] ${
                day.isStudyDay ? 'bg-emerald-400' : day.pomodoroCount > 0 ? 'bg-sky-300' : 'bg-slate-100'
              }`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-emerald-400" /> Estudo registrado</span>
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
              <span className={`flex-1 text-xs font-semibold ${day.isStudyDay ? 'text-emerald-600' : 'text-slate-300'}`}>
                {day.isStudyDay ? 'Estudo' : '—'}
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
