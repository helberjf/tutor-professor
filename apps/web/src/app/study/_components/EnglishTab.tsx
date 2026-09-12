'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, Circle, ClipboardList, Flame, Loader2, Plus, RotateCcw, Save, Sparkles, Trash2, X, Zap } from 'lucide-react';

import { ApiError, type StudyDashboard } from '@/lib/api';
import type { PomodoroMode } from '@/lib/pomodoro';

import { formatDateLabel } from '../_lib/study-helpers';
import { EnglishQuestionsSection } from './EnglishQuestionsSection';
import { PomodoroWidget } from './shared';

// ═══════════════════════════════════════════════════════════════════════════════
// ENGLISH TAB
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * One figure in the goal card's footer row. `compactValue` is for the cell whose
 * value is a date rather than a number, so a two-word date does not tower over
 * the counters beside it.
 */
function StatCell({
  icon, tint, value, label, helper, compactValue = false,
}: {
  icon: ReactNode; tint: string; value: string; label: string; helper: string; compactValue?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 text-center sm:px-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
      {/* Fixed height so a date that wraps to two lines does not push its own
       * label below the labels of the counters beside it. */}
      <p
        className={`flex min-h-[2.25rem] items-center break-words text-center font-black leading-tight text-slate-800 ${
          compactValue ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-slate-400">{label}</p>
      <p className="hidden text-xs font-semibold leading-5 text-slate-500 sm:block">{helper}</p>
    </div>
  );
}

export function EnglishTab({
  dashboard, selectedDate,
  planText, setPlanText, studiedText, setStudiedText,
  distractions, newDistraction, setNewDistraction,
  addDistraction, removeDistraction,
  loadingDay, dayLoadFailed, onRetryLoadDay, saving, error, savedMessage, onSave,
  generatingLesson, lessonGenMessage, onGenerateLesson,
  pomodoroMode, pomodoroSeconds, pomodoroRunning, todayPomodoroCount,
  notificationPermission, pomodoroMessage,
  onTogglePomodoro, onSwitchPomodoro, onRequestNotifications,
}: {
  dashboard: StudyDashboard | null;
  selectedDate: string;
  planText: string; setPlanText: (v: string) => void;
  studiedText: string; setStudiedText: (v: string) => void;
  distractions: string[];
  newDistraction: string; setNewDistraction: (v: string) => void;
  addDistraction: () => void;
  removeDistraction: (i: number) => void;
  loadingDay: boolean; dayLoadFailed: boolean; onRetryLoadDay: () => void; saving: boolean;
  error: ApiError | null; savedMessage: string;
  onSave: () => void;
  generatingLesson: boolean; lessonGenMessage: string;
  onGenerateLesson: () => void;
  pomodoroMode: PomodoroMode; pomodoroSeconds: number; pomodoroRunning: boolean; todayPomodoroCount: number;
  notificationPermission: NotificationPermission | 'unsupported'; pomodoroMessage: string;
  onTogglePomodoro: () => void;
  onSwitchPomodoro: (m: PomodoroMode) => void;
  onRequestNotifications: () => void;
}) {
  const selectedIsToday = dashboard?.today.study_date === selectedDate;
  const todayDistractionCount = dashboard?.today.distractions.length ?? 0;
  const hasStudyText = studiedText.trim().length > 0;
  const historyDays = dashboard?.recent_days ?? [];

  const phrasesGoal = 3;
  // The backend only knows whether the day was studied, not how many phrases.
  // Three separately-filling segments implied a per-phrase count that never
  // existed: they could only be all empty or all full, which read as three grey
  // placeholder bars. One bar for a yes/no fact, said plainly.
  //
  // What counts as studied changed: answering the day's queue closes the day on
  // its own. Writing a note is a record worth keeping, not a toll gate in front
  // of a child who already did the work.
  const closedByActivity = Boolean(selectedIsToday && dashboard?.today.closed_by_activity);
  const goalMet = hasStudyText || closedByActivity;
  const isRegistered = Boolean(dashboard?.today.is_study_day);

  return (
    <div className="space-y-6">
      {/* Dashboard header */}
      <section className="app-surface border-primary/30 p-4 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Inglês · meta do dia</p>
            <h1 className="mt-1.5 text-2xl font-black leading-tight text-slate-800 md:text-3xl">3 frases por dia</h1>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black ${
              isRegistered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {isRegistered ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            {isRegistered ? 'Registrado' : 'Em aberto'}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200"
            role="progressbar"
            aria-valuenow={goalMet ? phrasesGoal : 0}
            aria-valuemin={0}
            aria-valuemax={phrasesGoal}
            aria-label="Meta de frases do dia"
          >
            <div className={`h-full rounded-full bg-emerald-400 transition-all duration-500 ${goalMet ? 'w-full' : 'w-0'}`} />
          </div>
          <span className="shrink-0 text-sm font-black tabular-nums text-slate-500">
            {goalMet ? phrasesGoal : 0}/{phrasesGoal}
          </span>
        </div>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          {closedByActivity && !hasStudyText
            ? 'Meta do dia cumprida estudando. Escrever aqui é opcional.'
            : goalMet
              ? 'Meta do dia cumprida. Salve para registrar.'
              : 'Estude na sessão de hoje ou escreva o que estudou para fechar a meta.'}
        </p>

        {/* The four nested cards became a stat row: same numbers, one card
         * instead of five, and no more uneven tiles when a date wrapped. */}
        <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 border-t-2 border-slate-100 pt-4">
          <StatCell
            icon={<Flame size={16} className="text-orange-600" />}
            tint="bg-orange-100"
            value={`${dashboard?.study_streak_count ?? 0}`}
            label="Dias seguidos"
            helper={dashboard?.last_study_date ? `Último: ${formatDateLabel(dashboard.last_study_date)}` : 'Comece hoje'}
          />
          <StatCell
            icon={<ClipboardList size={16} className="text-rose-700" />}
            tint="bg-rose-100"
            value={`${todayDistractionCount}`}
            label="Distrações"
            helper="Registradas hoje"
          />
          <StatCell
            icon={<CalendarDays size={16} className="text-sky-700" />}
            tint="bg-sky-100"
            value={formatDateLabel(selectedDate)}
            label={selectedIsToday ? 'Hoje' : 'Histórico'}
            helper={selectedIsToday ? 'Dia aberto' : 'Registro anterior'}
            compactValue
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        {/* Main record */}
        <div className="app-surface border-sky-100 p-5 md:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Registro</p>
              <h2 className="mt-2 text-2xl font-black text-slate-800">{formatDateLabel(selectedDate)}</h2>
            </div>
            {loadingDay ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-500">
                <Loader2 className="animate-spin" size={16} /> Carregando
              </span>
            ) : (
              <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${hasStudyText ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {hasStudyText ? 'Estudo marcado' : 'Planejamento'}
              </span>
            )}
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-black text-slate-700">Planejamento para esta data</span>
              <textarea value={planText} onChange={(e) => setPlanText(e.target.value)} rows={4} maxLength={2000}
                placeholder="Ex.: Depois do jantar, revisar 3 frases e ler uma pagina."
                className="mt-2 w-full resize-none rounded-[1.25rem] border-2 border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-700 outline-none transition focus:border-primary" />
            </label>

            <label className="block">
              <span className="text-sm font-black text-slate-700">O que estudou</span>
              <textarea value={studiedText} onChange={(e) => setStudiedText(e.target.value)} rows={5} maxLength={3000}
                placeholder="Ex.: Fiz a lição de greetings, ouvi os áudios e revisei flashcards."
                className="mt-2 w-full resize-none rounded-[1.25rem] border-2 border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-700 outline-none transition focus:border-primary" />
            </label>

            <div>
              <span className="text-sm font-black text-slate-700">Distracoes percebidas</span>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
              aria-label="Celular, video, notificacao" value={newDistraction} onChange={(e) => setNewDistraction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDistraction(); } }}
                  maxLength={80} placeholder="Celular, video, notificacao..."
                  className="min-h-12 min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base text-slate-700 outline-none transition focus:border-primary" />
                <button type="button" onClick={addDistraction}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 text-base font-black text-white transition hover:bg-slate-700">
                  <Plus size={18} /> Adicionar
                </button>
              </div>
              {distractions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {distractions.map((item, i) => (
                    <span key={`${item}-${i}`} className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-2 text-sm font-bold text-orange-700">
                      {item}
                      <button type="button" onClick={() => removeDistraction(i)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-orange-700 transition hover:bg-white">
                        <Trash2 size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">Nenhuma distracao registrada.</p>
              )}
            </div>

            {error && !error.isOffline && !error.isUnconfigured ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error.message}</p>
            ) : null}
            {savedMessage ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{savedMessage}</p>
            ) : null}

            {dayLoadFailed && (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                <p>Não consegui carregar o registro deste dia, então salvar está bloqueado para não apagar o que já estava gravado.</p>
                <button
                  type="button"
                  onClick={onRetryLoadDay}
                  className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-amber-300 px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100"
                >
                  <RotateCcw size={14} /> Tentar carregar de novo
                </button>
              </div>
            )}

            <button type="button" onClick={onSave} disabled={saving || loadingDay || dayLoadFailed}
              className="app-button w-full bg-primary hover:bg-primary-dark">
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar registro
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <PomodoroWidget
            mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
            todayCount={todayPomodoroCount}
            notificationPermission={notificationPermission} message={pomodoroMessage}
            onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro} onRequestNotifications={onRequestNotifications}
          />

          <div className="app-surface border-emerald-100 p-5 md:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><BookOpen size={24} /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Dica</p>
                <h2 className="text-xl font-black text-slate-800">Uma coisa por vez</h2>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
              <p>Escreva o plano antes de dormir ou no comeco do dia.</p>
              <p>Depois do estudo, registre o que realmente fez. Esse campo alimenta os dias seguidos.</p>
              <p>Use as distracoes como observacao, sem culpa.</p>
            </div>
          </div>

          {/* Generate lesson with AI */}
          <div className="app-surface border-violet-100 p-5 md:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Sparkles size={24} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">IA</p>
                <h2 className="text-xl font-black text-slate-800">Criar lição</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">Gere uma nova lição de inglês com inteligência artificial.</p>
            <button
              type="button"
              onClick={onGenerateLesson}
              disabled={generatingLesson}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generatingLesson ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {generatingLesson ? 'Criando lição...' : 'Criar lição com IA'}
            </button>
            {lessonGenMessage && (
              <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${lessonGenMessage.startsWith('Nova') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {lessonGenMessage}
              </p>
            )}
          </div>

          {historyDays.length > 0 && (
            <div className="app-surface border-slate-100 p-5 md:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Historico recente</p>
              <div className="mt-4 space-y-3">
                {historyDays.map((item) => (
                  <div key={item.study_date}
                    className={`w-full rounded-[1.15rem] border-2 p-4 ${item.study_date === selectedDate ? 'border-primary bg-primary-light' : 'border-slate-100 bg-white'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black text-slate-800">{formatDateLabel(item.study_date)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.is_study_day ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {item.is_study_day ? 'estudou' : 'plano'}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{item.studied_text || item.plan_text || 'Sem anotacoes.'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <EnglishQuestionsSection />
    </div>
  );
}
