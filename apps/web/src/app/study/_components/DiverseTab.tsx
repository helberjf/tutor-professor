'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Copy,
  Flame, Layers, Loader2, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, X, Zap,
} from 'lucide-react';

import { SyntaxCodeBlock } from '@/components/coding/SyntaxCodeBlock';
import { api, type CatalogSubject, type CodingTopic, type DiverseDay, type DiverseLessonBlock, type DiverseSubject } from '@/lib/api';
import { findItemIndexById, isUncertainDiverseGenerationError, reconcileStudyQueueByTopicIds, resolveItemsByIds } from '@/lib/diverse-question-state';
import type { PomodoroMode } from '@/lib/pomodoro';

import {
  RATING_META,
  buildLessonTitle,
  buildStudyOrder,
  formatDateLabel,
  getDiverseSubjectLessons,
  getDiverseSubjectSlug,
  getDiverseSubjectTopics,
  parseJsonTopics,
  resolveDiverseLessonTopics,
  type DiverseAIAction,
  type InlineStudyState,
  type PendingLessonDraft,
  type StudyRating,
} from '../_lib/study-helpers';
import { MetricCard, PomodoroWidget } from './shared';

// ═══════════════════════════════════════════════════════════════════════════════
// OTHER SUBJECTS PICKER
// ═══════════════════════════════════════════════════════════════════════════════
export function OtherSubjectsPicker({
  subjects, selectedValue, onSelectOverview, onSelectCoding, onSelectSubjectTab,
}: {
  subjects: DiverseSubject[];
  selectedValue: string;
  onSelectOverview: () => void;
  onSelectCoding: () => void;
  onSelectSubjectTab: (slug: string) => void;
}) {
  return (
    <div className="mb-6 rounded-[1.1rem] border-2 border-slate-100 bg-white/80 p-3 sm:rounded-[1.4rem] sm:p-4">
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        Abrir matéria
      </label>
      <div className="relative">
        <select
          aria-label="Selecionar matéria"
          value={selectedValue}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) onSelectOverview();
            else if (value === '__coding__') onSelectCoding();
            else onSelectSubjectTab(value);
          }}
          className="min-h-12 w-full appearance-none rounded-2xl border-2 border-slate-200 bg-white px-4 pr-12 text-sm font-black text-slate-700 outline-none transition focus:border-primary"
        >
          <option value="">Todas as matérias</option>
          <option value="__coding__">Programação</option>
          {subjects.map((subject, index) => {
            const slug = getDiverseSubjectSlug(subject, index, subjects);
            return <option key={slug} value={slug}>{subject.name}</option>;
          })}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIVERSE TAB
// ═══════════════════════════════════════════════════════════════════════════════
export function DiverseTab({
  selectedDate, diverseDay, catalog, loadingDiverse, savingDiverse,
  diverseSaved, diverseError, newSubjectName, setNewSubjectName,
  onAddSubject, onGenerateAI, generatingAI, aiAction, lastAIAction, aiError,
  selectedSubjectSlug, onSelectSubjectTab, onSelectOverview, onSelectCoding,
  onRemoveSubject, onToggleTopic, onUpdateTopicText, onUpdateTopicAnswer,
  onUpdateSubjectName, onGenerateTopicAI, onRegenerateTopicAI, onGenerateLessonAI, onBulkAddTopics,
  onGenerateMoreQuestions, generatingDiverseQuestions,
  onRateTopic, onRateLessonTopic, onSessionComplete,
  onRemoveLesson, onToggleLessonTopic, onUpdateLessonTitle, onUpdateLessonTopicText,
  onUpdateLessonTopicAnswer, pendingLessonDraft, onSaveLessonDraft, onDiscardLessonDraft, onSave,
  pomodoroMode, pomodoroSeconds, pomodoroRunning, todayPomodoroCount,
  notificationPermission, pomodoroMessage,
  onTogglePomodoro, onSwitchPomodoro, onRequestNotifications,
}: {
  selectedDate: string;
  diverseDay: DiverseDay | null;
  catalog: CatalogSubject[];
  loadingDiverse: boolean; savingDiverse: boolean;
  diverseSaved: string; diverseError: string;
  newSubjectName: string; setNewSubjectName: (v: string) => void;
  onAddSubject: () => void | Promise<void>;
  onGenerateAI: (apiKey?: string) => void;
  generatingAI: boolean;
  aiAction: DiverseAIAction | null;
  lastAIAction: DiverseAIAction | null;
  aiError: string;
  selectedSubjectSlug: string | null;
  onSelectSubjectTab: (slug: string) => void;
  onSelectOverview: () => void;
  onSelectCoding: () => void;
  onRemoveSubject: (i: number) => void | Promise<void>;
  onToggleTopic: (si: number, ti: number) => void;
  onUpdateTopicText: (si: number, ti: number, v: string) => void;
  onUpdateTopicAnswer: (si: number, ti: number, v: string) => void;
  onUpdateSubjectName: (si: number, v: string) => void;
  onGenerateTopicAI: (subjectId: string, apiKey?: string) => void;
  onRegenerateTopicAI: (subjectIndex: number, topicIndex: number, context?: string, apiKey?: string) => void | Promise<void>;
  onGenerateLessonAI: (subjectId: string, apiKey?: string, context?: string) => void;
  onGenerateMoreQuestions: (subjectId: string, lessonId: string, context?: string) => Promise<string>;
  generatingDiverseQuestions: boolean;
  pendingLessonDraft: PendingLessonDraft | null;
  onSaveLessonDraft: () => void;
  onDiscardLessonDraft: () => void;
  onBulkAddTopics: (si: number, topics: CodingTopic[]) => void;
  onRateTopic: (si: number, ti: number, rating: StudyRating) => void;
  onRateLessonTopic: (si: number, topicId: string, rating: StudyRating) => void;
  onSessionComplete: () => void;
  onRemoveLesson: (si: number, li: number) => void;
  onToggleLessonTopic: (si: number, topicId: string) => void;
  onUpdateLessonTitle: (si: number, li: number, v: string) => void;
  onUpdateLessonTopicText: (si: number, topicId: string, v: string) => void;
  onUpdateLessonTopicAnswer: (si: number, topicId: string, v: string) => void;
  onSave: () => void;
  pomodoroMode: PomodoroMode; pomodoroSeconds: number; pomodoroRunning: boolean; todayPomodoroCount: number;
  notificationPermission: NotificationPermission | 'unsupported'; pomodoroMessage: string;
  onTogglePomodoro: () => void;
  onSwitchPomodoro: (m: PomodoroMode) => void;
  onRequestNotifications: () => void;
}) {
  const subjects = diverseDay?.custom_subjects ?? [];
  const totalDone = subjects.flatMap(getDiverseSubjectTopics).filter((t) => t.done).length;
  const totalTopics = subjects.flatMap(getDiverseSubjectTopics).length;
  const subjectTabs = subjects.map((subject, index) => ({ subject, index, slug: getDiverseSubjectSlug(subject, index, subjects) }));
  const selectedSubject = subjectTabs.find((item) => item.slug === selectedSubjectSlug) ?? null;
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const needsKeyConfig = aiError.toLowerCase().includes('chave') || aiError.toLowerCase().includes('configur') || aiError.toLowerCase().includes('api');

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="kid-surface border-primary/30 p-2.5 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Outras matérias</p>
        <h1 className="mt-1 text-lg font-black text-slate-800 md:mt-2 md:text-4xl">Aprenda qualquer assunto</h1>
        <p className="mt-1 text-sm text-slate-500 md:text-base">{formatDateLabel(selectedDate)}</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-5 sm:gap-3 sm:grid-cols-3">
          <MetricCard compact icon={<Layers size={16} />} label="Materias" value={`${subjects.length}`} helper="Criadas hoje" tone="sky" />
          <MetricCard compact icon={<CheckCircle2 size={16} />} label="Feitos" value={`${totalDone}/${totalTopics}`} helper="No total" tone="green" />
          <MetricCard compact icon={<Flame size={16} />} label="Meta" value={totalDone > 0 && totalDone === totalTopics ? 'Completa!' : 'Progresso'}
            helper={`${totalTopics - totalDone} restantes`} tone={totalDone === totalTopics && totalTopics > 0 ? 'green' : 'orange'} />
        </div>
      </section>

      {selectedSubject ? (
        <DiverseSubjectDashboard
          selectedDate={selectedDate}
          subject={selectedSubject.subject}
          onBack={onSelectOverview}
          onRemove={() => void onRemoveSubject(selectedSubject.index)}
          onToggleTopic={(ti) => onToggleTopic(selectedSubject.index, ti)}
          onUpdateTopicText={(ti, v) => onUpdateTopicText(selectedSubject.index, ti, v)}
          onUpdateTopicAnswer={(ti, v) => onUpdateTopicAnswer(selectedSubject.index, ti, v)}
          onUpdateSubjectName={(v) => onUpdateSubjectName(selectedSubject.index, v)}
          onGenerateTopicAI={(key) => onGenerateTopicAI(selectedSubject.subject.id, key)}
          onRegenerateTopicAI={(topicIndex, context, key) => onRegenerateTopicAI(selectedSubject.index, topicIndex, context, key)}
          onGenerateLessonAI={(key, context) => onGenerateLessonAI(selectedSubject.subject.id, key, context)}
          onGenerateMoreQuestions={(lessonId, context) => onGenerateMoreQuestions(selectedSubject.subject.id, lessonId, context)}
          questionGenerationBusy={generatingDiverseQuestions || generatingAI || savingDiverse}
          pendingLessonDraft={pendingLessonDraft?.subjectId === selectedSubject.subject.id ? pendingLessonDraft : null}
          onSaveLessonDraft={onSaveLessonDraft}
          onDiscardLessonDraft={onDiscardLessonDraft}
          onBulkAddTopics={(topics) => onBulkAddTopics(selectedSubject.index, topics)}
          onRateTopic={(ti, rating) => onRateTopic(selectedSubject.index, ti, rating)}
          onRateLessonTopic={(topicId, rating) => onRateLessonTopic(selectedSubject.index, topicId, rating)}
          onSessionComplete={onSessionComplete}
          onRemoveLesson={(li) => onRemoveLesson(selectedSubject.index, li)}
          onToggleLessonTopic={(topicId) => onToggleLessonTopic(selectedSubject.index, topicId)}
          onUpdateLessonTitle={(li, v) => onUpdateLessonTitle(selectedSubject.index, li, v)}
          onUpdateLessonTopicText={(topicId, v) => onUpdateLessonTopicText(selectedSubject.index, topicId, v)}
          onUpdateLessonTopicAnswer={(topicId, v) => onUpdateLessonTopicAnswer(selectedSubject.index, topicId, v)}
          generatingAI={generatingAI}
          aiAction={aiAction}
          lastAIAction={lastAIAction}
          aiError={aiError}
          onSave={onSave}
          savingDiverse={savingDiverse}
          loadingDiverse={loadingDiverse}
          diverseSaved={diverseSaved}
          diverseError={diverseError}
          pomodoroMode={pomodoroMode}
          pomodoroSeconds={pomodoroSeconds}
          pomodoroRunning={pomodoroRunning}
          todayPomodoroCount={todayPomodoroCount}
          notificationPermission={notificationPermission}
          pomodoroMessage={pomodoroMessage}
          onTogglePomodoro={onTogglePomodoro}
          onSwitchPomodoro={onSwitchPomodoro}
          onRequestNotifications={onRequestNotifications}
        />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          {/* Add subject with datalist */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <>
                <input
              aria-label="Matéria: React, Python, Francês"
                  list="catalog-subjects"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void onAddSubject();
                    }
                  }}
                  maxLength={60}
                  placeholder="Matéria: React, Python, Francês..."
                  className="min-h-12 w-full min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base text-slate-700 outline-none transition focus:border-primary"
                />
                <datalist id="catalog-subjects">
                  {catalog.map((c) => <option key={c.name} value={c.name} />)}
                </datalist>
              </>
              <button type="button" onClick={() => void onAddSubject()} disabled={!newSubjectName.trim() || savingDiverse}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 text-base font-black text-white transition hover:bg-slate-700 disabled:opacity-50">
                <Plus size={18} /> Criar
              </button>
            </div>
          </div>

          {/* Subject cards */}
          {loadingDiverse ? (
            <div className="flex items-center justify-center rounded-[1.5rem] border-2 border-slate-100 bg-white p-10">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-[1.5rem] border-2 border-slate-100 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Materia</p>
                    <h2 className="mt-1 text-xl font-black text-slate-800">Programação</h2>
                  </div>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-primary">
                    <BookOpen size={16} />
                  </span>
                </div>
                <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                  Currículo de programação com aulas, flashcards e revisão espaçada.
                </p>
                <button
                  type="button"
                  onClick={onSelectCoding}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-black text-white transition hover:bg-indigo-700"
                >
                  <Layers size={16} /> Abrir dashboard
                </button>
              </article>
              {subjectTabs.map((item) => {
                const subjectTopics = getDiverseSubjectTopics(item.subject);
                const done = subjectTopics.filter((topic) => topic.done).length;
                const total = subjectTopics.length;
                const lessonCount = getDiverseSubjectLessons(item.subject).length;
                return (
                  <article key={item.slug} className="rounded-[1.5rem] border-2 border-slate-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Materia</p>
                        <h2 className="mt-1 text-xl font-black text-slate-800">{item.subject.name}</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onRemoveSubject(item.index)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-rose-100 bg-white text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
                        title="Apagar matéria"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-2xl font-black text-slate-800">{total}</p>
                        <p className="text-xs font-bold text-slate-400">Tópicos</p>
                      </div>
                      <div className="rounded-2xl bg-indigo-50 p-3">
                        <p className="text-2xl font-black text-indigo-600">{lessonCount}</p>
                        <p className="text-xs font-bold text-indigo-500">Blocos</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 p-3">
                        <p className="text-2xl font-black text-emerald-600">{done}</p>
                        <p className="text-xs font-bold text-emerald-500">Feitos</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectSubjectTab(item.slug)}
                      className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-black text-white transition hover:bg-indigo-700"
                    >
                      <Layers size={16} /> Abrir dashboard
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {!loadingDiverse && subjects.length === 0 && (
            <div className="rounded-[1.5rem] border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
              <Layers className="mx-auto text-slate-300" size={32} />
              <p className="mt-3 text-base font-bold text-slate-400">Nenhuma matéria própria ainda.</p>
              <p className="mt-1 text-sm text-slate-400">Digite o nome acima e clique em Criar.</p>
            </div>
          )}

          {diverseError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{diverseError}</p>}
          {diverseSaved && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{diverseSaved}</p>}
          <button type="button" onClick={onSave} disabled={savingDiverse || loadingDiverse || generatingDiverseQuestions}
            className="kid-button w-full bg-primary hover:bg-primary-dark">
            {savingDiverse ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar matérias
          </button>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <PomodoroWidget
            mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
            todayCount={todayPomodoroCount}
            notificationPermission={notificationPermission} message={pomodoroMessage}
            onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro} onRequestNotifications={onRequestNotifications}
          />
          <div className="kid-surface border-slate-100 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Dica</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>Digite o nome da matéria (ex: React, Python, Francês) e clique em <strong>Criar</strong> para adicionar manualmente.</p>
              <p>Abra cada tópico para escrever a explicação/resposta. Depois clique na aba <strong>Estudar</strong> para revisar com feedback.</p>
              <p className="rounded-xl bg-violet-50 px-3 py-2 text-violet-700"><strong>IA:</strong> Configure sua chave de API em Configurações para usar a geração automática.</p>
            </div>
          </div>
        </aside>
      </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECT STUDY CARD (Diverse tab — inline study mode)
// ═══════════════════════════════════════════════════════════════════════════════
export function DiverseSubjectDashboard({
  selectedDate, subject, onBack, onRemove, onToggleTopic, onUpdateTopicText,
  onUpdateTopicAnswer, onUpdateSubjectName, onSave, savingDiverse, loadingDiverse,
  diverseSaved, diverseError, pomodoroMode, pomodoroSeconds, pomodoroRunning, todayPomodoroCount,
  notificationPermission, pomodoroMessage, onTogglePomodoro, onSwitchPomodoro,
  onRequestNotifications, onGenerateTopicAI, onGenerateLessonAI, onRemoveLesson,
  onRegenerateTopicAI,
  onGenerateMoreQuestions, questionGenerationBusy,
  onToggleLessonTopic, onUpdateLessonTitle, onUpdateLessonTopicText,
  onUpdateLessonTopicAnswer, generatingAI, aiAction, lastAIAction, aiError, onBulkAddTopics,
  pendingLessonDraft, onSaveLessonDraft, onDiscardLessonDraft,
  onRateTopic, onRateLessonTopic, onSessionComplete,
}: {
  selectedDate: string;
  subject: DiverseSubject;
  onBack: () => void;
  onRemove: () => void;
  onToggleTopic: (ti: number) => void;
  onUpdateTopicText: (ti: number, value: string) => void;
  onUpdateTopicAnswer: (ti: number, value: string) => void;
  onUpdateSubjectName: (value: string) => void;
  onGenerateTopicAI: (apiKey?: string) => void;
  onRegenerateTopicAI: (topicIndex: number, context?: string, apiKey?: string) => void | Promise<void>;
  onGenerateLessonAI: (apiKey?: string, context?: string) => void;
  onGenerateMoreQuestions: (lessonId: string, context?: string) => Promise<string>;
  questionGenerationBusy: boolean;
  pendingLessonDraft: PendingLessonDraft | null;
  onSaveLessonDraft: () => void;
  onDiscardLessonDraft: () => void;
  onRemoveLesson: (li: number) => void;
  onToggleLessonTopic: (topicId: string) => void;
  onUpdateLessonTitle: (li: number, value: string) => void;
  onUpdateLessonTopicText: (topicId: string, value: string) => void;
  onUpdateLessonTopicAnswer: (topicId: string, value: string) => void;
  generatingAI: boolean;
  aiAction: DiverseAIAction | null;
  lastAIAction: DiverseAIAction | null;
  aiError: string;
  onBulkAddTopics: (topics: CodingTopic[]) => void;
  onRateTopic: (ti: number, rating: StudyRating) => void;
  onRateLessonTopic: (topicId: string, rating: StudyRating) => void;
  onSessionComplete: () => void;
  onSave: () => void;
  savingDiverse: boolean;
  loadingDiverse: boolean;
  diverseSaved: string;
  diverseError: string;
  pomodoroMode: PomodoroMode;
  pomodoroSeconds: number;
  pomodoroRunning: boolean;
  todayPomodoroCount: number;
  notificationPermission: NotificationPermission | 'unsupported';
  pomodoroMessage: string;
  onTogglePomodoro: () => void;
  onSwitchPomodoro: (m: PomodoroMode) => void;
  onRequestNotifications: () => void;
}) {
  const lessons = getDiverseSubjectLessons(subject);
  const subjectTopics = getDiverseSubjectTopics(subject);
  const doneCount = subjectTopics.filter((topic) => topic.done).length;
  const totalTopics = subjectTopics.length;
  const pendingCount = Math.max(totalTopics - doneCount, 0);
  const completed = totalTopics > 0 && doneCount === totalTopics;
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [lessonContext, setLessonContext] = useState('');
  const [studyModalOpen, setStudyModalOpen] = useState(false);
  const needsKeyConfig = aiError.toLowerCase().includes('chave') || aiError.toLowerCase().includes('configur') || aiError.toLowerCase().includes('api');

  return (
    <div className="space-y-6">
      <section className="kid-surface border-indigo-200 p-3 md:p-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-600 transition hover:bg-slate-200"
        >
          <ArrowLeft size={16} /> Voltar para matérias
        </button>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Dashboard da matéria</p>
        <h1 className="mt-1 text-2xl font-black text-slate-800 md:mt-2 md:text-4xl">{subject.name}</h1>
        <p className="mt-1 text-sm text-slate-500 md:text-base">{formatDateLabel(selectedDate)}</p>
        <button
          type="button"
          onClick={() => setStudyModalOpen(true)}
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-white shadow-[0_12px_24px_rgba(14,165,233,0.28)] transition hover:bg-primary-dark"
        >
          <BookOpen size={16} /> Iniciar estudo
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 sm:grid-cols-4">
          <MetricCard compact icon={<Layers size={18} />} label="Tópicos" value={`${totalTopics}`} helper="Nesta matéria" tone="sky" />
          <MetricCard compact icon={<BookOpen size={18} />} label="Blocos" value={`${lessons.length}`} helper="Licoes criadas" tone="orange" />
          <MetricCard compact icon={<CheckCircle2 size={18} />} label="Concluidos" value={`${doneCount}`} helper={`${pendingCount} restantes`} tone="green" />
          <MetricCard compact icon={<Flame size={18} />} label="Meta" value={completed ? 'Completa!' : 'Em progresso'} helper="Revise ate zerar" tone={completed ? 'green' : 'orange'} />
        </div>
      </section>

      <section className="kid-surface border-violet-100 p-4 md:p-5">
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Contexto para IA
          </label>
          <textarea
            value={lessonContext}
            onChange={(e) => setLessonContext(e.target.value)}
            rows={3}
            maxLength={700}
            placeholder="Ex.: criar uma lição sobre hooks, props e erros comuns para dev junior."
            className="w-full resize-none rounded-2xl border-2 border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-400"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onGenerateTopicAI(aiKeyDraft.trim() || undefined)}
            disabled={generatingAI || questionGenerationBusy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-4 text-sm font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiAction === 'topic' ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {aiAction === 'topic' ? 'Escolhendo topico...' : 'Sugerir topico com IA'}
          </button>
          <button
            type="button"
            onClick={() => onGenerateLessonAI(aiKeyDraft.trim() || undefined, lessonContext.trim() || undefined)}
            disabled={generatingAI || questionGenerationBusy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiAction === 'lesson' ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {aiAction === 'lesson' ? 'Criando preview...' : 'Criar preview da lição'}
          </button>
        </div>
        {aiError && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-rose-50 px-4 py-3">
            <p className="text-sm font-bold text-rose-700">{aiError}</p>
            {needsKeyConfig && (lastAIAction === 'topic' || lastAIAction === 'lesson') && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-rose-600">Informe sua chave Gemini para continuar:</p>
                <div className="flex gap-2">
                  <input
              aria-label="AIza"
                    type="password"
                    value={aiKeyDraft}
                    onChange={(e) => setAiKeyDraft(e.target.value)}
                    placeholder="AIza..."
                    className="min-h-10 min-w-0 flex-1 rounded-xl border-2 border-rose-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!aiKeyDraft.trim()) return;
                      if (lastAIAction === 'topic') onGenerateTopicAI(aiKeyDraft.trim());
                      else if (lastAIAction === 'lesson') onGenerateLessonAI(aiKeyDraft.trim(), lessonContext.trim() || undefined);
                    }}
                    disabled={!aiKeyDraft.trim() || generatingAI || questionGenerationBusy}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Sparkles size={14} /> Tentar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {pendingLessonDraft && (
          <div className="mt-4 rounded-[1.25rem] border-2 border-violet-200 bg-violet-50/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-500">Preview da lição</p>
                <h2 className="mt-1 text-lg font-black text-slate-800">{pendingLessonDraft.lesson.title}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{pendingLessonDraft.topics.length} tópicos gerados</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:min-w-56">
                <button
                  type="button"
                  onClick={onSaveLessonDraft}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700"
                >
                  <Save size={14} /> Salvar lição
                </button>
                <button
                  type="button"
                  onClick={onDiscardLessonDraft}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-2 border-violet-200 bg-white px-3 text-xs font-black text-violet-700 transition hover:border-violet-300"
                >
                  <X size={14} /> Descartar
                </button>
              </div>
            </div>
            <ol className="mt-4 space-y-2">
              {pendingLessonDraft.topics.map((topic, index) => (
                <li key={topic.id} className="rounded-2xl border-2 border-white bg-white/90 p-3">
                  <p className="text-sm font-black text-slate-800">{index + 1}. {topic.topic}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{topic.answer || 'Sem resposta gerada.'}</p>
                  {topic.code_example && (
                    <SyntaxCodeBlock code={topic.code_example} language={subject.name} className="mt-3 p-3" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <SubjectStudyCard
            subject={subject}
            onRemove={onRemove}
            onToggleTopic={onToggleTopic}
            onUpdateTopicText={onUpdateTopicText}
            onUpdateTopicAnswer={onUpdateTopicAnswer}
            onUpdateSubjectName={onUpdateSubjectName}
            onRegenerateTopicAI={onRegenerateTopicAI}
            aiBusy={generatingAI || questionGenerationBusy}
            onBulkAddTopics={onBulkAddTopics}
            onRateTopic={onRateTopic}
            onSessionComplete={onSessionComplete}
            questionGenerationLessons={lessons}
            questionGenerationButtonLabel="Criar mais questões"
            onGenerateMoreQuestions={onGenerateMoreQuestions}
            questionGenerationBusy={questionGenerationBusy}
          />

          {lessons.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Licoes em blocos</p>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                  {lessons.length}
                </span>
              </div>
              {lessons.map((lesson, lessonIndex) => {
                const resolvedTopics = resolveDiverseLessonTopics(subject, lesson);
                return (
                  <SubjectStudyCard
                    key={lesson.id}
                    defaultCollapsed={true}
                    subject={{ id: subject.id, name: lesson.title, topics: resolvedTopics, lessons: [] }}
                    syntaxLanguage={subject.name}
                    onRemove={() => onRemoveLesson(lessonIndex)}
                    onToggleTopic={(ti) => {
                      const topicId = resolvedTopics[ti]?.id;
                      if (topicId) onToggleLessonTopic(topicId);
                    }}
                    onUpdateTopicText={(ti, value) => {
                      const topicId = resolvedTopics[ti]?.id;
                      if (topicId) onUpdateLessonTopicText(topicId, value);
                    }}
                    onUpdateTopicAnswer={(ti, value) => {
                      const topicId = resolvedTopics[ti]?.id;
                      if (topicId) onUpdateLessonTopicAnswer(topicId, value);
                    }}
                    onUpdateSubjectName={(value) => onUpdateLessonTitle(lessonIndex, value)}
                    onRateTopic={(ti, rating) => {
                      const topicId = resolvedTopics[ti]?.id;
                      if (topicId) onRateLessonTopic(topicId, rating);
                    }}
                    onSessionComplete={onSessionComplete}
                    fixedQuestionGenerationLesson={lesson}
                    questionGenerationButtonLabel="Criar mais questões"
                    onGenerateMoreQuestions={onGenerateMoreQuestions}
                    questionGenerationBusy={questionGenerationBusy}
                  />
                );
              })}
            </div>
          )}

          {diverseError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{diverseError}</p>}
          {diverseSaved && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{diverseSaved}</p>}
          <button type="button" onClick={onSave} disabled={savingDiverse || loadingDiverse || questionGenerationBusy}
            className="kid-button w-full bg-primary hover:bg-primary-dark">
            {savingDiverse ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar matéria
          </button>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <PomodoroWidget
            mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
            todayCount={todayPomodoroCount}
            notificationPermission={notificationPermission} message={pomodoroMessage}
            onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro} onRequestNotifications={onRequestNotifications}
          />
          <div className="kid-surface border-slate-100 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Foco da matéria</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>Use Lista para ajustar os tópicos e respostas.</p>
              <p>Use Estudar para revisar a matéria como flashcards.</p>
              <p>Use a IA para sugerir um tópico rápido ou criar uma lição separada em bloco.</p>
              <p>A URL desta aba segue o formato <strong>tab=nomedamateria</strong>.</p>
            </div>
          </div>
        </aside>
      </div>

      {studyModalOpen && (
        <SubjectTopicsStudyModal
          subjectName={subject.name}
          topics={subjectTopics}
          onClose={() => setStudyModalOpen(false)}
        />
      )}
    </div>
  );
}

export function SubjectTopicsStudyModal({
  subjectName,
  topics,
  onClose,
}: {
  subjectName: string;
  topics: CodingTopic[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subject-study-modal-title"
      className="fixed inset-0 z-[120] flex min-h-[100dvh] items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-6 dark:bg-black/80"
    >
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.6rem] bg-white shadow-2xl dark:bg-slate-950 sm:rounded-3xl">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Estudo guiado</p>
              <h2 id="subject-study-modal-title" className="mt-1 text-xl font-black text-slate-900 sm:text-2xl dark:text-white">{subjectName}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-200">{topics.length} tópicos para revisar</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar estudo da matéria"
              className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 sm:px-6">
          {topics.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm font-black text-slate-500 dark:text-slate-300">Nenhum tópico disponível para estudar ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topics.map((topic, index) => (
                <article key={topic.id} className="rounded-2xl border-2 border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-400">Tópico {index + 1}</p>
                      <h3 className="mt-1 text-base font-black text-slate-800 dark:text-slate-100">{topic.topic}</h3>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${topic.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {topic.done ? 'Concluído' : 'Pendente'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenTopicId((current) => (current === topic.id ? null : topic.id))}
                    className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-3 text-xs font-black text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-500/50 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
                  >
                    <ChevronRight size={14} className={`transition ${openTopicId === topic.id ? 'rotate-90' : ''}`} />
                    {openTopicId === topic.id ? 'Ocultar resposta' : 'Mostrar resposta'}
                  </button>
                  {openTopicId === topic.id && (
                    <>
                      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-200">{topic.answer?.trim() || 'Sem explicação disponível ainda.'}</p>
                      {topic.code_example && (
                        <SyntaxCodeBlock code={topic.code_example} language={subjectName} className="mt-3 p-3" />
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-white transition hover:bg-primary-dark"
          >
            Fechar estudo
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DiverseQuestionGenerationForm({
  lessons,
  fixedLesson,
  buttonLabel,
  busy,
  onGenerate,
}: {
  lessons: DiverseLessonBlock[];
  fixedLesson?: DiverseLessonBlock;
  buttonLabel: string;
  busy: boolean;
  onGenerate: (lessonId: string, context?: string) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState(fixedLesson?.id ?? '');
  const [diverseQuestionContext, setDiverseQuestionContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submitLockRef = useRef(false);
  const lessonId = fixedLesson?.id ?? selectedLessonId;

  useEffect(() => {
    if (fixedLesson) {
      setSelectedLessonId(fixedLesson.id);
      return;
    }
    if (selectedLessonId && lessons.some((lesson) => lesson.id === selectedLessonId)) return;
    setSelectedLessonId('');
  }, [fixedLesson, lessons, selectedLessonId]);

  async function handleGenerate() {
    if (!lessonId || busy || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      const successMessage = await onGenerate(lessonId, diverseQuestionContext.trim() || undefined);
      setMessage(successMessage);
      setDiverseQuestionContext('');
    } catch (err) {
      setError(isUncertainDiverseGenerationError(err)
        ? 'A criação pode ter sido concluída. Recarregue a página antes de tentar novamente.'
        : err instanceof Error ? err.message : 'Não foi possível criar as questões. Tente novamente.');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy || lessons.length === 0}
        className="mx-5 mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 text-sm font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles size={16} /> {buttonLabel}
      </button>
    );
  }

  return (
    <div className="mx-5 mt-4 space-y-3 rounded-2xl border-2 border-violet-200 bg-violet-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-violet-800">{buttonLabel}</p>
          <p className="mt-0.5 text-xs font-bold text-violet-600">Serão criadas 5 questões relacionadas a esta lição.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          aria-label="Fechar criação de questões"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-violet-500 transition hover:bg-violet-100 disabled:opacity-50"
        >
          <X size={15} />
        </button>
      </div>

      {!fixedLesson && (
        <label className="block text-xs font-black text-slate-600">
          Lição
          <select
            value={selectedLessonId}
            onChange={(event) => { setSelectedLessonId(event.target.value); setError(''); setMessage(''); }}
            disabled={submitting || busy}
            className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-violet-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400 disabled:opacity-60"
          >
            <option value="">Selecione uma lição</option>
            {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
          </select>
        </label>
      )}

      <label className="block text-xs font-black text-slate-600">
        Contexto opcional
        <textarea
          value={diverseQuestionContext}
          onChange={(event) => { setDiverseQuestionContext(event.target.value); setError(''); setMessage(''); }}
          maxLength={1000}
          rows={3}
          disabled={submitting || busy}
          placeholder="Ex.: foque nos conceitos que costumam cair na prova."
          className="mt-1.5 w-full resize-none rounded-xl border-2 border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400 disabled:opacity-60"
        />
      </label>

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={!lessonId || submitting || busy}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        {submitting ? 'Criando 5 questões...' : 'Adicionar 5 questões'}
      </button>
      {error && <p role="alert" className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700">{message}</p>}
    </div>
  );
}

export function SubjectStudyCard({
  subject, onRemove, onToggleTopic, onUpdateTopicText, onUpdateTopicAnswer, onUpdateSubjectName,
  onRegenerateTopicAI, aiBusy = false,
  defaultCollapsed, syntaxLanguage, onBulkAddTopics, onRateTopic, onSessionComplete,
  questionGenerationLessons, fixedQuestionGenerationLesson, questionGenerationButtonLabel,
  onGenerateMoreQuestions, questionGenerationBusy = false,
}: {
  subject: DiverseSubject;
  onRemove: () => void;
  onToggleTopic: (ti: number) => void;
  onUpdateTopicText: (ti: number, value: string) => void;
  onUpdateTopicAnswer: (ti: number, value: string) => void;
  onUpdateSubjectName: (value: string) => void;
  onRegenerateTopicAI?: (ti: number, context?: string, apiKey?: string) => void | Promise<void>;
  aiBusy?: boolean;
  defaultCollapsed?: boolean;
  syntaxLanguage?: string;
  onBulkAddTopics?: (topics: CodingTopic[]) => void;
  onRateTopic?: (ti: number, rating: StudyRating) => void;
  onSessionComplete?: () => void;
  questionGenerationLessons?: DiverseLessonBlock[];
  fixedQuestionGenerationLesson?: DiverseLessonBlock;
  questionGenerationButtonLabel?: string;
  onGenerateMoreQuestions?: (lessonId: string, context?: string) => Promise<string>;
  questionGenerationBusy?: boolean;
}) {
  const codeLanguage = syntaxLanguage ?? subject.name;
  const studyCardRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const [activeTab, setActiveTab] = useState<'topics' | 'study' | 'view'>('topics');
  const [expandedAnswer, setExpandedAnswer] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<CodingTopic[] | null>(null);
  const [importError, setImportError] = useState('');
  const [topicRegenerateContext, setTopicRegenerateContext] = useState<Record<number, string>>({});
  const [topicAiKeyDraft, setTopicAiKeyDraft] = useState<Record<number, string>>({});
  const [regeneratingTopicIndex, setRegeneratingTopicIndex] = useState<number | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [studyState, setStudyState] = useState<InlineStudyState>(() => ({
    order: subject.topics.map((_, i) => i), position: 0, userAnswer: '', revealed: false, results: [], done: false,
  }));
  const topicIdSignature = JSON.stringify(subject.topics.map((topic) => topic.id));
  const previousStudyTopicIdsRef = useRef<string[]>(JSON.parse(topicIdSignature));

  function handleParseImport() {
    setImportError('');
    setImportPreview(null);
    try {
      const topics = parseJsonTopics(importText.trim());
      if (topics.length === 0) { setImportError('Nenhum tópico válido encontrado no JSON.'); return; }
      setImportPreview(topics);
    } catch {
      setImportError('JSON inválido. Verifique o formato e tente novamente.');
    }
  }

  function handleConfirmImport() {
    if (!importPreview || !onBulkAddTopics) return;
    const remaining = Math.max(0, 50 - subject.topics.length);
    if (remaining === 0) {
      setImportError('Esta matéria já tem 50 tópicos (limite). Crie uma nova lição em bloco.');
      return;
    }
    onBulkAddTopics(importPreview.slice(0, remaining));
    setImportText('');
    setImportPreview(null);
    setShowImport(false);
    setImportError('');
  }

  function handleCopyJson() {
    const json = JSON.stringify(subject.topics.map((t) => ({ topic: t.topic, answer: t.answer ?? '' })), null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    });
  }

  // Reconcile the mounted review queue by canonical IDs.
  useEffect(() => {
    const previousTopicIds = previousStudyTopicIdsRef.current;
    const nextTopicIds = JSON.parse(topicIdSignature) as string[];
    setStudyState((current) => reconcileStudyQueueByTopicIds(current, previousTopicIds, nextTopicIds));
    previousStudyTopicIdsRef.current = nextTopicIds;
  }, [topicIdSignature]);

  const doneCount = subject.topics.filter((t) => t.done).length;
  const totalTopics = subject.topics.length;
  const allDone = totalTopics > 0 && doneCount === totalTopics;
  const currentTopicIndex = studyState.order[studyState.position];
  const currentTopic = subject.topics[currentTopicIndex];

  function resetStudy() {
    setStudyState({
      order: buildStudyOrder(subject.topics),
      position: 0, userAnswer: '', revealed: false, results: [], done: false,
    });
  }

  function revealCurrentTopic() {
    setStudyState((prev) => ({ ...prev, revealed: true }));
    window.setTimeout(() => studyCardRef.current?.focus(), 0);
  }

  function rateAndAdvance(rating: StudyRating) {
    const { order, position, results } = studyState;
    const topicIndex = order[position];
    const newResults = [...results, rating];
    const topic = subject.topics[topicIndex];
    if ((rating === 'knew' || rating === 'partial') && !topic.done) {
      onToggleTopic(topicIndex);
    }
    onRateTopic?.(topicIndex, rating);
    const nextPosition = position + 1;
    if (nextPosition >= order.length) {
      setStudyState((prev) => ({ ...prev, results: newResults, done: true, revealed: false }));
      onSessionComplete?.();
    } else {
      setStudyState((prev) => ({ ...prev, position: nextPosition, userAnswer: '', revealed: false, results: newResults }));
    }
  }

  function handleStudyKeyDown(event: KeyboardEvent) {
    if (activeTab !== 'study' || !studyState.revealed || studyState.done) return;
    if (!studyCardRef.current?.contains(document.activeElement)) return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName;
    if (target?.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;

    if (event.key === '1') {
      event.preventDefault();
      rateAndAdvance('partial');
    } else if (event.key === '2') {
      event.preventDefault();
      rateAndAdvance('knew');
    } else if (event.key === '3') {
      event.preventDefault();
      rateAndAdvance('unknown');
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleStudyKeyDown);
    return () => window.removeEventListener('keydown', handleStudyKeyDown);
  });

  const knewCount = studyState.results.filter((r) => r === 'knew').length;
  const partialCount = studyState.results.filter((r) => r === 'partial').length;
  const unknownCount = studyState.results.filter((r) => r === 'unknown').length;

  return (
    <div ref={studyCardRef} tabIndex={-1} className={`rounded-[1.5rem] border-2 bg-white transition focus:outline-none ${allDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          title={collapsed ? 'Expandir' : 'Minimizar'}
        >
          <ChevronRight size={15} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        </button>
        <input
          aria-label="Nome da matéria"
          value={subject.name}
          onChange={(e) => onUpdateSubjectName(e.target.value)}
          maxLength={60}
          className="min-w-0 flex-1 rounded-xl border-2 border-transparent bg-transparent px-2 py-1 text-lg font-black text-slate-800 outline-none transition focus:border-primary focus:bg-white"
        />
        <div className="flex shrink-0 items-center gap-2">
          {allDone && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">Completo</span>}
          <span className="text-sm font-black text-slate-400">{doneCount}/{totalTopics}</span>
          <button type="button" onClick={onRemove}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border-2 border-rose-100 bg-white text-rose-400 transition hover:border-rose-300 hover:bg-rose-50">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {collapsed && <div className="pb-4" />}

      {/* Tab switcher */}
      {!collapsed && <div className="mt-3 flex gap-1.5 px-5">
        <button type="button" onClick={() => setActiveTab('topics')}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition ${activeTab === 'topics' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Lista
        </button>
        <button type="button" onClick={() => { resetStudy(); setActiveTab('study'); }} disabled={totalTopics === 0}
          title="Revisão espaçada: prioriza o que você errou ou não sabia"
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition ${activeTab === 'study' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} disabled:opacity-40 disabled:cursor-not-allowed`}>
          <Zap size={12} className="inline mr-1" />Revisar
        </button>
        <button type="button" onClick={() => setActiveTab('view')} disabled={totalTopics === 0}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition ${activeTab === 'view' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} disabled:opacity-40 disabled:cursor-not-allowed`}>
          <BookOpen size={12} className="inline mr-1" />Visualizar
        </button>
      </div>}

      {!collapsed && activeTab !== 'view' && onGenerateMoreQuestions && questionGenerationButtonLabel && questionGenerationLessons && questionGenerationLessons.length > 0 && (
        <DiverseQuestionGenerationForm
          lessons={questionGenerationLessons}
          buttonLabel={questionGenerationButtonLabel}
          busy={questionGenerationBusy}
          onGenerate={onGenerateMoreQuestions}
        />
      )}

      {!collapsed && activeTab === 'view' && onGenerateMoreQuestions && questionGenerationButtonLabel && fixedQuestionGenerationLesson && (
        <DiverseQuestionGenerationForm
          lessons={[fixedQuestionGenerationLesson]}
          fixedLesson={fixedQuestionGenerationLesson}
          buttonLabel={questionGenerationButtonLabel}
          busy={questionGenerationBusy}
          onGenerate={onGenerateMoreQuestions}
        />
      )}

      {!collapsed && (activeTab === 'topics' ? (
        <div className="p-5">
          {/* Progress bar */}
          {totalTopics > 0 && (
            <div className="flex gap-1">
              {subject.topics.map((t, ti) => (
                <div key={ti} className={`h-1.5 flex-1 rounded-full transition-all ${t.done ? 'bg-emerald-400' : 'bg-slate-100'}`} />
              ))}
            </div>
          )}
          {/* Topics list */}
          <ul className="mt-4 space-y-3">
            {subject.topics.map((t, ti) => {
              const topicOpen = expandedAnswer === ti;
              return (
                <li key={ti} className={`rounded-2xl border-2 transition ${topicOpen ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center gap-3 p-3">
                    <button type="button" onClick={() => onToggleTopic(ti)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${t.done ? 'border-emerald-400 bg-emerald-400 text-white' : 'border-slate-300 bg-white hover:border-emerald-400'}`}>
                      {t.done && <CheckCircle2 size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedAnswer(topicOpen ? null : ti)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className={`flex items-center gap-1.5 break-words text-sm font-black ${t.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {t.last_rating && (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${RATING_META[t.last_rating].dot}`} title={`Última revisão: ${RATING_META[t.last_rating].label}`} />
                        )}
                        <span className="min-w-0 break-words">{t.topic || `Tópico ${ti + 1}`}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
                        {t.answer && !topicOpen && <span className="truncate">Resposta salva</span>}
                        {(t.review_count ?? 0) > 0 && <span>· {t.review_count}× revisado</span>}
                      </span>
                    </button>
                    <button type="button" onClick={() => setExpandedAnswer(topicOpen ? null : ti)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 transition ${topicOpen ? 'border-indigo-300 bg-white text-indigo-700' : 'border-slate-200 bg-white text-slate-400 hover:border-indigo-300 hover:text-indigo-600'}`}
                      title="Resposta / explicação">
                      <ChevronRight size={16} className={`transition ${topicOpen ? 'rotate-90' : ''}`} />
                    </button>
                  </div>
                  {topicOpen && (
                    <div className="space-y-2 px-3 pb-3">
                      <input
              aria-label="Pergunta / topico"
                        value={t.topic}
                        onChange={(e) => onUpdateTopicText(ti, e.target.value)}
                        maxLength={120}
                        placeholder="Pergunta / topico"
                        className={`w-full rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-primary ${t.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                      />
                      <textarea
                        value={t.answer ?? ''}
                        onChange={(e) => onUpdateTopicAnswer(ti, e.target.value)}
                        rows={2}
                        maxLength={300}
                        placeholder="Explicacao / resposta (usada no modo Estudar)"
                        className="w-full resize-none rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 outline-none transition focus:border-indigo-400"
                      />
                      {onRegenerateTopicAI && (
                        <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-3">
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-violet-700">Regenerar tópico com IA</p>
                          <textarea
                            value={topicRegenerateContext[ti] ?? ''}
                            onChange={(event) => setTopicRegenerateContext((current) => ({ ...current, [ti]: event.target.value }))}
                            rows={2}
                            maxLength={1000}
                            placeholder="Contexto opcional (ex.: focar em exemplos práticos e prova da OAB)."
                            className="mt-2 w-full resize-none rounded-xl border-2 border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-violet-400"
                          />
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <input
              aria-label="Chave IA opcional"
                              type="password"
                              value={topicAiKeyDraft[ti] ?? ''}
                              onChange={(event) => setTopicAiKeyDraft((current) => ({ ...current, [ti]: event.target.value }))}
                              placeholder="Chave IA opcional"
                              className="min-h-9 min-w-0 flex-1 rounded-xl border-2 border-violet-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-violet-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const context = topicRegenerateContext[ti]?.trim() || undefined;
                                const apiKey = topicAiKeyDraft[ti]?.trim() || undefined;
                                setRegeneratingTopicIndex(ti);
                                Promise.resolve(onRegenerateTopicAI(ti, context, apiKey)).finally(() => {
                                  setRegeneratingTopicIndex((current) => (current === ti ? null : current));
                                });
                              }}
                              disabled={aiBusy || regeneratingTopicIndex === ti}
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {regeneratingTopicIndex === ti ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                              {regeneratingTopicIndex === ti ? 'Regenerando...' : 'Regenerar tópico'}
                            </button>
                          </div>
                        </div>
                      )}
                      {t.code_example && (
                        <SyntaxCodeBlock code={t.code_example} language={codeLanguage} className="mt-3 p-3" />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* JSON export / import */}
          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleCopyJson}
              disabled={totalTopics === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              <Copy size={13} /> {copiedJson ? 'Copiado!' : 'Copiar JSON'}
            </button>
            {onBulkAddTopics && (
              <button
                type="button"
                onClick={() => { setShowImport((v) => !v); setImportPreview(null); setImportError(''); }}
                className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-black transition ${showImport ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <Plus size={13} /> Importar JSON
              </button>
            )}
          </div>

          {onBulkAddTopics && showImport && (
            <div className="mt-3 space-y-2 rounded-2xl border-2 border-indigo-100 bg-indigo-50/60 p-3">
              <p className="text-xs font-bold text-indigo-700">
                Cole um array JSON: <code className="rounded bg-white px-1 py-0.5 text-indigo-600">[{`{"topic":"...","answer":"..."}`}]</code>
              </p>
              <p className="text-xs text-indigo-600">Também aceita: <code className="rounded bg-white px-1 py-0.5">question/answer</code>, <code className="rounded bg-white px-1 py-0.5">front/back</code>, ou objeto com chave <code className="rounded bg-white px-1 py-0.5">flashcards</code>.</p>
              <textarea
                value={importText}
                onChange={(e) => { setImportText(e.target.value); setImportPreview(null); setImportError(''); }}
                rows={4}
                placeholder={'[\n  {"topic": "O que é React?", "answer": "Biblioteca JS para UIs"}\n]'}
                className="w-full resize-none rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-indigo-400"
              />
              {importError && <p className="text-xs font-bold text-rose-600">{importError}</p>}
              {importPreview && (
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">{importPreview.length} tópico(s) encontrado(s):</p>
                  <ul className="mt-1 space-y-1">
                    {importPreview.slice(0, 5).map((tp, i) => (
                      <li key={i} className="truncate text-xs text-slate-700"><span className="font-bold">{i + 1}.</span> {tp.topic}</li>
                    ))}
                    {importPreview.length > 5 && <li className="text-xs text-slate-400">...e mais {importPreview.length - 5}</li>}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleParseImport}
                  disabled={!importText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  Verificar
                </button>
                {importPreview && importPreview.length > 0 && (
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
                  >
                    <Plus size={13} /> Adicionar {importPreview.length} tópico(s)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'study' ? (
        /* Study tab */
        <div className="p-5">
          {totalTopics === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-slate-400">Nenhum tópico cadastrado.</p>
              <button type="button" onClick={() => setActiveTab('topics')}
                className="mt-2 text-sm font-black text-primary hover:underline">
                Ir para Lista
              </button>
            </div>
          ) : studyState.done ? (
            /* Summary */
            <div className="flex flex-col items-center gap-4 py-3 text-center">
              <span className="text-4xl">{knewCount >= totalTopics * 0.7 ? '🎉' : knewCount >= totalTopics * 0.4 ? '💪' : '📚'}</span>
              <p className="text-lg font-black text-slate-800">Sessão completa!</p>
              <div className="grid w-full grid-cols-3 gap-2">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-2xl font-black text-emerald-600">{knewCount}</p>
                  <p className="mt-0.5 text-xs font-bold text-emerald-500">Sabia</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-2xl font-black text-amber-600">{partialCount}</p>
                  <p className="mt-0.5 text-xs font-bold text-amber-500">Parcial</p>
                </div>
                <div className="rounded-xl bg-rose-50 p-3">
                  <p className="text-2xl font-black text-rose-600">{unknownCount}</p>
                  <p className="mt-0.5 text-xs font-bold text-rose-500">Não sabia</p>
                </div>
              </div>
              <button type="button" onClick={resetStudy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-sm font-black text-white transition hover:bg-slate-700">
                <RotateCcw size={14} /> Revisar de novo
              </button>
            </div>
          ) : currentTopic ? (
            /* Active question */
            <div className="space-y-4">
              {/* Progress bar (follows the spaced-repetition order) */}
              <div className="flex gap-1">
                {studyState.order.map((_, pos) => (
                  <div key={pos} className={`h-1.5 flex-1 rounded-full transition-all ${
                    pos < studyState.results.length
                      ? studyState.results[pos] === 'knew' ? 'bg-emerald-400' : studyState.results[pos] === 'partial' ? 'bg-amber-400' : 'bg-rose-400'
                      : pos === studyState.position ? 'bg-indigo-400' : 'bg-slate-100'
                  }`} />
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-400">
                <span>{studyState.position + 1} / {totalTopics}</span>
                {currentTopic.last_rating && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${RATING_META[currentTopic.last_rating].chip}`}>
                    visto: {RATING_META[currentTopic.last_rating].label}
                  </span>
                )}
              </div>

              {/* Question */}
              <div className="rounded-2xl bg-indigo-50 px-4 py-5">
                <p className="text-center text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">Pergunta</p>
                <p className="text-center text-base font-black leading-snug text-slate-800">{currentTopic.topic}</p>
              </div>

              {!studyState.revealed ? (
                <>
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-slate-500">Sua resposta (opcional)</p>
                    <textarea
                      value={studyState.userAnswer}
                      onChange={(e) => setStudyState((prev) => ({ ...prev, userAnswer: e.target.value }))}
                      rows={3}
                      maxLength={300}
                      placeholder="Escreva o que você sabe sobre este tema..."
                      className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400"
                    />
                  </div>
                  <button type="button" onClick={revealCurrentTopic}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white transition hover:bg-indigo-700">
                    <ChevronRight size={16} /> Revelar explicação
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  {/* Explanation */}
                  <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">Explicação</p>
                    <p className="text-sm font-semibold leading-relaxed text-slate-700">
                      {currentTopic.answer?.trim() || <span className="italic text-slate-400">Sem explicação cadastrada. Adicione uma na aba Lista.</span>}
                    </p>
                    {currentTopic.code_example && (
                      <SyntaxCodeBlock code={currentTopic.code_example} language={codeLanguage} className="mt-3 p-3" />
                    )}
                    {studyState.userAnswer.trim() && (
                      <div className="mt-3 border-t border-emerald-200 pt-3">
                        <p className="text-xs font-bold text-slate-400 mb-1">Sua resposta</p>
                        <p className="text-sm text-slate-600 italic">{studyState.userAnswer}</p>
                      </div>
                    )}
                  </div>
                  {/* Rating */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => rateAndAdvance('knew')} aria-keyshortcuts="2"
                      className="order-2 sm:order-2 flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-500 px-4 py-4 text-white shadow-sm transition hover:bg-emerald-400 active:scale-[.98]">
                      <span className="text-lg font-black">✓</span>
                      <span className="text-xs font-black">Sabia</span>
                    </button>
                    <button type="button" onClick={() => rateAndAdvance('partial')} aria-keyshortcuts="1"
                      className="order-1 sm:order-1 flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-amber-500 px-4 py-4 text-white transition hover:bg-amber-400 active:scale-[.98]">
                      <span className="text-lg font-black">~</span>
                      <span className="text-xs font-black">Parcial</span>
                    </button>
                    <button type="button" onClick={() => rateAndAdvance('unknown')} aria-keyshortcuts="3"
                      className="order-3 sm:order-3 flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-rose-500 px-4 py-4 text-white transition hover:bg-rose-400 active:scale-[.98]">
                      <span className="text-lg font-black">✗</span>
                      <span className="text-xs font-black">Não sabia</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="p-5">
          {totalTopics === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-slate-400">Nenhum topico cadastrado.</p>
              <button type="button" onClick={() => setActiveTab('topics')}
                className="mt-2 text-sm font-black text-primary hover:underline">
                Ir para Lista
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Modo de visualizacao</p>
                <h3 className="mt-1 text-xl font-black text-slate-800">{subject.name}</h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-700">{totalTopics} tópicos</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{doneCount} concluidos</span>
                </div>
              </div>
              <ol className="space-y-3">
                {subject.topics.map((topic, index) => (
                  <li key={`${topic.topic}-${index}`} className="rounded-2xl border-2 border-slate-100 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${topic.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-base font-black text-slate-800">{topic.topic || `Tópico ${index + 1}`}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-600">
                          {topic.answer?.trim() || 'Sem explicacao cadastrada.'}
                        </p>
                        {topic.code_example && (
                          <SyntaxCodeBlock code={topic.code_example} language={codeLanguage} className="mt-3 p-3" />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
