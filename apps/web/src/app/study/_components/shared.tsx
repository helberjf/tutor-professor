'use client';

import { useState, type ReactNode } from 'react';
import { Bell, ChevronDown, Pause, Play, RotateCcw, Timer } from 'lucide-react';

import { DashboardOverview } from '@/components/dashboard-overview';
import { StudyStatisticsPanel } from '@/components/study-statistics-panel';
import type { StudyDashboard } from '@/lib/api';
import { formatTimer, type PomodoroMode } from '@/lib/pomodoro';

import { getPomodoroCompletionMessage } from '../_lib/study-helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// TAB BUTTON
// ═══════════════════════════════════════════════════════════════════════════════
/** flex-1 + min-w-0 so all three tabs share the row and fit from 320px up, instead
 *  of overflowing and leaving the active tab clipped at the screen edge. */
export function TabButton({ active, onClick, icon, label, mobileLabel }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; mobileLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[1.15rem] px-2 py-2.5 text-xs font-black transition sm:gap-2 sm:px-4 sm:text-sm ${
        active ? 'bg-primary text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="hidden truncate sm:inline">{label}</span>
      <span className="truncate sm:hidden">{mobileLabel ?? label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// POMODORO WIDGET (shared)
// ═══════════════════════════════════════════════════════════════════════════════
export function PomodoroWidget({
  mode, seconds, running, todayCount, notificationPermission, message,
  onToggle, onSwitch, onRequestNotifications,
}: {
  mode: PomodoroMode; seconds: number; running: boolean; todayCount: number;
  notificationPermission: NotificationPermission | 'unsupported'; message: string;
  onToggle: () => void;
  onSwitch: (m: PomodoroMode) => void;
  onRequestNotifications: () => void;
}) {
  // The dropdown exists to buy vertical space on a phone, where the widget sits
  // in the scroll flow. From md up it lives in its own column with room to
  // spare, so the panel is simply always open there and the toggle is gone: the
  // collapsed header could not fit the timer and the button side by side in
  // that narrow column anyway, and the button clipped the clock.
  const [open, setOpen] = useState(false);
  const isFocus = mode === 'focus';

  return (
    <div className="kid-surface border-sky-100 p-3 md:p-4">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 md:h-11 md:w-11 md:rounded-2xl">
          <Timer size={20} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Pomodoro</p>
          <p className="flex items-baseline gap-2">
            <span className="text-base font-black leading-tight text-slate-800 md:text-lg">
              {isFocus ? 'Foco' : 'Pausa'}
            </span>
            <span
              className={`font-mono text-base font-black tabular-nums leading-tight text-slate-800 md:hidden ${
                open ? 'hidden' : ''
              }`}
            >
              {formatTimer(seconds)}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black text-white transition md:rounded-2xl md:px-4 md:text-sm ${
            running ? 'bg-slate-800 hover:bg-slate-700' : 'bg-sky-600 hover:bg-sky-700'
          }`}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? 'Pausar' : 'Iniciar'}
        </button>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="pomodoro-details"
          aria-label={open ? 'Fechar ajustes do pomodoro' : 'Abrir ajustes do pomodoro'}
          className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 md:hidden"
        >
          <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div id="pomodoro-details" className={open ? 'block' : 'hidden md:block'}>
        <div className="mt-3 rounded-[1.25rem] border-2 border-slate-100 bg-white p-3 text-center md:rounded-[1.5rem] md:p-5">
          <p className="font-mono text-3xl font-black text-slate-800 md:text-5xl">{formatTimer(seconds)}</p>
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-left md:mt-4 md:rounded-2xl md:px-4 md:py-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">Pomodoros hoje</p>
            <p className="mt-1 text-lg font-black text-emerald-700 md:text-2xl">
              {todayCount} <span className="text-xs font-bold text-emerald-600 md:text-sm">{todayCount === 1 ? 'feito' : 'feitos'}</span>
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:mt-4">
            <button type="button" onClick={() => onSwitch('focus')}
              className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition md:rounded-2xl md:text-sm ${mode === 'focus' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Foco
            </button>
            <button type="button" onClick={() => onSwitch('break')}
              className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition md:rounded-2xl md:text-sm ${mode === 'break' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Pausa
            </button>
          </div>
          <button type="button" onClick={() => onSwitch(mode)}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:border-primary hover:text-primary md:rounded-2xl md:text-sm">
            <RotateCcw size={15} /> Reiniciar
          </button>
        </div>

        <button type="button" onClick={onRequestNotifications}
          disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 md:rounded-2xl md:text-sm">
          <Bell size={15} />
          {notificationPermission === 'granted' ? 'Notificações ativas' : notificationPermission === 'unsupported' ? 'Sem suporte' : 'Ativar notificações'}
        </button>
      </div>

      {message && <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700">{message}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════════════════
export function DashboardTab({ dashboard, pomodoroState }: { dashboard: StudyDashboard | null; pomodoroState: { completedByDate: Record<string, number> } }) {
  return (
    <div className="space-y-6">
      <DashboardOverview dashboard={dashboard} pomodoroState={pomodoroState} />
      <StudyStatisticsPanel />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD
// ═══════════════════════════════════════════════════════════════════════════════
export function MetricCard({ icon, label, value, helper, tone, compact = false }: {
  icon: ReactNode; label: string; value: string; helper: string;
  tone: 'orange' | 'green' | 'rose' | 'sky';
  compact?: boolean;
}) {
  const toneStyles = { orange: 'bg-orange-100 text-orange-700', green: 'bg-emerald-100 text-emerald-700', rose: 'bg-rose-100 text-rose-700', sky: 'bg-sky-100 text-sky-700' }[tone];
  return (
    <div className={`flex h-full flex-col rounded-[1.1rem] border-2 border-white/80 bg-white/85 shadow-[0_12px_32px_rgba(14,165,233,0.08)] ${compact ? 'p-2.5 sm:p-4' : 'p-3 sm:p-4'}`}>
      <div className={`inline-flex shrink-0 items-center justify-center ${compact ? 'h-8 w-8 rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl' : 'h-9 w-9 rounded-2xl sm:h-11 sm:w-11'} ${toneStyles}`}>{icon}</div>
      {/* The label used to drop to 8px on a phone, which is below anything a
       * child can read. 11px is the floor here; the tracking does the rest. */}
      <p className={`font-bold uppercase leading-tight tracking-[0.08em] text-slate-400 ${compact ? 'mt-2 text-[11px] sm:mt-3 sm:text-xs sm:tracking-[0.1em]' : 'mt-2 text-[11px] sm:mt-3 sm:text-xs sm:tracking-[0.1em]'}`}>{label}</p>
      <p className={`mt-1 break-words font-black leading-tight text-slate-800 ${compact ? 'text-lg sm:text-2xl' : 'text-xl sm:text-2xl'}`}>{value}</p>
      <p className={`mt-1 font-semibold leading-5 text-slate-500 ${compact ? 'hidden sm:block sm:text-sm' : 'text-xs sm:text-sm'}`}>{helper}</p>
    </div>
  );
}
