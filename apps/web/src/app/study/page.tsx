'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, BarChart2, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Code2, Copy,
  Flame, Layers, Loader2, Pause, Pencil, Play, Plus, RotateCcw, Save, Sparkles, Timer, Trash2, X, Zap,
} from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { CodingCurriculum } from '@/components/coding/CodingCurriculum';
import { ApiError, api, type CatalogSubject, type CodingDay, type CodingTopic, type DiverseDay, type DiverseLessonBlock, type DiverseSubject, type StudyDashboard, type StudyDay } from '@/lib/api';
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

const AI_FLASHCARD_COUNT = 5;

type StudyTab = 'english' | 'coding' | 'diverse' | 'dashboard';

interface InlineStudyState {
  order: number[];        // topic indices, sorted by review priority
  position: number;       // current position within `order`
  userAnswer: string;
  revealed: boolean;
  results: StudyRating[]; // indexed by position in `order`
  done: boolean;
}

type StudyRating = 'knew' | 'partial' | 'unknown';
type DiverseAIAction = 'create-subject' | 'suggest-subject' | 'topic' | 'lesson';

const SUBJECT_META: Record<string, { label: string; badge: string; tone: string; iconColor: string; borderColor: string; bgColor: string }> = {
  react:      { label: 'React',      badge: '⚛',  tone: 'cyan',  iconColor: 'text-cyan-700',  borderColor: 'border-cyan-200',  bgColor: 'bg-cyan-50'  },
  leetcode:   { label: 'LeetCode',   badge: 'LC', tone: 'amber', iconColor: 'text-amber-700', borderColor: 'border-amber-200', bgColor: 'bg-amber-50' },
  typescript: { label: 'TypeScript', badge: '🔷', tone: 'blue',  iconColor: 'text-blue-700',  borderColor: 'border-blue-200',  bgColor: 'bg-blue-50'  },
  nextjs:     { label: 'Next.js',    badge: '▲',  tone: 'slate', iconColor: 'text-slate-700', borderColor: 'border-slate-200', bgColor: 'bg-slate-50' },
};

const SUBJECT_ORDER = ['react', 'leetcode', 'typescript', 'nextjs'];

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

function buildEmptyDay(studyDate: string): StudyDay {
  return { id: null, study_date: studyDate, plan_text: '', studied_text: '', distractions: [], is_study_day: false, pomodoro_count: 0, created_at: null, updated_at: null };
}

function getPomodoroCompletionMessage(mode: PomodoroMode) {
  return mode === 'focus'
    ? 'Bloco de foco concluido. Hora de uma pausa.'
    : 'Pausa concluida. Hora de voltar ao foco.';
}

function slugifySubjectName(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'materia';
}

function getDiverseSubjectSlug(subject: DiverseSubject, index: number, subjects: DiverseSubject[]) {
  const baseSlug = slugifySubjectName(subject.name);
  const previousMatches = subjects
    .slice(0, index)
    .filter((candidate) => slugifySubjectName(candidate.name) === baseSlug).length;
  return previousMatches === 0 ? baseSlug : `${baseSlug}-${previousMatches + 1}`;
}

function getDiverseSubjectLessons(subject: DiverseSubject) {
  return subject.lessons ?? [];
}

function getDiverseSubjectTopics(subject: DiverseSubject) {
  return [...subject.topics, ...getDiverseSubjectLessons(subject).flatMap((lesson) => lesson.topics)];
}

function normalizeDiverseTopicText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getDiverseAvoidTopics(subject: DiverseSubject) {
  return getDiverseSubjectTopics(subject)
    .map((topic) => topic.topic.trim())
    .filter(Boolean);
}

const RATING_WEIGHT: Record<StudyRating, number> = { unknown: 100, partial: 60, knew: 12 };

// Higher score = should be reviewed sooner (spaced repetition priority).
function getTopicReviewPriority(topic: CodingTopic, now = Date.now()): number {
  const rating = topic.last_rating ?? null;
  let score = rating ? RATING_WEIGHT[rating] : 45; // never studied sits between partial and knew
  const reviews = topic.review_count ?? 0;
  score -= Math.min(reviews, 6) * 4; // well-reviewed topics gradually sink
  if (topic.last_reviewed) {
    const ageHours = (now - Date.parse(topic.last_reviewed)) / 3_600_000;
    if (!Number.isNaN(ageHours)) score += Math.min(Math.max(ageHours, 0), 72) * 0.25; // older → higher
  } else {
    score += 8; // never reviewed gets a small nudge up
  }
  return score;
}

function buildStudyOrder(topics: CodingTopic[]): number[] {
  return topics
    .map((topic, index) => ({ index, priority: getTopicReviewPriority(topic) }))
    .sort((a, b) => b.priority - a.priority)
    .map((entry) => entry.index);
}

const RATING_META: Record<StudyRating, { label: string; dot: string; chip: string }> = {
  unknown: { label: 'Não sabia', dot: 'bg-rose-400', chip: 'bg-rose-100 text-rose-700' },
  partial: { label: 'Parcial', dot: 'bg-amber-400', chip: 'bg-amber-100 text-amber-700' },
  knew: { label: 'Sabia', dot: 'bg-emerald-400', chip: 'bg-emerald-100 text-emerald-700' },
};

function filterFreshDiverseTopics(topics: CodingTopic[], existingTopics: string[]) {
  const seen = new Set(existingTopics.map(normalizeDiverseTopicText).filter(Boolean));
  return topics.filter((topic) => {
    const key = normalizeDiverseTopicText(topic.topic);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createLocalLessonId() {
  return `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildLessonTitle(subject: DiverseSubject, topics: CodingTopic[]) {
  const lessonNumber = getDiverseSubjectLessons(subject).length + 1;
  const firstTopic = topics[0]?.topic?.trim();
  return firstTopic ? `Licao ${lessonNumber}: ${firstTopic.slice(0, 42)}` : `Licao ${lessonNumber}`;
}

export default function StudyPage() {
  const authState = useRequireAuth();

  const [activeTab, setActiveTab] = useState<StudyTab>('english');
  const [selectedDate, setSelectedDate] = useState(getLocalDateValue);

  // ── English tab state ───────────────────────────────────────────────────────
  const [dashboard, setDashboard] = useState<StudyDashboard | null>(null);
  const [planText, setPlanText] = useState('');
  const [studiedText, setStudiedText] = useState('');
  const [distractions, setDistractions] = useState<string[]>([]);
  const [newDistraction, setNewDistraction] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [savedMessage, setSavedMessage] = useState('');

  // ── Diverse tab state ───────────────────────────────────────────────────────
  const [diverseDay, setDiverseDay] = useState<DiverseDay | null>(null);
  const [loadingDiverse, setLoadingDiverse] = useState(false);
  const [savingDiverse, setSavingDiverse] = useState(false);
  const [diverseSaved, setDiverseSaved] = useState('');
  const [diverseError, setDiverseError] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [catalog, setCatalog] = useState<CatalogSubject[]>([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiAction, setAiAction] = useState<DiverseAIAction | null>(null);
  const [lastAIAction, setLastAIAction] = useState<DiverseAIAction | null>(null);
  const [aiError, setAiError] = useState('');
  const [selectedDiverseSubjectSlug, setSelectedDiverseSubjectSlug] = useState<string | null>(null);
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [lessonGenMessage, setLessonGenMessage] = useState('');
  const [pendingDiverseSave, setPendingDiverseSave] = useState(false);

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
      setSelectedDiverseSubjectSlug(tab);
    }
  }, []);

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
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar os estudos.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authState.status]);

  // ── Load English day ────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated' || !selectedDate) return;
    let cancelled = false;
    setLoadingDay(true);
    setSavedMessage('');
    api.getStudyDay(selectedDate)
      .then((data) => {
        if (cancelled) return;
        setPlanText(data.plan_text);
        setStudiedText(data.studied_text);
        setDistractions(data.distractions);
      })
      .catch(() => {
        if (!cancelled) { setPlanText(''); setStudiedText(''); setDistractions([]); }
      })
      .finally(() => { if (!cancelled) setLoadingDay(false); });
    return () => { cancelled = true; };
  }, [authState.status, selectedDate]);

  // ── Load Diverse day ────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated' || !selectedDate) return;
    let cancelled = false;
    setLoadingDiverse(true);
    setDiverseSaved('');
    api.getDiverseDay(selectedDate)
      .then((data) => { if (!cancelled) setDiverseDay(data); })
      .catch(() => { if (!cancelled) setDiverseDay(null); })
      .finally(() => { if (!cancelled) setLoadingDiverse(false); });
    return () => { cancelled = true; };
  }, [authState.status, selectedDate]);

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
    if (authState.status !== 'authenticated') return;
    api.getDiverseCatalog().then(setCatalog).catch(() => {});
  }, [authState.status]);

  // ── Load Coding day ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated' || !selectedDate) return;
    let cancelled = false;
    setLoadingCoding(true);
    setCodingSaved('');
    api.getCodingDay(selectedDate)
      .then((data) => { if (!cancelled) setCodingDay(data); })
      .catch(() => { if (!cancelled) setCodingDay(null); })
      .finally(() => { if (!cancelled) setLoadingCoding(false); });
    return () => { cancelled = true; };
  }, [authState.status, selectedDate]);

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
          if (notificationPermission === 'granted') new Notification('English Kids Tutor', { body: msg });
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
    setSaving(true); setSavedMessage(''); setError(null);
    try {
      await api.saveStudyDay(selectedDate, { plan_text: planText, studied_text: studiedText, distractions });
      const refreshed = await api.getStudyDashboard();
      setDashboard(refreshed);
      setSavedMessage(studiedText.trim() ? 'Estudo registrado.' : 'Planejamento salvo.');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel salvar.'));
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
      setCodingError('Nao foi possivel salvar o progresso.');
    } finally { setSavingCoding(false); }
  }

  function addDiverseSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    const subjects = diverseDay?.custom_subjects ?? [];
    if (subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    const catalogEntry = catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const defaultTopics: CodingTopic[] = catalogEntry?.topics?.length
      ? catalogEntry.topics.map((t) => ({
          topic: t.topic,
          done: t.done ?? false,
          answer: t.answer ?? '',
          // carry spaced-repetition history so reviews continue across days
          last_rating: t.last_rating ?? null,
          review_count: t.review_count ?? 0,
          last_reviewed: t.last_reviewed ?? null,
        }))
      : [{ topic: 'Tópico 1', done: false, answer: '' }, { topic: 'Tópico 2', done: false, answer: '' }, { topic: 'Tópico 3', done: false, answer: '' }];
    const newSubject: DiverseSubject = { name, topics: defaultTopics, lessons: [] };
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
  }

  function addDiverseTopicsBulk(subjectIndex: number, newTopics: CodingTopic[]) {
    if (!diverseDay || newTopics.length === 0) return;
    const subjects = diverseDay.custom_subjects.map((s, si) =>
      si === subjectIndex ? { ...s, topics: [...s.topics, ...newTopics] } : s
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

  function rateDiverseLessonTopic(subjectIndex: number, lessonIndex: number, topicIndex: number, rating: StudyRating) {
    setDiverseDay((current) => {
      if (!current) return current;
      const subjects = current.custom_subjects.map((s, si) => {
        if (si !== subjectIndex) return s;
        const lessons = getDiverseSubjectLessons(s).map((lesson, li) =>
          li === lessonIndex
            ? { ...lesson, topics: lesson.topics.map((t, ti) => (ti === topicIndex ? applyTopicRating(t, rating) : t)) }
            : lesson
        );
        return { ...s, lessons };
      });
      return { ...current, custom_subjects: subjects };
    });
  }

  // After a study session finishes, persist ratings so spaced repetition survives reloads.
  function requestDiverseAutoSave() {
    setPendingDiverseSave(true);
  }

  function updateDiverseTopicAnswer(subjectIndex: number, topicIndex: number, value: string) {
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) =>
      si === subjectIndex
        ? { ...s, topics: s.topics.map((t, ti) => ti === topicIndex ? { ...t, answer: value } : t) }
        : s
    );
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function removeDiverseSubject(index: number) {
    if (!diverseDay) return;
    const removedSlug = getDiverseSubjectSlug(diverseDay.custom_subjects[index], index, diverseDay.custom_subjects);
    const subjects = diverseDay.custom_subjects.filter((_, i) => i !== index);
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
    if (selectedDiverseSubjectSlug === removedSlug) selectDiverseOverview();
  }

  function toggleDiverseTopic(subjectIndex: number, topicIndex: number) {
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) =>
      si === subjectIndex
        ? { ...s, topics: s.topics.map((t, ti) => ti === topicIndex ? { ...t, done: !t.done } : t) }
        : s
    );
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function updateDiverseTopicText(subjectIndex: number, topicIndex: number, value: string) {
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
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) => {
      if (si !== subjectIndex) return s;
      const lessons = getDiverseSubjectLessons(s).map((lesson, li) => li === lessonIndex ? updater(lesson) : lesson);
      return { ...s, lessons };
    });
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function updateDiverseLessonTitle(subjectIndex: number, lessonIndex: number, value: string) {
    updateDiverseLessonBlock(subjectIndex, lessonIndex, (lesson) => ({ ...lesson, title: value }));
  }

  function removeDiverseLessonBlock(subjectIndex: number, lessonIndex: number) {
    if (!diverseDay) return;
    const subjects = diverseDay.custom_subjects.map((s, si) => {
      if (si !== subjectIndex) return s;
      const lessons = getDiverseSubjectLessons(s).filter((_, li) => li !== lessonIndex);
      return { ...s, lessons };
    });
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
  }

  function toggleDiverseLessonTopic(subjectIndex: number, lessonIndex: number, topicIndex: number) {
    updateDiverseLessonBlock(subjectIndex, lessonIndex, (lesson) => ({
      ...lesson,
      topics: lesson.topics.map((t, ti) => ti === topicIndex ? { ...t, done: !t.done } : t),
    }));
  }

  function updateDiverseLessonTopicText(subjectIndex: number, lessonIndex: number, topicIndex: number, value: string) {
    updateDiverseLessonBlock(subjectIndex, lessonIndex, (lesson) => ({
      ...lesson,
      topics: lesson.topics.map((t, ti) => ti === topicIndex ? { ...t, topic: value } : t),
    }));
  }

  function updateDiverseLessonTopicAnswer(subjectIndex: number, lessonIndex: number, topicIndex: number, value: string) {
    updateDiverseLessonBlock(subjectIndex, lessonIndex, (lesson) => ({
      ...lesson,
      topics: lesson.topics.map((t, ti) => ti === topicIndex ? { ...t, answer: value } : t),
    }));
  }

  function updateDiverseSubjectName(subjectIndex: number, value: string) {
    if (!diverseDay) return;
    const previousSlug = getDiverseSubjectSlug(diverseDay.custom_subjects[subjectIndex], subjectIndex, diverseDay.custom_subjects);
    const subjects = diverseDay.custom_subjects.map((s, si) => si === subjectIndex ? { ...s, name: value } : s);
    setDiverseDay({ ...diverseDay, custom_subjects: subjects });
    if (selectedDiverseSubjectSlug === previousSlug) {
      selectDiverseSubjectTab(getDiverseSubjectSlug(subjects[subjectIndex], subjectIndex, subjects));
    }
  }

  function flashcardsToTopics(flashcards: { topic: string; answer: string }[]): CodingTopic[] {
    return flashcards.map((f) => ({
      topic: f.topic,
      done: false,
      answer: f.answer,
    }));
  }

  async function generateAIFlashcards(inlineApiKey?: string, suggestSubject = false) {
    const name = newSubjectName.trim();
    if (!name && !suggestSubject) return;
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
      const newSubject: DiverseSubject = { name: result.subject, topics: newTopics, lessons: [] };
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
      const msg = err instanceof ApiError ? err.message : 'Nao foi possivel criar aula com IA.';
      setAiError(msg);
    } finally { setGeneratingAI(false); setAiAction(null); }
  }

  async function generateDiverseTopic(subjectIndex: number, inlineApiKey?: string) {
    const subject = diverseDay?.custom_subjects[subjectIndex];
    if (!subject?.name.trim()) return;
    if (subject.topics.length >= 50) {
      setAiError('Limite de 50 topicos gerais atingido. Crie uma nova licao em bloco para continuar.');
      return;
    }
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
        avoid_topics: avoidTopics,
        ...(inlineApiKey ? { api_key: inlineApiKey } : {}),
      });
      const newTopic = filterFreshDiverseTopics(flashcardsToTopics(result.flashcards), avoidTopics)[0];
      if (!newTopic) {
        setAiError('A IA sugeriu um topico repetido. Tente novamente para avancar para outro assunto.');
        return;
      }
      setDiverseDay((current) => {
        if (!current) return current;
        const subjects = current.custom_subjects.map((s, si) =>
          si === subjectIndex ? { ...s, topics: [...s.topics, newTopic] } : s
        );
        return { ...current, custom_subjects: subjects };
      });
      setDiverseSaved('Topico sugerido pela IA. Salve a materia para guardar.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Nao foi possivel sugerir topico com IA.';
      setAiError(msg);
    } finally { setGeneratingAI(false); setAiAction(null); }
  }

  async function generateDiverseLesson(subjectIndex: number, inlineApiKey?: string) {
    const subject = diverseDay?.custom_subjects[subjectIndex];
    if (!subject?.name.trim()) return;
    if (getDiverseSubjectLessons(subject).length >= 30) {
      setAiError('Limite de 30 blocos de licao atingido para esta materia.');
      return;
    }
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
        avoid_topics: avoidTopics,
        ...(inlineApiKey ? { api_key: inlineApiKey } : {}),
      });
      const topics = filterFreshDiverseTopics(flashcardsToTopics(result.flashcards), avoidTopics);
      if (topics.length === 0) {
        setAiError('A IA gerou apenas topicos repetidos. Tente novamente para criar uma licao nova.');
        return;
      }
      const lesson: DiverseLessonBlock = {
        id: createLocalLessonId(),
        title: buildLessonTitle(subject, topics),
        created_at: new Date().toISOString(),
        topics,
      };
      setDiverseDay((current) => {
        if (!current) return current;
        const subjects = current.custom_subjects.map((s, si) =>
          si === subjectIndex ? { ...s, lessons: [...getDiverseSubjectLessons(s), lesson] } : s
        );
        return { ...current, custom_subjects: subjects };
      });
      setDiverseSaved('Nova licao criada em bloco. Salve a materia para guardar.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Nao foi possivel criar licao com IA.';
      setAiError(msg);
    } finally { setGeneratingAI(false); setAiAction(null); }
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

  async function saveDiverseDay() {
    if (!diverseDay) return;
    setSavingDiverse(true); setDiverseSaved(''); setDiverseError('');
    try {
      const saved = await api.saveDiverseDay(selectedDate, { custom_subjects: diverseDay.custom_subjects });
      setDiverseDay(saved);
      setDiverseSaved('Aprendizado diverso salvo.');
    } catch {
      setDiverseError('Nao foi possivel salvar.');
    } finally { setSavingDiverse(false); }
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

  const diverseSubjectTabs = useMemo(() => {
    const subjects = diverseDay?.custom_subjects ?? [];
    return subjects.map((subject, index) => ({
      subject,
      index,
      slug: getDiverseSubjectSlug(subject, index, subjects),
    }));
  }, [diverseDay]);

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
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
            <ArrowLeft size={18} /> Voltar
          </Link>
          <span className="kid-tag w-fit text-xs">Painel de disciplina</span>
        </div>

        {/* Tab switcher */}
        <div className="mb-6 flex gap-2 overflow-x-auto rounded-[1.4rem] border-2 border-slate-100 bg-white/80 p-1.5">
          <TabButton active={activeTab === 'english'} onClick={() => selectStudyTab('english')} icon={<BookOpen size={17} />} label="Inglês · 3 frases/dia" />
          <TabButton active={activeTab === 'coding'} onClick={() => selectStudyTab('coding')} icon={<Code2 size={17} />} label="Programação · 3 tópicos/matéria" />
          <TabButton active={activeTab === 'diverse' && !selectedDiverseSubjectSlug} onClick={() => selectStudyTab('diverse')} icon={<Layers size={17} />} label="Outras materias" />
          <TabButton active={activeTab === 'dashboard'} onClick={() => selectStudyTab('dashboard')} icon={<BarChart2 size={17} />} label="Dashboard" />
          {diverseSubjectTabs.map((item) => (
            <TabButton
              key={item.slug}
              active={activeTab === 'diverse' && selectedDiverseSubjectSlug === item.slug}
              onClick={() => selectDiverseSubjectTab(item.slug)}
              icon={<Layers size={17} />}
              label={item.subject.name}
            />
          ))}
        </div>

        {/* Date picker (shared) */}
        <div className="mb-6 flex justify-end">
          <label className="flex flex-col gap-1.5 rounded-[1.2rem] border-2 border-slate-100 bg-white/80 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Data</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="min-h-10 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-primary"
            />
          </label>
        </div>

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
            onRemoveSubject={removeDiverseSubject}
            onToggleTopic={toggleDiverseTopic}
            onUpdateTopicText={updateDiverseTopicText}
            onUpdateTopicAnswer={updateDiverseTopicAnswer}
            onUpdateSubjectName={updateDiverseSubjectName}
            onGenerateTopicAI={(si, key) => void generateDiverseTopic(si, key)}
            onGenerateLessonAI={(si, key) => void generateDiverseLesson(si, key)}
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

// ═══════════════════════════════════════════════════════════════════════════════
// TAB BUTTON
// ═══════════════════════════════════════════════════════════════════════════════
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-fit shrink-0 items-center justify-center gap-2 rounded-[1.15rem] px-4 py-2.5 text-sm font-black transition ${
        active ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGLISH TAB
// ═══════════════════════════════════════════════════════════════════════════════
function EnglishTab({
  dashboard, selectedDate,
  planText, setPlanText, studiedText, setStudiedText,
  distractions, newDistraction, setNewDistraction,
  addDistraction, removeDistraction,
  loadingDay, saving, error, savedMessage, onSave,
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
  loadingDay: boolean; saving: boolean;
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
  const phrasesIndicator = hasStudyText ? Math.min(phrasesGoal, phrasesGoal) : 0;

  return (
    <div className="space-y-6">
      {/* Dashboard header */}
      <section className="kid-surface border-primary/30 p-6 md:p-8">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Inglês · meta do dia</p>
          <h1 className="text-3xl font-black text-slate-800 md:text-4xl">3 frases por dia</h1>
          <div className="flex items-center gap-3">
            {Array.from({ length: phrasesGoal }).map((_, i) => (
              <div key={i} className={`h-3 flex-1 rounded-full transition-all ${i < phrasesIndicator ? 'bg-emerald-400' : 'bg-slate-100'}`} />
            ))}
            <span className="text-sm font-black text-slate-500">{hasStudyText ? phrasesGoal : 0}/{phrasesGoal}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={<Flame size={22} />} label="Dias seguidos" value={`${dashboard?.study_streak_count ?? 0}`}
            helper={dashboard?.last_study_date ? `Ultimo: ${formatDateLabel(dashboard.last_study_date)}` : 'Comece hoje'} tone="orange" />
          <MetricCard icon={<CheckCircle2 size={22} />} label="Hoje"
            value={dashboard?.today.is_study_day ? 'Registrado' : 'Aberto'}
            helper={dashboard?.today.is_study_day ? 'Estudo marcado' : 'Salve o que estudou'} tone="green" />
          <MetricCard icon={<ClipboardList size={22} />} label="Distracoes" value={`${todayDistractionCount}`} helper="Registradas hoje" tone="rose" />
          <MetricCard icon={<CalendarDays size={22} />} label="Data aberta" value={formatDateLabel(selectedDate)}
            helper={selectedIsToday ? 'Dashboard de hoje' : 'Registro historico'} tone="sky" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        {/* Main record */}
        <div className="kid-surface border-sky-100 p-5 md:p-7">
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
                placeholder="Ex.: Fiz a licao de greetings, ouvi os audios e revisei flashcards."
                className="mt-2 w-full resize-none rounded-[1.25rem] border-2 border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-700 outline-none transition focus:border-primary" />
            </label>

            <div>
              <span className="text-sm font-black text-slate-700">Distracoes percebidas</span>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input value={newDistraction} onChange={(e) => setNewDistraction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDistraction(); } }}
                  maxLength={80} placeholder="Celular, video, notificacao..."
                  className="min-h-12 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base text-slate-700 outline-none transition focus:border-primary" />
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

            <button type="button" onClick={onSave} disabled={saving || loadingDay}
              className="kid-button w-full bg-primary hover:bg-primary-dark">
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar registro
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <PomodoroWidget
            mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
            todayCount={todayPomodoroCount}
            notificationPermission={notificationPermission} message={pomodoroMessage}
            onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro} onRequestNotifications={onRequestNotifications}
          />

          <div className="kid-surface border-emerald-100 p-5 md:p-6">
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
          <div className="kid-surface border-violet-100 p-5 md:p-6">
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
            <div className="kid-surface border-slate-100 p-5 md:p-6">
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODING TAB
// ═══════════════════════════════════════════════════════════════════════════════
function CodingTab({
  selectedDate, codingDay, loadingCoding, savingCoding,
  codingSaved, codingError, codingDoneCount, codingTotalCount,
  editingSubject, setEditingSubject,
  onToggleTopic, onUpdateTopicText, onSave,
  pomodoroMode, pomodoroSeconds, pomodoroRunning, todayPomodoroCount,
  notificationPermission, pomodoroMessage,
  onTogglePomodoro, onSwitchPomodoro, onRequestNotifications,
}: {
  selectedDate: string;
  codingDay: CodingDay | null;
  loadingCoding: boolean; savingCoding: boolean;
  codingSaved: string; codingError: string;
  codingDoneCount: number; codingTotalCount: number;
  editingSubject: string | null;
  setEditingSubject: (s: string | null) => void;
  onToggleTopic: (subject: string, index: number) => void;
  onUpdateTopicText: (subject: string, index: number, value: string) => void;
  onSave: () => void;
  pomodoroMode: PomodoroMode; pomodoroSeconds: number; pomodoroRunning: boolean; todayPomodoroCount: number;
  notificationPermission: NotificationPermission | 'unsupported'; pomodoroMessage: string;
  onTogglePomodoro: () => void;
  onSwitchPomodoro: (m: PomodoroMode) => void;
  onRequestNotifications: () => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.45fr]">
      <div>
        <CodingCurriculum />
      </div>
      <aside className="space-y-6">
        <PomodoroWidget
          mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
          todayCount={todayPomodoroCount} notificationPermission={notificationPermission}
          message={pomodoroMessage} onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro}
          onRequestNotifications={onRequestNotifications}
        />
      </aside>
    </div>
  );

}


// ═══════════════════════════════════════════════════════════════════════════════
// DIVERSE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DiverseTab({
  selectedDate, diverseDay, catalog, loadingDiverse, savingDiverse,
  diverseSaved, diverseError, newSubjectName, setNewSubjectName,
  onAddSubject, onGenerateAI, generatingAI, aiAction, lastAIAction, aiError,
  selectedSubjectSlug, onSelectSubjectTab, onSelectOverview,
  onRemoveSubject, onToggleTopic, onUpdateTopicText, onUpdateTopicAnswer,
  onUpdateSubjectName, onGenerateTopicAI, onGenerateLessonAI, onBulkAddTopics,
  onRateTopic, onRateLessonTopic, onSessionComplete,
  onRemoveLesson, onToggleLessonTopic, onUpdateLessonTitle, onUpdateLessonTopicText,
  onUpdateLessonTopicAnswer, onSave,
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
  onAddSubject: () => void;
  onGenerateAI: (apiKey?: string) => void;
  generatingAI: boolean;
  aiAction: DiverseAIAction | null;
  lastAIAction: DiverseAIAction | null;
  aiError: string;
  selectedSubjectSlug: string | null;
  onSelectSubjectTab: (slug: string) => void;
  onSelectOverview: () => void;
  onRemoveSubject: (i: number) => void;
  onToggleTopic: (si: number, ti: number) => void;
  onUpdateTopicText: (si: number, ti: number, v: string) => void;
  onUpdateTopicAnswer: (si: number, ti: number, v: string) => void;
  onUpdateSubjectName: (si: number, v: string) => void;
  onGenerateTopicAI: (si: number, apiKey?: string) => void;
  onGenerateLessonAI: (si: number, apiKey?: string) => void;
  onBulkAddTopics: (si: number, topics: CodingTopic[]) => void;
  onRateTopic: (si: number, ti: number, rating: StudyRating) => void;
  onRateLessonTopic: (si: number, li: number, ti: number, rating: StudyRating) => void;
  onSessionComplete: () => void;
  onRemoveLesson: (si: number, li: number) => void;
  onToggleLessonTopic: (si: number, li: number, ti: number) => void;
  onUpdateLessonTitle: (si: number, li: number, v: string) => void;
  onUpdateLessonTopicText: (si: number, li: number, ti: number, v: string) => void;
  onUpdateLessonTopicAnswer: (si: number, li: number, ti: number, v: string) => void;
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
      <section className="kid-surface border-primary/30 p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Outras materias</p>
        <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">Aprenda qualquer assunto</h1>
        <p className="mt-1 text-base text-slate-500">{formatDateLabel(selectedDate)}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetricCard icon={<Layers size={22} />} label="Materias" value={`${subjects.length}`} helper="Criadas para hoje" tone="sky" />
          <MetricCard icon={<CheckCircle2 size={22} />} label="Topicos feitos" value={`${totalDone}/${totalTopics}`} helper="No total hoje" tone="green" />
          <MetricCard icon={<Flame size={22} />} label="Meta" value={totalDone > 0 && totalDone === totalTopics ? 'Completa!' : 'Em progresso'}
            helper={`${totalTopics - totalDone} restantes`} tone={totalDone === totalTopics && totalTopics > 0 ? 'green' : 'orange'} />
        </div>
      </section>

      {subjectTabs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto rounded-[1.4rem] border-2 border-slate-100 bg-white/80 p-1.5">
          <button
            type="button"
            onClick={onSelectOverview}
            className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition ${selectedSubject ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-white'}`}
          >
            Todas
          </button>
          {subjectTabs.map((item) => (
            <button
              key={item.slug}
              type="button"
              data-subject-tab={item.slug}
              onClick={() => onSelectSubjectTab(item.slug)}
              className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition ${selectedSubjectSlug === item.slug ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {item.subject.name}
            </button>
          ))}
        </div>
      )}

      {selectedSubject ? (
        <DiverseSubjectDashboard
          selectedDate={selectedDate}
          subject={selectedSubject.subject}
          onBack={onSelectOverview}
          onRemove={() => onRemoveSubject(selectedSubject.index)}
          onToggleTopic={(ti) => onToggleTopic(selectedSubject.index, ti)}
          onUpdateTopicText={(ti, v) => onUpdateTopicText(selectedSubject.index, ti, v)}
          onUpdateTopicAnswer={(ti, v) => onUpdateTopicAnswer(selectedSubject.index, ti, v)}
          onUpdateSubjectName={(v) => onUpdateSubjectName(selectedSubject.index, v)}
          onGenerateTopicAI={(key) => onGenerateTopicAI(selectedSubject.index, key)}
          onGenerateLessonAI={(key) => onGenerateLessonAI(selectedSubject.index, key)}
          onBulkAddTopics={(topics) => onBulkAddTopics(selectedSubject.index, topics)}
          onRateTopic={(ti, rating) => onRateTopic(selectedSubject.index, ti, rating)}
          onRateLessonTopic={(li, ti, rating) => onRateLessonTopic(selectedSubject.index, li, ti, rating)}
          onSessionComplete={onSessionComplete}
          onRemoveLesson={(li) => onRemoveLesson(selectedSubject.index, li)}
          onToggleLessonTopic={(li, ti) => onToggleLessonTopic(selectedSubject.index, li, ti)}
          onUpdateLessonTitle={(li, v) => onUpdateLessonTitle(selectedSubject.index, li, v)}
          onUpdateLessonTopicText={(li, ti, v) => onUpdateLessonTopicText(selectedSubject.index, li, ti, v)}
          onUpdateLessonTopicAnswer={(li, ti, v) => onUpdateLessonTopicAnswer(selectedSubject.index, li, ti, v)}
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
                  list="catalog-subjects"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddSubject(); } }}
                  maxLength={60}
                  placeholder="Matéria: React, Python, Francês..."
                  className="min-h-12 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base text-slate-700 outline-none transition focus:border-primary"
                />
                <datalist id="catalog-subjects">
                  {catalog.map((c) => <option key={c.name} value={c.name} />)}
                </datalist>
              </>
              <button type="button" onClick={onAddSubject} disabled={!newSubjectName.trim()}
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
          ) : subjects.length === 0 ? (
            <div className="rounded-[1.5rem] border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <Layers className="mx-auto text-slate-300" size={40} />
              <p className="mt-4 text-base font-bold text-slate-400">Nenhuma matéria ainda.</p>
              <p className="mt-1 text-sm text-slate-400">Digite o nome acima e clique em Criar.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
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
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                        tab={item.slug}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-2xl font-black text-slate-800">{total}</p>
                        <p className="text-xs font-bold text-slate-400">Topicos</p>
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

          {diverseError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{diverseError}</p>}
          {diverseSaved && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{diverseSaved}</p>}
          <button type="button" onClick={onSave} disabled={savingDiverse || loadingDiverse}
            className="kid-button w-full bg-primary hover:bg-primary-dark">
            {savingDiverse ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar matérias
          </button>
        </div>

        <aside className="space-y-6">
          <PomodoroWidget
            mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
            todayCount={todayPomodoroCount}
            notificationPermission={notificationPermission} message={pomodoroMessage}
            onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro} onRequestNotifications={onRequestNotifications}
          />
          <div className="kid-surface border-slate-100 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Dica</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>Digite o nome da materia (ex: React, Python, Frances) e clique em <strong>Criar</strong> para adicionar manualmente.</p>
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
function DiverseSubjectDashboard({
  selectedDate, subject, onBack, onRemove, onToggleTopic, onUpdateTopicText,
  onUpdateTopicAnswer, onUpdateSubjectName, onSave, savingDiverse, loadingDiverse,
  diverseSaved, diverseError, pomodoroMode, pomodoroSeconds, pomodoroRunning, todayPomodoroCount,
  notificationPermission, pomodoroMessage, onTogglePomodoro, onSwitchPomodoro,
  onRequestNotifications, onGenerateTopicAI, onGenerateLessonAI, onRemoveLesson,
  onToggleLessonTopic, onUpdateLessonTitle, onUpdateLessonTopicText,
  onUpdateLessonTopicAnswer, generatingAI, aiAction, lastAIAction, aiError, onBulkAddTopics,
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
  onGenerateLessonAI: (apiKey?: string) => void;
  onRemoveLesson: (li: number) => void;
  onToggleLessonTopic: (li: number, ti: number) => void;
  onUpdateLessonTitle: (li: number, value: string) => void;
  onUpdateLessonTopicText: (li: number, ti: number, value: string) => void;
  onUpdateLessonTopicAnswer: (li: number, ti: number, value: string) => void;
  generatingAI: boolean;
  aiAction: DiverseAIAction | null;
  lastAIAction: DiverseAIAction | null;
  aiError: string;
  onBulkAddTopics: (topics: CodingTopic[]) => void;
  onRateTopic: (ti: number, rating: StudyRating) => void;
  onRateLessonTopic: (li: number, ti: number, rating: StudyRating) => void;
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
  const needsKeyConfig = aiError.toLowerCase().includes('chave') || aiError.toLowerCase().includes('configur') || aiError.toLowerCase().includes('api');

  return (
    <div className="space-y-6">
      <section className="kid-surface border-indigo-200 p-6 md:p-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-600 transition hover:bg-slate-200"
        >
          <ArrowLeft size={16} /> Voltar para materias
        </button>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Dashboard da materia</p>
        <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">{subject.name}</h1>
        <p className="mt-1 text-base text-slate-500">{formatDateLabel(selectedDate)}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <MetricCard icon={<Layers size={22} />} label="Topicos" value={`${totalTopics}`} helper="Nesta materia" tone="sky" />
          <MetricCard icon={<BookOpen size={22} />} label="Blocos" value={`${lessons.length}`} helper="Licoes criadas" tone="orange" />
          <MetricCard icon={<CheckCircle2 size={22} />} label="Concluidos" value={`${doneCount}`} helper={`${pendingCount} restantes`} tone="green" />
          <MetricCard icon={<Flame size={22} />} label="Meta" value={completed ? 'Completa!' : 'Em progresso'} helper="Revise ate zerar" tone={completed ? 'green' : 'orange'} />
        </div>
      </section>

      <section className="kid-surface border-violet-100 p-4 md:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onGenerateTopicAI(aiKeyDraft.trim() || undefined)}
            disabled={generatingAI}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-4 text-sm font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiAction === 'topic' ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {aiAction === 'topic' ? 'Escolhendo topico...' : 'Sugerir topico com IA'}
          </button>
          <button
            type="button"
            onClick={() => onGenerateLessonAI(aiKeyDraft.trim() || undefined)}
            disabled={generatingAI}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiAction === 'lesson' ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {aiAction === 'lesson' ? 'Criando licao...' : 'Criar nova licao com IA'}
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
                    type="password"
                    value={aiKeyDraft}
                    onChange={(e) => setAiKeyDraft(e.target.value)}
                    placeholder="AIza..."
                    className="min-h-10 flex-1 rounded-xl border-2 border-rose-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!aiKeyDraft.trim()) return;
                      if (lastAIAction === 'topic') onGenerateTopicAI(aiKeyDraft.trim());
                      else if (lastAIAction === 'lesson') onGenerateLessonAI(aiKeyDraft.trim());
                    }}
                    disabled={!aiKeyDraft.trim() || generatingAI}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Sparkles size={14} /> Tentar
                  </button>
                </div>
              </div>
            )}
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
            onBulkAddTopics={onBulkAddTopics}
            onRateTopic={onRateTopic}
            onSessionComplete={onSessionComplete}
          />

          {lessons.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Licoes em blocos</p>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                  {lessons.length}
                </span>
              </div>
              {lessons.map((lesson, lessonIndex) => (
                <SubjectStudyCard
                  key={lesson.id}
                  defaultCollapsed={true}
                  subject={{ name: lesson.title, topics: lesson.topics, lessons: [] }}
                  onRemove={() => onRemoveLesson(lessonIndex)}
                  onToggleTopic={(ti) => onToggleLessonTopic(lessonIndex, ti)}
                  onUpdateTopicText={(ti, v) => onUpdateLessonTopicText(lessonIndex, ti, v)}
                  onUpdateTopicAnswer={(ti, v) => onUpdateLessonTopicAnswer(lessonIndex, ti, v)}
                  onUpdateSubjectName={(value) => onUpdateLessonTitle(lessonIndex, value)}
                  onRateTopic={(ti, rating) => onRateLessonTopic(lessonIndex, ti, rating)}
                  onSessionComplete={onSessionComplete}
                />
              ))}
            </div>
          )}

          {diverseError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{diverseError}</p>}
          {diverseSaved && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{diverseSaved}</p>}
          <button type="button" onClick={onSave} disabled={savingDiverse || loadingDiverse}
            className="kid-button w-full bg-primary hover:bg-primary-dark">
            {savingDiverse ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar materia
          </button>
        </div>

        <aside className="space-y-6">
          <PomodoroWidget
            mode={pomodoroMode} seconds={pomodoroSeconds} running={pomodoroRunning}
            todayCount={todayPomodoroCount}
            notificationPermission={notificationPermission} message={pomodoroMessage}
            onToggle={onTogglePomodoro} onSwitch={onSwitchPomodoro} onRequestNotifications={onRequestNotifications}
          />
          <div className="kid-surface border-slate-100 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Foco da materia</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>Use Lista para ajustar os topicos e respostas.</p>
              <p>Use Estudar para revisar a materia como flashcards.</p>
              <p>Use a IA para sugerir um topico rapido ou criar uma licao separada em bloco.</p>
              <p>A URL desta aba segue o formato <strong>tab=nomedamateria</strong>.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function parseJsonTopics(raw: string): CodingTopic[] {
  const parsed = JSON.parse(raw);
  const normalize = (item: Record<string, unknown>): CodingTopic | null => {
    const topic = (item.topic ?? item.question ?? item.front ?? item.pergunta ?? '') as string;
    const answer = (item.answer ?? item.back ?? item.resposta ?? '') as string;
    if (!topic.trim()) return null;
    return { topic: topic.trim(), answer: (answer ?? '').trim(), done: false };
  };
  if (Array.isArray(parsed)) return parsed.map(normalize).filter(Boolean) as CodingTopic[];
  const arr = parsed.flashcards ?? parsed.topics ?? parsed.items ?? parsed.cards;
  if (Array.isArray(arr)) return arr.map(normalize).filter(Boolean) as CodingTopic[];
  const single = normalize(parsed as Record<string, unknown>);
  return single ? [single] : [];
}

function SubjectStudyCard({
  subject, onRemove, onToggleTopic, onUpdateTopicText, onUpdateTopicAnswer, onUpdateSubjectName,
  defaultCollapsed, onBulkAddTopics, onRateTopic, onSessionComplete,
}: {
  subject: DiverseSubject;
  onRemove: () => void;
  onToggleTopic: (ti: number) => void;
  onUpdateTopicText: (ti: number, value: string) => void;
  onUpdateTopicAnswer: (ti: number, value: string) => void;
  onUpdateSubjectName: (value: string) => void;
  defaultCollapsed?: boolean;
  onBulkAddTopics?: (topics: CodingTopic[]) => void;
  onRateTopic?: (ti: number, rating: StudyRating) => void;
  onSessionComplete?: () => void;
}) {
  const studyCardRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const [activeTab, setActiveTab] = useState<'topics' | 'study'>('topics');
  const [expandedAnswer, setExpandedAnswer] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<CodingTopic[] | null>(null);
  const [importError, setImportError] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);
  const [studyState, setStudyState] = useState<InlineStudyState>(() => ({
    order: subject.topics.map((_, i) => i), position: 0, userAnswer: '', revealed: false, results: [], done: false,
  }));

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
          value={subject.name}
          onChange={(e) => onUpdateSubjectName(e.target.value)}
          maxLength={60}
          className="flex-1 rounded-xl border-2 border-transparent bg-transparent px-2 py-1 text-lg font-black text-slate-800 outline-none transition focus:border-primary focus:bg-white"
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
      </div>}

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
                        <span className="min-w-0 break-words">{t.topic || `Topico ${ti + 1}`}</span>
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
      ) : (
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
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// POMODORO WIDGET (shared)
// ═══════════════════════════════════════════════════════════════════════════════
function PomodoroWidget({
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
    <div className="kid-surface border-sky-100 p-5 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Timer size={24} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Pomodoro</p>
            <h2 className="text-xl font-black text-slate-800">{mode === 'focus' ? 'Foco' : 'Pausa'}</h2>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">{mode === 'focus' ? '25 min' : '5 min'}</span>
      </div>

      <div className="mt-5 rounded-[1.5rem] border-2 border-slate-100 bg-white p-5 text-center">
        <p className="font-mono text-5xl font-black text-slate-800 md:text-6xl">{formatTimer(seconds)}</p>
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-left">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">Pomodoros hoje</p>
          <p className="mt-1 text-2xl font-black text-emerald-700">
            {todayCount} <span className="text-sm font-bold text-emerald-600">{todayCount === 1 ? 'feito' : 'feitos'}</span>
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onSwitch('focus')}
            className={`rounded-2xl px-3 py-2 text-sm font-black transition ${mode === 'focus' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Foco
          </button>
          <button type="button" onClick={() => onSwitch('break')}
            className={`rounded-2xl px-3 py-2 text-sm font-black transition ${mode === 'break' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Pausa
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onToggle}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-800 px-3 text-sm font-black text-white transition hover:bg-slate-700">
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? 'Pausar' : 'Iniciar'}
          </button>
          <button type="button" onClick={() => onSwitch(mode)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-600 transition hover:border-primary hover:text-primary">
            <RotateCcw size={16} /> Reiniciar
          </button>
        </div>
      </div>

      <button type="button" onClick={onRequestNotifications}
        disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-600 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60">
        <Bell size={16} />
        {notificationPermission === 'granted' ? 'Notificacoes ativas' : notificationPermission === 'unsupported' ? 'Sem suporte' : 'Ativar notificacoes'}
      </button>
      {message && <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700">{message}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ dashboard, pomodoroState }: { dashboard: StudyDashboard | null; pomodoroState: { completedByDate: Record<string, number> } }) {
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
  const totalPomodoros = useMemo(() => allDays.reduce((s, d) => s + d.pomodoroCount, 0), [allDays]);
  const studyDays = useMemo(() => allDays.filter((d) => d.isStudyDay).length, [allDays]);
  const pomodoroToday = allDays[allDays.length - 1]?.pomodoroCount ?? 0;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[1.25rem] border-2 border-amber-100 bg-amber-50 p-4">
          <Flame size={22} className="text-amber-500" />
          <p className="mt-2 text-2xl font-black text-amber-700">{dashboard?.study_streak_count ?? 0}</p>
          <p className="text-xs font-bold text-amber-500">Sequência (dias)</p>
        </div>
        <div className="rounded-[1.25rem] border-2 border-sky-100 bg-sky-50 p-4">
          <Timer size={22} className="text-sky-500" />
          <p className="mt-2 text-2xl font-black text-sky-700">{pomodoroToday}</p>
          <p className="text-xs font-bold text-sky-500">Pomodoros hoje</p>
        </div>
        <div className="rounded-[1.25rem] border-2 border-violet-100 bg-violet-50 p-4">
          <Timer size={22} className="text-violet-500" />
          <p className="mt-2 text-2xl font-black text-violet-700">{totalPomodoros}</p>
          <p className="text-xs font-bold text-violet-500">Pomodoros (30 dias)</p>
        </div>
        <div className="rounded-[1.25rem] border-2 border-emerald-100 bg-emerald-50 p-4">
          <BookOpen size={22} className="text-emerald-500" />
          <p className="mt-2 text-2xl font-black text-emerald-700">{studyDays}</p>
          <p className="text-xs font-bold text-emerald-500">Dias de inglês (30 dias)</p>
        </div>
      </div>

      {/* Pomodoro bar chart */}
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

      {/* Activity dots */}
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
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-emerald-400" /> Inglês estudado</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-sky-300" /> Só pomodoro</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-slate-100 border border-slate-200" /> Sem atividade</span>
        </div>
      </div>

      {/* Recent days table */}
      <div className="rounded-[1.4rem] border-2 border-slate-100 bg-white/90 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Histórico recente</p>
        <div className="space-y-1">
          {allDays.slice(-14).reverse().map((day) => (
            <div key={day.date} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
              <span className="w-32 shrink-0 text-sm font-bold text-slate-700">{formatDateLabel(day.date)}</span>
              <span className={`flex-1 text-xs font-semibold ${day.isStudyDay ? 'text-emerald-600' : 'text-slate-300'}`}>
                {day.isStudyDay ? 'Inglês' : '—'}
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

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD
// ═══════════════════════════════════════════════════════════════════════════════
function MetricCard({ icon, label, value, helper, tone }: {
  icon: ReactNode; label: string; value: string; helper: string;
  tone: 'orange' | 'green' | 'rose' | 'sky';
}) {
  const toneStyles = { orange: 'bg-orange-100 text-orange-700', green: 'bg-emerald-100 text-emerald-700', rose: 'bg-rose-100 text-rose-700', sky: 'bg-sky-100 text-sky-700' }[tone];
  return (
    <div className="min-h-32 rounded-[1.25rem] border-2 border-white/80 bg-white/85 p-4 shadow-[0_12px_32px_rgba(14,165,233,0.08)]">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${toneStyles}`}>{icon}</div>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-2xl font-black text-slate-800">{value}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">{helper}</p>
    </div>
  );
}
