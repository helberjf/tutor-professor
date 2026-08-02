'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, BarChart2, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Copy,
  Flame, Layers, Loader2, Pause, Pencil, Play, Plus, RotateCcw, Save, Sparkles, Timer, Trash2, X, Zap,
} from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { CodingCurriculum } from '@/components/coding/CodingCurriculum';
import { SyntaxCodeBlock } from '@/components/coding/SyntaxCodeBlock';
import { DashboardOverview } from '@/components/dashboard-overview';
import { StudyStatisticsPanel } from '@/components/study-statistics-panel';
import { ApiError, api, type CatalogSubject, type CodingDay, type CodingTopic, type DiverseDay, type DiverseLessonBlock, type DiverseSubject, type StudyDashboard, type StudyDay } from '@/lib/api';
import { appendTopicToSubjectById, clearDraftForRemovedSubject, findItemIndexById, generateAndSynchronizeDiverseQuestions, isUncertainDiverseGenerationError, reconcileStudyQueueByTopicIds, resolveDiverseGenerationTarget, resolveItemsByIds, updateItemById, updateSubjectById } from '@/lib/diverse-question-state';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  createInitialPomodoroState,
  formatTimer,
  getTodaysPomodoroCount,
  parseStoredPomodoroState,
  pausePomodoro,
  POMODORO_STORAGE_KEY,
  resetPomodoro,
  resolvePomodoroState,
  startPomodoro,
  type PomodoroMode,
} from '@/lib/pomodoro';

import {
  AI_FLASHCARD_COUNT,
  RATING_META,
  RATING_WEIGHT,
  SUBJECT_META,
  SUBJECT_ORDER,
  buildEmptyDay,
  buildLessonTitle,
  buildStudyOrder,
  createLocalLessonId,
  createLocalQuestionId,
  createLocalSubjectId,
  filterFreshDiverseTopics,
  formatDateBadge,
  formatDateLabel,
  getDiverseAvoidTopics,
  getDiverseSubjectLessons,
  getDiverseSubjectSlug,
  getDiverseSubjectTopics,
  getLocalDateValue,
  getPomodoroCompletionMessage,
  getTopicReviewPriority,
  normalizeDiverseTopicText,
  resolveDiverseLessonTopics,
  slugifySubjectName,
  updateDiverseQuestionById,
} from './_lib/study-helpers';
import { CodingTab } from './_components/CodingTab';
import { DiverseTab, OtherSubjectsPicker } from './_components/DiverseTab';
import { EnglishTab } from './_components/EnglishTab';
import { DashboardTab, MetricCard, PomodoroWidget, TabButton } from './_components/shared';
import type {
  CodingMode,
  DiverseAIAction,
  InlineStudyState,
  PendingLessonDraft,
  StudyRating,
  StudyTab,
} from './_lib/study-helpers';

export default function StudyPage() {
  const authState = useRequireAuth();

  const [activeTab, setActiveTab] = useState<StudyTab>('english');
  const [codingMode, setCodingMode] = useState<CodingMode>('reading');
  const [selectedDate, setSelectedDate] = useState(getLocalDateValue);
  const selectedDateRef = useRef(selectedDate);

  // ── English tab state ───────────────────────────────────────────────────────
  const [dashboard, setDashboard] = useState<StudyDashboard | null>(null);
  const [planText, setPlanText] = useState('');
  const [studiedText, setStudiedText] = useState('');
  const [distractions, setDistractions] = useState<string[]>([]);
  const [newDistraction, setNewDistraction] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  // A failed load leaves the fields empty, which is indistinguishable from "nothing
  // written yet" — saving on top of that would wipe the stored day. Block it.
  const [dayLoadFailed, setDayLoadFailed] = useState(false);
  const [dayReloadNonce, setDayReloadNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [savedMessage, setSavedMessage] = useState('');

  // ── Diverse tab state ───────────────────────────────────────────────────────
  const [diverseDay, setDiverseDay] = useState<DiverseDay | null>(null);
  const diverseDayRef = useRef<DiverseDay | null>(null);
  const [loadingDiverse, setLoadingDiverse] = useState(false);
  const [savingDiverse, setSavingDiverse] = useState(false);
  const [diverseSaved, setDiverseSaved] = useState('');
  const [diverseError, setDiverseError] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [catalog, setCatalog] = useState<CatalogSubject[]>([]);
  // The catalog never changes per date, so fetch it once instead of on every tab visit.
  const catalogLoadedRef = useRef(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiAction, setAiAction] = useState<DiverseAIAction | null>(null);
  const [lastAIAction, setLastAIAction] = useState<DiverseAIAction | null>(null);
  const [aiError, setAiError] = useState('');
  const [selectedDiverseSubjectSlug, setSelectedDiverseSubjectSlug] = useState<string | null>(null);
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [lessonGenMessage, setLessonGenMessage] = useState('');
  const [pendingDiverseSave, setPendingDiverseSave] = useState(false);
  const [pendingLessonDraft, setPendingLessonDraft] = useState<PendingLessonDraft | null>(null);
  const [generatingDiverseQuestions, setGeneratingDiverseQuestions] = useState(false);
  const diverseMutationLockRef = useRef(false);
  const diverseQuestionGenerationLockRef = useRef(false);

  // ── Coding tab state ────────────────────────────────────────────────────────
  const [codingDay, setCodingDay] = useState<CodingDay | null>(null);
  const [loadingCoding, setLoadingCoding] = useState(false);
  const [savingCoding, setSavingCoding] = useState(false);
  const [codingSaved, setCodingSaved] = useState('');
  const [codingError, setCodingError] = useState('');
  const [editingSubject, setEditingSubject] = useState<string | null>(null);

  // ── Pomodoro state (shared) ─────────────────────────────────────────────────
  const [pomodoroState, setPomodoroState] = useState(createInitialPomodoroState);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [pomodoroMessage, setPomodoroMessage] = useState('');
  const todayPomodoroCount = getTodaysPomodoroCount(pomodoroState);
  // Baseline for detecting new pomodoro completions to sync to backend
  const pomodoroSyncBaseRef = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'english' || tab === 'coding' || tab === 'diverse' || tab === 'dashboard') {
      setActiveTab(tab);
      setSelectedDiverseSubjectSlug(null);
    } else if (tab) {
      setActiveTab('diverse');
      // Keep a single "Outras matérias" entrypoint; subjects are selected via dropdown.
      setSelectedDiverseSubjectSlug(null);
    }
  }, []);

  useEffect(() => {
    diverseDayRef.current = diverseDay;
  }, [diverseDay]);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  function setStudyUrlTab(slug: string | null) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!slug || slug === 'english') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', slug);
    }
    window.history.replaceState(null, '', url.toString());
  }

  function selectStudyTab(tab: StudyTab) {
    setActiveTab(tab);
    setSelectedDiverseSubjectSlug(null);
    setStudyUrlTab(tab === 'english' ? null : tab);
  }

  function selectDiverseSubjectTab(slug: string) {
    setActiveTab('diverse');
    setSelectedDiverseSubjectSlug(slug);
    setStudyUrlTab(slug);
  }

  function selectDiverseOverview() {
    setActiveTab('diverse');
    setSelectedDiverseSubjectSlug(null);
    setStudyUrlTab('diverse');
  }

  // ── Load dashboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let cancelled = false;
    setLoading(true);
    api.getStudyDashboard()
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setSelectedDate(data.today.study_date);
        // Merge backend pomodoro counts into local state (take max of local vs backend)
        const allDays = [...data.recent_days, data.today];
        const backendByDate: Record<string, number> = {};
        for (const day of allDays) {
          if ((day.pomodoro_count ?? 0) > 0) backendByDate[day.study_date] = day.pomodoro_count;
        }
        // Read localStorage directly (already loaded synchronously before this async .then fires)
        const localStored = typeof window !== 'undefined'
          ? parseStoredPomodoroState(window.localStorage.getItem(POMODORO_STORAGE_KEY))
          : createInitialPomodoroState();
        const localByDate = localStored.completedByDate;
        // Merge: take max(local, backend) for each date
        const merged = { ...localByDate };
        for (const [d, cnt] of Object.entries(backendByDate)) {
          merged[d] = Math.max(merged[d] ?? 0, cnt);
        }
        // Sync local→backend for dates where local count exceeds backend (historical data)
        for (const [d, cnt] of Object.entries(localByDate)) {
          if (cnt > 0 && cnt > (backendByDate[d] ?? 0)) {
            api.saveStudyDay(d, { pomodoro_count: cnt }).catch(() => {});
          }
        }
        // Update pomodoroState with merged counts and set sync baseline
        setPomodoroState((prev) => ({ ...prev, completedByDate: merged }));
        pomodoroSyncBaseRef.current = { ...merged };
      })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err : new ApiError('Não foi possível carregar os estudos.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authState.status]);

  // ── Load English day ────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated' || !selectedDate) return;
    if (activeTab !== 'english') return;
    let cancelled = false;
    setLoadingDay(true);
    setSavedMessage('');
    setDayLoadFailed(false);
    api.getStudyDay(selectedDate)
      .then((data) => {
        if (cancelled) return;
        setPlanText(data.plan_text);
        setStudiedText(data.studied_text);
        setDistractions(data.distractions);
      })
      .catch(() => {
        if (cancelled) return;
        setPlanText(''); setStudiedText(''); setDistractions([]);
        setDayLoadFailed(true);
      })
      .finally(() => { if (!cancelled) setLoadingDay(false); });
    return () => { cancelled = true; };
  }, [authState.status, activeTab, selectedDate, dayReloadNonce]);

  // ── Load Diverse day ────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated' || !selectedDate) return;
    // Needed by the diverse tab and by the subject picker shown on the coding tab.
    if (activeTab !== 'diverse' && activeTab !== 'coding') return;
    let cancelled = false;
    setLoadingDiverse(true);
    setDiverseSaved('');
    api.getDiverseDay(selectedDate)
      .then((data) => { if (!cancelled) setDiverseDay(data); })
      .catch(() => { if (!cancelled) setDiverseDay(null); })
      .finally(() => { if (!cancelled) setLoadingDiverse(false); });
    return () => { cancelled = true; };
  }, [authState.status, activeTab, selectedDate]);

  useEffect(() => {
    if (activeTab !== 'diverse' || !selectedDiverseSubjectSlug || !diverseDay) return;
    const exists = diverseDay.custom_subjects.some(
      (subject, index, subjects) => getDiverseSubjectSlug(subject, index, subjects) === selectedDiverseSubjectSlug
    );
    if (!exists) {
      setSelectedDiverseSubjectSlug(null);
      setStudyUrlTab('diverse');
    }
  }, [activeTab, diverseDay, selectedDiverseSubjectSlug]);

  // ── Load Diverse catalog ─────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated' || activeTab !== 'diverse') return;
    if (catalogLoadedRef.current) return;
    catalogLoadedRef.current = true;
    api.getDiverseCatalog().then(setCatalog).catch(() => { catalogLoadedRef.current = false; });
  }, [authState.status, activeTab]);

  // ── Load Coding day ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated' || !selectedDate) return;
    if (activeTab !== 'coding') return;
    let cancelled = false;
    setLoadingCoding(true);
    setCodingSaved('');
    api.getCodingDay(selectedDate)
      .then((data) => { if (!cancelled) setCodingDay(data); })
      .catch(() => { if (!cancelled) setCodingDay(null); })
      .finally(() => { if (!cancelled) setLoadingCoding(false); });
    return () => { cancelled = true; };
  }, [authState.status, activeTab, selectedDate]);

  // ── Notification permission ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setNotificationPermission('Notification' in window ? Notification.permission : 'unsupported');
  }, []);

  // ── Pomodoro persistence ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = parseStoredPomodoroState(window.localStorage.getItem(POMODORO_STORAGE_KEY));
    const resolved = resolvePomodoroState(stored, Date.now());
    setPomodoroState(resolved);
    // Initialize sync baseline with local counts (dashboard load will overwrite with merged counts)
    if (pomodoroSyncBaseRef.current === null) {
      pomodoroSyncBaseRef.current = { ...resolved.completedByDate };
    }
    if (stored.running && stored.endsAt !== null && stored.endsAt <= Date.now()) {
      setPomodoroMessage(getPomodoroCompletionMessage(stored.mode));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(pomodoroState));
  }, [pomodoroState]);

  // ── Pomodoro backend sync (persists daily counts across devices/sessions) ───
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    const base = pomodoroSyncBaseRef.current;
    if (base === null) return; // not initialized yet
    const current = pomodoroState.completedByDate;
    const updates: Array<[string, number]> = [];
    for (const [d, cnt] of Object.entries(current)) {
      if (cnt > (base[d] ?? 0)) updates.push([d, cnt]);
    }
    if (updates.length === 0) return;
    const newBase = { ...base };
    for (const [d, cnt] of updates) {
      newBase[d] = cnt;
      api.saveStudyDay(d, { pomodoro_count: cnt }).catch(() => {});
    }
    pomodoroSyncBaseRef.current = newBase;
  }, [pomodoroState.completedByDate, authState.status]);

  // ── Pomodoro timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tick = () => {
      setPomodoroState((current) => {
        const now = Date.now();
        const completed = current.running && current.endsAt !== null && current.endsAt <= now;
        const previousMode = current.mode;
        const resolved = resolvePomodoroState(current, now);
        if (completed && resolved.mode !== previousMode) {
          const msg = getPomodoroCompletionMessage(previousMode);
          setPomodoroMessage(msg);
          if (notificationPermission === 'granted') new Notification('Tutor and Professor', { body: msg });
        }
        return resolved;
      });
    };

    const id = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    tick();

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [notificationPermission]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function togglePomodoro() {
    setPomodoroState((current) => {
      const resolved = resolvePomodoroState(current, Date.now());
      return resolved.running ? pausePomodoro(resolved) : startPomodoro(resolved);
    });
    setPomodoroMessage('');
  }

  function switchPomodoro(mode: PomodoroMode) {
    setPomodoroState((current) => resetPomodoro(current, mode));
    setPomodoroMessage('');
  }

  async function requestNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      setPomodoroMessage('Este navegador nao suporta notificacoes.');
      return;
    }
    const p = await Notification.requestPermission();
    setNotificationPermission(p);
    setPomodoroMessage(p === 'granted' ? 'Notificacoes ativadas.' : 'Notificacoes nao foram ativadas.');
  }

  function addDistraction() {
    const v = newDistraction.trim();
    if (!v) return;
    if (!distractions.some((d) => d.toLowerCase() === v.toLowerCase()))
      setDistractions((items) => [...items, v].slice(0, 20));
    setNewDistraction('');
  }

  async function saveEnglishDay() {
    // Never write over a day we never managed to read — the empty fields are a
    // loading artefact, not the user's content.
    if (dayLoadFailed) return;
    setSaving(true); setSavedMessage(''); setError(null);
    try {
      await api.saveStudyDay(selectedDate, { plan_text: planText, studied_text: studiedText, distractions });
      const refreshed = await api.getStudyDashboard();
      setDashboard(refreshed);
      setSavedMessage(studiedText.trim() ? 'Estudo registrado.' : 'Planejamento salvo.');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Não foi possível salvar.'));
    } finally { setSaving(false); }
  }

  function toggleTopic(subject: string, index: number) {
    if (!codingDay) return;
    const topics = (codingDay.subjects[subject] ?? []).map((t, i) =>
      i === index ? { ...t, done: !t.done } : t
    );
    setCodingDay({ ...codingDay, subjects: { ...codingDay.subjects, [subject]: topics } });
  }

  function updateTopicText(subject: string, index: number, value: string) {
    if (!codingDay) return;
    const topics = (codingDay.subjects[subject] ?? []).map((t, i) =>
      i === index ? { ...t, topic: value } : t
    );
    setCodingDay({ ...codingDay, subjects: { ...codingDay.subjects, [subject]: topics } });
  }

  async function saveCodingDay() {
    if (!codingDay) return;
    setSavingCoding(true); setCodingSaved(''); setCodingError('');
    try {
      const saved = await api.saveCodingDay(selectedDate, { subjects: codingDay.subjects });
      setCodingDay(saved);
      setCodingSaved('Progresso de programacao salvo.');
    } catch {
      setCodingError('Não foi possível salvar o progresso.');
    } finally { setSavingCoding(false); }
  }

  async function addDiverseSubject() {
    if (diverseMutationLockRef.current) return;
    const name = newSubjectName.trim();
    const initialTopicCount = 3;
    if (!name) {
      setDiverseError('Digite o nome da matéria para criar.');
      return;
    }
    const subjects = diverseDay?.custom_subjects ?? [];
    if (subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setDiverseError('Essa matéria já existe para esta data.');
      return;
    }
    setDiverseError('');
    setDiverseSaved('');
    setAiError('');
    setGeneratingAI(true);
    setAiAction('create-subject');
    setLastAIAction('create-subject');

    diverseMutationLockRef.current = true;
    setSavingDiverse(true);
    try {
      const result = await api.generateStudyFlashcards({
        subject: name,
        count: initialTopicCount,
      });
      const initialTopics = flashcardsToTopics(result.flashcards).slice(0, initialTopicCount);
      if (initialTopics.length !== initialTopicCount) {
        setDiverseError('A IA não retornou 3 tópicos iniciais para essa matéria. Tente novamente.');
        return;
      }
      const newSubject: DiverseSubject = { id: createLocalSubjectId(), name, topics: initialTopics, lessons: [] };
      const nextSubjects = [...subjects, newSubject];
      const newDay: DiverseDay = {
        id: diverseDay?.id ?? null,
        study_date: selectedDate,
        custom_subjects: nextSubjects,
        created_at: diverseDay?.created_at ?? null,
        updated_at: diverseDay?.updated_at ?? null,
      };
      const newSubjectSlug = getDiverseSubjectSlug(newSubject, nextSubjects.length - 1, nextSubjects);
      setDiverseDay(newDay);
      setNewSubjectName('');
      selectDiverseSubjectTab(newSubjectSlug);
      const saved = await api.saveDiverseDay(selectedDate, { custom_subjects: nextSubjects });
      setDiverseDay(saved);
      setDiverseSaved('Matéria criada com 3 tópicos iniciais da IA.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível criar a matéria com 3 tópicos iniciais da IA.';
      setDiverseError(message);
    } finally {
      diverseMutationLockRef.current = false;
      setSavingDiverse(false);
      setGeneratingAI(false);
      setAiAction(null);
    }
  }

  function addDiverseTopicsBulk(subjectIndex: number, newTopics: CodingTopic[]) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay || newTopics.length === 0) return;
    const canonicalTopics = newTopics.map((topic) => ({
      ...topic,
      id: topic.id || createLocalQuestionId(),
    }));
    const subjects = diverseDay.custom_subjects.map((s, si) =>
      si === subjectIndex ? { ...s, topics: [...s.topics, ...canonicalTopics] } : s
    );
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function applyTopicRating(topic: CodingTopic, rating: StudyRating): CodingTopic {
    return {
      ...topic,
      last_rating: rating,
      review_count: (topic.review_count ?? 0) + 1,
      last_reviewed: new Date().toISOString(),
      done: rating === 'unknown' ? topic.done : true,
    };
  }

  function rateDiverseTopic(subjectIndex: number, topicIndex: number, rating: StudyRating) {
    if (diverseMutationLockRef.current) return;
    setDiverseDay((current) => {
      if (!current) return current;
      const subjects = current.custom_subjects.map((s, si) =>
        si === subjectIndex
          ? { ...s, topics: s.topics.map((t, ti) => (ti === topicIndex ? applyTopicRating(t, rating) : t)) }
          : s
      );
      return { ...current, custom_subjects: subjects };
    });
  }

  function rateDiverseLessonTopic(subjectIndex: number, topicId: string, rating: StudyRating) {
    if (diverseMutationLockRef.current) return;
    setDiverseDay((current) => {
      if (!current) return current;
      const subjects = current.custom_subjects.map((s, si) => {
        if (si !== subjectIndex) return s;
        return updateDiverseQuestionById(s, topicId, (topic) => applyTopicRating(topic, rating));
      });
      return { ...current, custom_subjects: subjects };
    });
  }

  // After a study session finishes, persist ratings so spaced repetition survives reloads.
  function requestDiverseAutoSave() {
    if (diverseMutationLockRef.current) return;
    setPendingDiverseSave(true);
  }

  function updateDiverseTopicAnswer(subjectIndex: number, topicIndex: number, value: string) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) =>
      si === subjectIndex
        ? { ...s, topics: s.topics.map((t, ti) => ti === topicIndex ? { ...t, answer: value } : t) }
        : s
    );
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  async function removeDiverseSubject(index: number) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const removedSubject = diverseDay.custom_subjects[index];
    if (!removedSubject) return;
    const removedSlug = getDiverseSubjectSlug(removedSubject, index, diverseDay.custom_subjects);
    const subjects = diverseDay.custom_subjects.filter((_, i) => i !== index);
    const nextDay = { ...diverseDay, custom_subjects: subjects };
    diverseDayRef.current = nextDay;
    setDiverseDay(nextDay);
    setPendingLessonDraft((draft) => clearDraftForRemovedSubject(draft, removedSubject.id));
    if (selectedDiverseSubjectSlug === removedSlug) selectDiverseOverview();

    diverseMutationLockRef.current = true;
    setSavingDiverse(true);
    setDiverseError('');
    setDiverseSaved('');
    try {
      const saved = await api.saveDiverseDay(selectedDate, { custom_subjects: subjects });
      diverseDayRef.current = saved;
      setDiverseDay(saved);
      setDiverseSaved('Matéria removida com sucesso.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível apagar a matéria agora.';
      setDiverseError(message);
      diverseDayRef.current = diverseDay;
      setDiverseDay(diverseDay);
      if (selectedDiverseSubjectSlug === removedSlug) selectDiverseSubjectTab(removedSlug);
    } finally {
      diverseMutationLockRef.current = false;
      setSavingDiverse(false);
    }
  }

  function toggleDiverseTopic(subjectIndex: number, topicIndex: number) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) =>
      si === subjectIndex
        ? { ...s, topics: s.topics.map((t, ti) => ti === topicIndex ? { ...t, done: !t.done } : t) }
        : s
    );
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function updateDiverseTopicText(subjectIndex: number, topicIndex: number, value: string) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) =>
      si === subjectIndex
        ? { ...s, topics: s.topics.map((t, ti) => ti === topicIndex ? { ...t, topic: value } : t) }
        : s
    );
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function updateDiverseLessonBlock(
    subjectIndex: number,
    lessonIndex: number,
    updater: (lesson: DiverseLessonBlock) => DiverseLessonBlock
  ) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) => {
      if (si !== subjectIndex) return s;
      const lessons = getDiverseSubjectLessons(s).map((lesson, li) => li === lessonIndex ? updater(lesson) : lesson);
      return { ...s, lessons };
    });
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function updateDiverseLessonQuestion(
    subjectIndex: number,
    topicId: string,
    updater: (topic: CodingTopic) => CodingTopic,
  ) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((subject, index) => {
      if (index !== subjectIndex) return subject;
      return updateDiverseQuestionById(subject, topicId, updater);
    });
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function updateDiverseLessonTitle(subjectIndex: number, lessonIndex: number, value: string) {
    updateDiverseLessonBlock(subjectIndex, lessonIndex, (lesson) => ({ ...lesson, title: value }));
  }

  function removeDiverseLessonBlock(subjectIndex: number, lessonIndex: number) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) => {
      if (si !== subjectIndex) return s;
      const lessons = getDiverseSubjectLessons(s).filter((_, li) => li !== lessonIndex);
      return { ...s, lessons };
    });
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function toggleDiverseLessonTopic(subjectIndex: number, topicId: string) {
    updateDiverseLessonQuestion(subjectIndex, topicId, (topic) => ({ ...topic, done: !topic.done }));
  }

  function updateDiverseLessonTopicText(subjectIndex: number, topicId: string, value: string) {
    updateDiverseLessonQuestion(subjectIndex, topicId, (topic) => ({ ...topic, topic: value }));
  }

  function updateDiverseLessonTopicAnswer(subjectIndex: number, topicId: string, value: string) {
    updateDiverseLessonQuestion(subjectIndex, topicId, (topic) => ({ ...topic, answer: value }));
  }

  function updateDiverseSubjectName(subjectIndex: number, value: string) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const previousSlug = getDiverseSubjectSlug(diverseDay.custom_subjects[subjectIndex], subjectIndex, diverseDay.custom_subjects);
    const subjects = diverseDay.custom_subjects.map((s, si) => si === subjectIndex ? { ...s, name: value } : s);
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
    if (selectedDiverseSubjectSlug === previousSlug) {
      selectDiverseSubjectTab(getDiverseSubjectSlug(subjects[subjectIndex], subjectIndex, subjects));
    }
  }

  function flashcardsToTopics(flashcards: { topic: string; answer: string; code_example?: string | null }[]): CodingTopic[] {
    return flashcards.map((f) => ({
      id: createLocalQuestionId(),
      topic: f.topic,
      done: false,
      answer: f.answer,
      code_example: f.code_example ?? null,
    }));
  }

  async function generateAIFlashcards(inlineApiKey?: string, suggestSubject = false) {
    const name = newSubjectName.trim();
    if (!name && !suggestSubject) return;
    if (diverseMutationLockRef.current) return;
    diverseMutationLockRef.current = true;
    setGeneratingAI(true);
    const action: DiverseAIAction = suggestSubject ? 'suggest-subject' : 'create-subject';
    setAiAction(action);
    setLastAIAction(action);
    setAiError('');
    try {
      const payload = {
        subject: name,
        count: AI_FLASHCARD_COUNT,
        ...(suggestSubject ? { suggest_subject: true } : {}),
        ...(inlineApiKey ? { api_key: inlineApiKey } : {}),
      };
      const result = await api.generateStudyFlashcards(payload);
      const subjects = diverseDay?.custom_subjects ?? [];
      if (subjects.some((s) => s.name.toLowerCase() === result.subject.toLowerCase())) {
        setAiError('Já existe uma matéria com esse nome. Renomeie-a antes de gerar nova.');
        return;
      }
      const newTopics = flashcardsToTopics(result.flashcards);
      const newSubject: DiverseSubject = { id: createLocalSubjectId(), name: result.subject, topics: newTopics, lessons: [] };
      const nextSubjects = [...subjects, newSubject];
      const newDay: DiverseDay = {
        id: diverseDay?.id ?? null,
        study_date: selectedDate,
        custom_subjects: nextSubjects,
        created_at: diverseDay?.created_at ?? null,
        updated_at: diverseDay?.updated_at ?? null,
      };
      setDiverseDay(newDay);
      setNewSubjectName('');
      selectDiverseSubjectTab(getDiverseSubjectSlug(newSubject, nextSubjects.length - 1, nextSubjects));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Não foi possível criar aula com IA.';
      setAiError(msg);
    } finally {
      diverseMutationLockRef.current = false;
      setGeneratingAI(false);
      setAiAction(null);
    }
  }

  async function generateDiverseTopic(subjectId: string, inlineApiKey?: string) {
    const subject = diverseDay?.custom_subjects.find((candidate) => candidate.id === subjectId);
    if (!subject?.name.trim()) return;
    if (subject.topics.length >= 50) {
      setAiError('Limite de 50 tópicos gerais atingido. Crie uma nova lição em bloco para continuar.');
      return;
    }
    if (diverseMutationLockRef.current) return;
    diverseMutationLockRef.current = true;
    setGeneratingAI(true);
    setAiAction('topic');
    setLastAIAction('topic');
    setAiError('');
    setDiverseSaved('');
    try {
      const avoidTopics = getDiverseAvoidTopics(subject);
      const result = await api.generateStudyFlashcards({
        subject: subject.name,
        count: 1,
        generation_mode: 'topic',
        avoid_topics: avoidTopics,
        ...(inlineApiKey ? { api_key: inlineApiKey } : {}),
      });
      const newTopic = filterFreshDiverseTopics(flashcardsToTopics(result.flashcards), avoidTopics)[0];
      if (!newTopic) {
        setAiError('A IA sugeriu um topico repetido. Tente novamente para avancar para outro assunto.');
        return;
      }
      const currentDay = diverseDayRef.current;
      const currentSubjects = currentDay?.custom_subjects ?? [];
      if (!currentDay || findItemIndexById(currentSubjects, subject.id) < 0) {
        setAiError('A matéria foi removida antes de concluir a sugestão. Nenhum tópico foi adicionado.');
        return;
      }
      const subjects = appendTopicToSubjectById(currentSubjects, subject.id, newTopic);
      const nextDay = { ...currentDay, custom_subjects: subjects };
      diverseDayRef.current = nextDay;
      setDiverseDay(nextDay);
      setDiverseSaved('Tópico sugerido pela IA. Salve a matéria para guardar.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Não foi possível sugerir tópico com IA.';
      setAiError(msg);
    } finally {
      diverseMutationLockRef.current = false;
      setGeneratingAI(false);
      setAiAction(null);
    }
  }

  async function regenerateDiverseTopicWithAI(
    subjectIndex: number,
    topicIndex: number,
    context?: string,
    inlineApiKey?: string,
  ) {
    if (diverseMutationLockRef.current) return;
    if (!diverseDay) return;
    const subject = diverseDay.custom_subjects[subjectIndex];
    const currentTopic = subject?.topics?.[topicIndex];
    if (!subject || !currentTopic || !subject.name.trim()) return;

    diverseMutationLockRef.current = true;
    setGeneratingAI(true);
    setAiAction('topic');
    setLastAIAction('topic');
    setAiError('');
    setDiverseSaved('');
    try {
      const currentTopicKey = normalizeDiverseTopicText(currentTopic.topic);
      const avoidTopics = getDiverseAvoidTopics(subject).filter((topicName) => normalizeDiverseTopicText(topicName) !== currentTopicKey);
      const result = await api.generateStudyFlashcards({
        subject: subject.name,
        count: 1,
        generation_mode: 'topic',
        avoid_topics: avoidTopics,
        ...(context?.trim() ? { context: context.trim() } : {}),
        ...(inlineApiKey ? { api_key: inlineApiKey } : {}),
      });
      const replacement = filterFreshDiverseTopics(flashcardsToTopics(result.flashcards), avoidTopics)[0];
      if (!replacement) {
        setAiError('A IA não conseguiu gerar um tópico novo para substituir este item. Tente novamente.');
        return;
      }

      setDiverseDay((current) => {
        if (!current) return current;
        const subjects = current.custom_subjects.map((candidate, si) => {
          if (si !== subjectIndex) return candidate;
          const topics = candidate.topics.map((topic, ti) => {
            if (ti !== topicIndex) return topic;
            return {
              ...topic,
              topic: replacement.topic,
              answer: replacement.answer,
              code_example: replacement.code_example ?? null,
              done: false,
            };
          });
          return { ...candidate, topics };
        });
        const nextDay = { ...current, custom_subjects: subjects };
        diverseDayRef.current = nextDay;
        return nextDay;
      });
      setDiverseSaved('Tópico regenerado com IA. Salve a matéria para guardar.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Não foi possível regenerar este tópico com IA.';
      setAiError(msg);
    } finally {
      diverseMutationLockRef.current = false;
      setGeneratingAI(false);
      setAiAction(null);
    }
  }

  async function generateDiverseLesson(subjectId: string, inlineApiKey?: string, context?: string) {
    const subject = diverseDay?.custom_subjects.find((candidate) => candidate.id === subjectId);
    if (!subject?.name.trim()) return;
    if (getDiverseSubjectLessons(subject).length >= 30) {
      setAiError('Limite de 30 blocos de lição atingido para esta matéria.');
      return;
    }
    if (diverseMutationLockRef.current) return;
    diverseMutationLockRef.current = true;
    setGeneratingAI(true);
    setAiAction('lesson');
    setLastAIAction('lesson');
    setAiError('');
    setDiverseSaved('');
    try {
      const avoidTopics = getDiverseAvoidTopics(subject);
      const result = await api.generateStudyFlashcards({
        subject: subject.name,
        count: AI_FLASHCARD_COUNT,
        generation_mode: 'lesson',
        avoid_topics: avoidTopics,
        ...(context?.trim() ? { context: context.trim() } : {}),
        ...(inlineApiKey ? { api_key: inlineApiKey } : {}),
      });
      const topics = filterFreshDiverseTopics(flashcardsToTopics(result.flashcards), avoidTopics);
      if (topics.length !== AI_FLASHCARD_COUNT) {
        setAiError('A IA precisa gerar exatamente 5 questões novas para criar a lição. Nenhum preview foi salvo.');
        return;
      }
      const lesson: DiverseLessonBlock = {
        id: createLocalLessonId(),
        title: buildLessonTitle(subject, topics),
        created_at: new Date().toISOString(),
        topic_ids: topics.map((topic) => topic.id),
      };
      const currentSubjects = diverseDayRef.current?.custom_subjects ?? [];
      const currentSubjectIndex = findItemIndexById(currentSubjects, subject.id);
      if (currentSubjectIndex < 0) {
        setPendingLessonDraft((draft) => clearDraftForRemovedSubject(draft, subject.id));
        setAiError('A matéria foi removida antes de concluir o preview. Gere novamente em outra matéria.');
        return;
      }
      setPendingLessonDraft({ subjectId: subject.id, lesson, topics });
      setDiverseSaved('Preview da lição criado. Revise antes de salvar.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Não foi possível criar lição com IA.';
      setAiError(msg);
    } finally {
      diverseMutationLockRef.current = false;
      setGeneratingAI(false);
      setAiAction(null);
    }
  }

  function savePendingLessonDraft() {
    if (diverseMutationLockRef.current) return;
    if (!pendingLessonDraft) return;
    const { subjectId, lesson, topics } = pendingLessonDraft;
    const latestSubjects = diverseDayRef.current?.custom_subjects ?? [];
    if (findItemIndexById(latestSubjects, subjectId) < 0) {
      setPendingLessonDraft(null);
      setDiverseSaved('');
      setAiError('A matéria deste preview não existe mais. O preview foi descartado.');
      return;
    }
    setDiverseDay((current) => {
      if (!current) return current;
      const currentSubjectIndex = findItemIndexById(current.custom_subjects, subjectId);
      if (currentSubjectIndex < 0) return current;
      const subject = current.custom_subjects[currentSubjectIndex];
      const nextTopics = filterFreshDiverseTopics(topics, getDiverseAvoidTopics(subject));
      const canonicalLesson = { ...lesson, topic_ids: nextTopics.map((topic) => topic.id) };
      const subjects = updateSubjectById(
        current.custom_subjects,
        subjectId,
        (currentSubject) => ({
          ...currentSubject,
          topics: [...currentSubject.topics, ...nextTopics],
          lessons: [...getDiverseSubjectLessons(currentSubject), canonicalLesson],
        }),
      );
      return { ...current, custom_subjects: subjects };
    });
    setPendingLessonDraft(null);
    setDiverseSaved('Lição adicionada em bloco e tópicos incluídos na matéria. Salve para guardar.');
  }

  function discardPendingLessonDraft() {
    setPendingLessonDraft(null);
    setDiverseSaved('');
  }

  async function generateNewLesson() {
    setGeneratingLesson(true); setLessonGenMessage('');
    try {
      await api.generateMorePhrases({ quantity: 1 });
      setLessonGenMessage('Nova lição criada com sucesso!');
    } catch (err) {
      setLessonGenMessage(err instanceof ApiError ? err.message : 'Não foi possível criar a lição.');
    } finally { setGeneratingLesson(false); }
  }

  async function generateMoreDiverseQuestions(subjectId: string, lessonId: string, context?: string) {
    if (diverseQuestionGenerationLockRef.current || diverseMutationLockRef.current) {
      throw new Error('Outra alteração desta matéria ainda está em andamento. Aguarde e tente novamente.');
    }

    const currentDay = diverseDayRef.current;
    if (!currentDay || !resolveDiverseGenerationTarget(currentDay, subjectId, lessonId)) {
      throw new Error('A matéria ou lição selecionada não existe mais. Atualize a seleção e tente novamente.');
    }

    const generationDate = selectedDate;
    diverseQuestionGenerationLockRef.current = true;
    diverseMutationLockRef.current = true;
    setGeneratingDiverseQuestions(true);
    setDiverseSaved('');
    setDiverseError('');

    try {
      // Persist every local edit before asking the server to append canonical questions.
      const saved = await api.saveDiverseDay(generationDate, {
        custom_subjects: currentDay.custom_subjects,
      });
      if (selectedDateRef.current === generationDate) {
        diverseDayRef.current = saved;
        setDiverseDay(saved);
      }

      // Resolve the backend index only from the saved response, never from a captured array index.
      const target = resolveDiverseGenerationTarget(saved, subjectId, lessonId);
      if (!target) {
        throw new Error('A matéria ou lição foi removida durante a atualização. Nenhuma questão foi criada.');
      }

      const outcome = await generateAndSynchronizeDiverseQuestions({
        savedDay: saved,
        subjectId,
        lessonId,
        generate: () => api.generateDiverseQuestions({
          study_date: generationDate,
          subject_index: target.subjectIndex,
          lesson_id: lessonId,
          ...(context?.trim() ? { context: context.trim() } : {}),
        }),
        installConfirmed: (confirmedDay) => {
          if (selectedDateRef.current !== generationDate) return;
          diverseDayRef.current = confirmedDay;
          setDiverseDay(confirmedDay);
        },
        refresh: () => api.getDiverseDay(generationDate),
      });
      const successMessage = outcome.synchronized
        ? '5 novas questões foram adicionadas à lição.'
        : '5 novas questões foram criadas. A sincronização final falhou; recarregue a página se necessário.';
      if (selectedDateRef.current === generationDate) {
        diverseDayRef.current = outcome.day;
        setDiverseDay(outcome.day);
        setDiverseSaved(successMessage);
      }
      return successMessage;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await api.getDiverseDay(generationDate);
        if (selectedDateRef.current === generationDate) {
          diverseDayRef.current = fresh;
          setDiverseDay(fresh);
        }
        throw new Error('A matéria mudou em outra operação. Os dados foram atualizados; revise e tente novamente.');
      }
      throw err;
    } finally {
      diverseQuestionGenerationLockRef.current = false;
      diverseMutationLockRef.current = false;
      setGeneratingDiverseQuestions(false);
    }
  }

  async function saveDiverseDay() {
    if (!diverseDay) return;
    if (diverseMutationLockRef.current) return;
    diverseMutationLockRef.current = true;
    setSavingDiverse(true); setDiverseSaved(''); setDiverseError('');
    try {
      const saved = await api.saveDiverseDay(selectedDate, { custom_subjects: diverseDay.custom_subjects });
      setDiverseDay(saved);
      setDiverseSaved('Aprendizado diverso salvo.');
    } catch {
      setDiverseError('Não foi possível salvar.');
    } finally {
      diverseMutationLockRef.current = false;
      setSavingDiverse(false);
    }
  }

  // Persist study ratings once after the state has settled (avoids saving stale data).
  useEffect(() => {
    if (!pendingDiverseSave) return;
    setPendingDiverseSave(false);
    void saveDiverseDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDiverseSave]);

  const codingDoneCount = useMemo(() => {
    if (!codingDay) return 0;
    return Object.values(codingDay.subjects).flat().filter((t) => t.done).length;
  }, [codingDay]);

  const codingTotalCount = useMemo(() => {
    if (!codingDay) return 0;
    return Object.values(codingDay.subjects).flat().length;
  }, [codingDay]);
  const selectedOtherMatterValue = activeTab === 'coding' ? '__coding__' : selectedDiverseSubjectSlug ?? '';

  // ── Auth guards ─────────────────────────────────────────────────────────────
  if (authState.status === 'loading' || authState.status === 'unauthenticated') {
    return <StatusCard tone="loading" title="Verificando acesso" message="Confirmando seu cadastro..." secondaryHref="/" secondaryLabel="Voltar ao inicio" />;
  }
  if (authState.status === 'server_missing') {
    return (
      <StatusCard tone="offline" title="Servidor nao disponivel" message="Ative o backend para acompanhar os estudos."
        primaryAction={<Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>}
        secondaryHref="/" secondaryLabel="Voltar ao inicio" />
    );
  }
  if (loading) {
    return <StatusCard tone="loading" title="Abrindo caderno de estudos" message="Buscando planejamento e historico..." secondaryHref="/" secondaryLabel="Voltar ao inicio" />;
  }
  if (error?.isUnconfigured || error?.isOffline) {
    return (
      <StatusCard tone="offline" title="Nao consegui conectar" message={error.message}
        primaryAction={<Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>}
        secondaryHref="/" secondaryLabel="Voltar ao inicio" />
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl">

        {/* Top bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
            <ArrowLeft size={18} /> Voltar
          </Link>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <span className="kid-tag w-fit text-xs">Painel de disciplina</span>
            <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
              <CalendarDays size={14} />
              <span className="sr-only">Data</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-[8.5rem] bg-transparent text-xs font-black text-slate-700 outline-none"
              />
            </label>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="mb-6 flex gap-2 overflow-x-auto rounded-[1.4rem] border-2 border-slate-200 bg-white p-1.5 shadow-sm">
          <TabButton active={activeTab === 'dashboard'} onClick={() => selectStudyTab('dashboard')} icon={<BarChart2 size={17} />} label="Dashboard" />
          <TabButton active={activeTab === 'english'} onClick={() => selectStudyTab('english')} icon={<BookOpen size={17} />} label="English" mobileLabel="English" />
          <TabButton
            active={activeTab === 'diverse' || activeTab === 'coding'}
            onClick={selectDiverseOverview}
            icon={<Layers size={17} />}
            label="Outras Matérias"
            mobileLabel="Matérias"
          />
        </div>

        {(activeTab === 'diverse' || activeTab === 'coding') && (
          <OtherSubjectsPicker
            subjects={diverseDay?.custom_subjects ?? []}
            selectedValue={selectedOtherMatterValue}
            onSelectOverview={selectDiverseOverview}
            onSelectCoding={() => selectStudyTab('coding')}
            onSelectSubjectTab={selectDiverseSubjectTab}
          />
        )}

        {activeTab === 'english' && (
          <Link
            href="/lesson"
            className="mb-6 flex w-full items-center gap-4 rounded-[1.5rem] border-2 border-primary/20 bg-white/90 p-5 text-left shadow-[0_10px_28px_rgba(14,165,233,0.12)] transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_14px_34px_rgba(14,165,233,0.18)]"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-white">
              <BookOpen size={26} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-black text-slate-800">Começar lição de inglês</span>
              <span className="mt-1 block text-sm font-semibold text-slate-500">Abrir página de lições</span>
            </span>
            <ChevronRight size={24} className="shrink-0 text-primary" />
          </Link>
        )}
        {activeTab === 'english' ? (
          <EnglishTab
            dashboard={dashboard}
            selectedDate={selectedDate}
            planText={planText} setPlanText={setPlanText}
            studiedText={studiedText} setStudiedText={setStudiedText}
            distractions={distractions}
            newDistraction={newDistraction} setNewDistraction={setNewDistraction}
            addDistraction={addDistraction}
            removeDistraction={(i) => setDistractions((d) => d.filter((_, idx) => idx !== i))}
            loadingDay={loadingDay}
            dayLoadFailed={dayLoadFailed}
            onRetryLoadDay={() => setDayReloadNonce((n) => n + 1)}
            saving={saving}
            error={error}
            savedMessage={savedMessage}
            onSave={() => void saveEnglishDay()}
            generatingLesson={generatingLesson}
            lessonGenMessage={lessonGenMessage}
            onGenerateLesson={() => void generateNewLesson()}
            pomodoroMode={pomodoroState.mode}
            pomodoroSeconds={pomodoroState.seconds}
            pomodoroRunning={pomodoroState.running}
            todayPomodoroCount={todayPomodoroCount}
            notificationPermission={notificationPermission}
            pomodoroMessage={pomodoroMessage}
            onTogglePomodoro={togglePomodoro}
            onSwitchPomodoro={switchPomodoro}
            onRequestNotifications={() => void requestNotifications()}
          />
        ) : activeTab === 'diverse' ? (
          <DiverseTab
            selectedDate={selectedDate}
            diverseDay={diverseDay}
            catalog={catalog}
            loadingDiverse={loadingDiverse}
            savingDiverse={savingDiverse}
            diverseSaved={diverseSaved}
            diverseError={diverseError}
            newSubjectName={newSubjectName}
            setNewSubjectName={setNewSubjectName}
            onAddSubject={addDiverseSubject}
            onGenerateAI={(key) => void generateAIFlashcards(key)}
            generatingAI={generatingAI}
            aiAction={aiAction}
            lastAIAction={lastAIAction}
            aiError={aiError}
            selectedSubjectSlug={selectedDiverseSubjectSlug}
            onSelectSubjectTab={selectDiverseSubjectTab}
            onSelectOverview={selectDiverseOverview}
            onSelectCoding={() => selectStudyTab('coding')}
            onRemoveSubject={removeDiverseSubject}
            onToggleTopic={toggleDiverseTopic}
            onUpdateTopicText={updateDiverseTopicText}
            onUpdateTopicAnswer={updateDiverseTopicAnswer}
            onUpdateSubjectName={updateDiverseSubjectName}
            onGenerateTopicAI={(subjectId, key) => void generateDiverseTopic(subjectId, key)}
            onRegenerateTopicAI={(subjectIndex, topicIndex, context, key) => void regenerateDiverseTopicWithAI(subjectIndex, topicIndex, context, key)}
            onGenerateLessonAI={(subjectId, key, context) => void generateDiverseLesson(subjectId, key, context)}
            onGenerateMoreQuestions={generateMoreDiverseQuestions}
            generatingDiverseQuestions={generatingDiverseQuestions}
            pendingLessonDraft={pendingLessonDraft}
            onSaveLessonDraft={savePendingLessonDraft}
            onDiscardLessonDraft={discardPendingLessonDraft}
            onBulkAddTopics={(si, topics) => addDiverseTopicsBulk(si, topics)}
            onRateTopic={rateDiverseTopic}
            onRateLessonTopic={rateDiverseLessonTopic}
            onSessionComplete={requestDiverseAutoSave}
            onRemoveLesson={removeDiverseLessonBlock}
            onToggleLessonTopic={toggleDiverseLessonTopic}
            onUpdateLessonTitle={updateDiverseLessonTitle}
            onUpdateLessonTopicText={updateDiverseLessonTopicText}
            onUpdateLessonTopicAnswer={updateDiverseLessonTopicAnswer}
            onSave={() => void saveDiverseDay()}
            pomodoroMode={pomodoroState.mode}
            pomodoroSeconds={pomodoroState.seconds}
            pomodoroRunning={pomodoroState.running}
            todayPomodoroCount={todayPomodoroCount}
            notificationPermission={notificationPermission}
            pomodoroMessage={pomodoroMessage}
            onTogglePomodoro={togglePomodoro}
            onSwitchPomodoro={switchPomodoro}
            onRequestNotifications={() => void requestNotifications()}
          />
        ) : activeTab === 'dashboard' ? (
          <DashboardTab dashboard={dashboard} pomodoroState={pomodoroState} />
        ) : (
          <CodingTab
            selectedDate={selectedDate}
            codingDay={codingDay}
            loadingCoding={loadingCoding}
            savingCoding={savingCoding}
            codingSaved={codingSaved}
            codingError={codingError}
            codingDoneCount={codingDoneCount}
            codingTotalCount={codingTotalCount}
            editingSubject={editingSubject}
            setEditingSubject={setEditingSubject}
            codingMode={codingMode}
            setCodingMode={setCodingMode}
            onToggleTopic={toggleTopic}
            onUpdateTopicText={updateTopicText}
            onSave={() => void saveCodingDay()}
            pomodoroMode={pomodoroState.mode}
            pomodoroSeconds={pomodoroState.seconds}
            pomodoroRunning={pomodoroState.running}
            todayPomodoroCount={todayPomodoroCount}
            notificationPermission={notificationPermission}
            pomodoroMessage={pomodoroMessage}
            onTogglePomodoro={togglePomodoro}
            onSwitchPomodoro={switchPomodoro}
            onRequestNotifications={() => void requestNotifications()}
          />
        )}
      </div>

    </main>
  );
}

