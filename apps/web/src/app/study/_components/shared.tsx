'use client';

import type { ReactNode } from 'react';
import { Bell, Pause, Play, RotateCcw, Timer } from 'lucide-react';

import { DashboardOverview } from '@/components/dashboard-overview';
import { StudyStatisticsPanel } from '@/components/study-statistics-panel';
import type { StudyDashboard } from '@/lib/api';
import { formatTimer, type PomodoroMode } from '@/lib/pomodoro';

import { getPomodoroCompletionMessage } from '../_lib/study-helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// TAB BUTTON
// ═══════════════════════════════════════════════════════════════════════════════
export function TabButton({ active, onClick, icon, label, mobileLabel }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; mobileLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-fit shrink-0 items-center justify-center gap-2 rounded-[1.15rem] px-4 py-2.5 text-sm font-black transition ${
        active ? 'bg-primary text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{mobileLabel ?? label}</span>
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
  return (
    <div className="kid-surface border-sky-100 p-3 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 md:h-12 md:w-12 md:rounded-2xl"><Timer size={20} className="md:h-6 md:w-6" /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Pomodoro</p>
            <h2 className="text-lg font-black text-slate-800 md:text-xl">{mode === 'focus' ? 'Foco' : 'Pausa'}</h2>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500 md:px-3 md:py-1.5 md:text-xs">{mode === 'focus' ? '25 min' : '5 min'}</span>
      </div>

      <div className="mt-3 rounded-[1.25rem] border-2 border-slate-100 bg-white p-3 text-center md:mt-5 md:rounded-[1.5rem] md:p-5">
        <p className="font-mono text-3xl font-black text-slate-800 md:text-6xl">{formatTimer(seconds)}</p>
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-left md:mt-4 md:rounded-2xl md:px-4 md:py-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">Pomodoros hoje</p>
          <p className="mt-1 text-lg font-black text-emerald-700 md:text-2xl">
            {todayCount} <span className="text-xs font-bold text-emerald-600 md:text-sm">{todayCount === 1 ? 'feito' : 'feitos'}</span>
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:mt-4">
          <button type="button" onClick={() => onSwitch('focus')}
            className={`rounded-xl px-3 py-2 text-xs font-black transition md:rounded-2xl md:text-sm ${mode === 'focus' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Foco
          </button>
          <button type="button" onClick={() => onSwitch('break')}
            className={`rounded-xl px-3 py-2 text-xs font-black transition md:rounded-2xl md:text-sm ${mode === 'break' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Pausa
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onToggle}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-2.5 text-xs font-black text-white transition hover:bg-slate-700 md:min-h-11 md:gap-2 md:rounded-2xl md:px-3 md:text-sm">
            {running ? <Pause size={14} className="md:h-4 md:w-4" /> : <Play size={14} className="md:h-4 md:w-4" />}
            {running ? 'Pausar' : 'Iniciar'}
          </button>
          <button type="button" onClick={() => onSwitch(mode)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-2.5 text-xs font-black text-slate-600 transition hover:border-primary hover:text-primary md:min-h-11 md:gap-2 md:rounded-2xl md:px-3 md:text-sm">
            <RotateCcw size={14} className="md:h-4 md:w-4" /> Reiniciar
          </button>
        </div>
      </div>

      <button type="button" onClick={onRequestNotifications}
        disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 md:min-h-11 md:gap-2 md:rounded-2xl md:text-sm">
        <Bell size={14} className="md:h-4 md:w-4" />
        {notificationPermission === 'granted' ? 'Notificacoes ativas' : notificationPermission === 'unsupported' ? 'Sem suporte' : 'Ativar notificacoes'}
      </button>
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
    <div className={`rounded-[1.1rem] border-2 border-white/80 bg-white/85 shadow-[0_12px_32px_rgba(14,165,233,0.08)] ${compact ? 'p-2 sm:p-4' : 'p-3 sm:p-4'}`}>
      <div className={`inline-flex items-center justify-center ${compact ? 'h-7 w-7 rounded-lg sm:h-11 sm:w-11 sm:rounded-2xl' : 'h-9 w-9 rounded-2xl sm:h-11 sm:w-11'} ${toneStyles}`}>{icon}</div>
      <p className={`font-bold uppercase tracking-[0.1em] text-slate-400 ${compact ? 'mt-1.5 text-[8px] sm:mt-3 sm:text-xs' : 'mt-2 text-[10px] sm:mt-3 sm:text-xs'}`}>{label}</p>
      <p className={`mt-0.5 break-words font-black text-slate-800 ${compact ? 'text-base leading-5 sm:text-2xl' : 'text-xl sm:text-2xl'}`}>{value}</p>
      <p className={`mt-0.5 font-semibold text-slate-500 ${compact ? 'hidden sm:block sm:text-sm sm:leading-5' : 'text-xs leading-5 sm:text-sm'}`}>{helper}</p>
    </div>
  );
}
