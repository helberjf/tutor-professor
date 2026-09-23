'use client';

import { BookOpen, ClipboardList, GraduationCap, Layers } from 'lucide-react';

import { CodingCurriculum } from '@/components/coding/CodingCurriculum';
import { CurriculumTrackProvider } from '@/components/coding/curriculum-context';
import { ExamList } from '@/components/exam/ExamList';
import type { CurriculumTrack } from '@/lib/api';
import type { PomodoroMode } from '@/lib/pomodoro';

import type { CodingMode } from '../_lib/study-helpers';
import { PomodoroWidget } from './shared';
import { t } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════════════════════════
// CURRICULUM TAB — programming and "Outras matérias"
// ═══════════════════════════════════════════════════════════════════════════════
// Both lists are studied the same way: reading, flashcards, questions and a
// timed simulado. `track` only says which list the screens read and write; the
// LeetCode trainer inside the curriculum shows up for programming alone.
export function CodingTab({
  track = 'programming', codingMode, setCodingMode,
  initialSubjectId, initialTopicId,
  pomodoroMode, pomodoroSeconds, pomodoroRunning, todayPomodoroCount,
  notificationPermission, pomodoroMessage,
  onTogglePomodoro, onSwitchPomodoro, onRequestNotifications,
}: {
  track?: CurriculumTrack;
  codingMode: CodingMode;
  setCodingMode: (mode: CodingMode) => void;
  initialSubjectId: number | null;
  initialTopicId: number | null;
  pomodoroMode: PomodoroMode; pomodoroSeconds: number; pomodoroRunning: boolean; todayPomodoroCount: number;
  notificationPermission: NotificationPermission | 'unsupported'; pomodoroMessage: string;
  onTogglePomodoro: () => void;
  onSwitchPomodoro: (m: PomodoroMode) => void;
  onRequestNotifications: () => void;
}) {
  return (
    <CurriculumTrackProvider track={track}>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 min-w-0 lg:order-1">
          <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setCodingMode('reading')}
              className={`flex min-h-16 items-center gap-3 rounded-[1.35rem] border-2 p-3 text-left transition sm:min-h-24 sm:gap-4 sm:p-4 ${
                codingMode === 'reading'
                  ? 'border-primary bg-primary-dark text-white shadow-sm'
                  : 'border-slate-100 bg-white/85 text-slate-600 hover:border-primary/40 hover:bg-white'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${codingMode === 'reading' ? 'bg-white/20 text-white' : 'bg-sky-50 text-primary'}`}>
                <BookOpen size={22} />
              </span>
              <span>
                <span className="block text-sm font-black sm:text-lg">{t("Modo leitura")}</span>
                <span className={`mt-0.5 hidden text-xs font-semibold sm:mt-1 sm:block sm:text-sm ${codingMode === 'reading' ? 'text-white/80' : 'text-slate-500'}`}>{t("Abrir aulas e tópicos")}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCodingMode('flashcards')}
              className={`flex min-h-16 items-center gap-3 rounded-[1.35rem] border-2 p-3 text-left transition sm:min-h-24 sm:gap-4 sm:p-4 ${
                codingMode === 'flashcards'
                  ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                  : 'border-slate-100 bg-white/85 text-slate-600 hover:border-violet-300 hover:bg-white'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${codingMode === 'flashcards' ? 'bg-white/20 text-white' : 'bg-violet-50 text-violet-600'}`}>
                <Layers size={22} />
              </span>
              <span>
                <span className="block text-sm font-black sm:text-lg">{t("Modo flashcards")}</span>
                <span className={`mt-0.5 hidden text-xs font-semibold sm:mt-1 sm:block sm:text-sm ${codingMode === 'flashcards' ? 'text-white/80' : 'text-slate-500'}`}>{t("Treinar perguntas por matéria")}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCodingMode('questions')}
              className={`flex min-h-16 items-center gap-3 rounded-[1.35rem] border-2 p-3 text-left transition sm:min-h-24 sm:gap-4 sm:p-4 ${
                codingMode === 'questions'
                  ? 'border-amber-500 bg-amber-700 text-white shadow-sm'
                  : 'border-slate-100 bg-white/85 text-slate-600 hover:border-amber-300 hover:bg-white'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${codingMode === 'questions' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-600'}`}>
                <ClipboardList size={22} />
              </span>
              <span>
                <span className="block text-sm font-black sm:text-lg">{t("Modo questões")}</span>
                <span className={`mt-0.5 hidden text-xs font-semibold sm:mt-1 sm:block sm:text-sm ${codingMode === 'questions' ? 'text-white/80' : 'text-slate-500'}`}>{t("Treinar simulados por tópico")}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCodingMode('exam')}
              className={`flex min-h-16 items-center gap-3 rounded-[1.35rem] border-2 p-3 text-left transition sm:min-h-24 sm:gap-4 sm:p-4 ${
                codingMode === 'exam'
                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                  : 'border-slate-100 bg-white/85 text-slate-600 hover:border-indigo-300 hover:bg-white'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${codingMode === 'exam' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                <GraduationCap size={22} />
              </span>
              <span>
                <span className="block text-sm font-black sm:text-lg">{t("Modo simulado")}</span>
                <span className={`mt-0.5 hidden text-xs font-semibold sm:mt-1 sm:block sm:text-sm ${codingMode === 'exam' ? 'text-white/80' : 'text-slate-500'}`}>{t("Prova cronometrada com nota no fim")}</span>
              </span>
            </button>
          </section>
          {codingMode === 'exam' ? (
            <ExamList />
          ) : (
            <CodingCurriculum
              focusMode={codingMode}
              initialSubjectId={initialSubjectId}
              initialTopicId={initialTopicId}
            />
          )}
        </div>
        <aside className="order-1 min-w-0 space-y-6 lg:order-2 lg:sticky lg:top-24 lg:w-72 lg:self-start xl:w-80">
          <PomodoroWidget
            mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
            todayCount={todayPomodoroCount} notificationPermission={notificationPermission}
            message={pomodoroMessage} onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro}
            onRequestNotifications={onRequestNotifications}
          />
        </aside>
      </div>
    </CurriculumTrackProvider>
  );

}
