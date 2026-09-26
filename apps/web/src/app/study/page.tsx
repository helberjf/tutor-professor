'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BarChart2, BookOpen, CalendarDays, ChevronRight, Layers, Loader2, Plus } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type StudyDashboard, type StudyDiscipline } from '@/lib/api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useModules } from '@/hooks/use-modules';
import { useStudyLanguage } from '@/hooks/use-study-language';
import {
  createInitialPomodoroState,
  getTodaysPomodoroCount,
  parseStoredPomodoroState,
  pausePomodoro,
  POMODORO_STORAGE_KEY,
  resetPomodoro,
  resolvePomodoroState,
  startPomodoro,
  type PomodoroMode,
} from '@/lib/pomodoro';

import { getLocalDateValue, getPomodoroCompletionMessage } from './_lib/study-helpers';
import { EnglishTab } from './_components/EnglishTab';
import { CreateDisciplineModal } from './_components/CreateDisciplineModal';
import { OtherSubjectsPicker, type DisciplineSelection } from './_components/OtherSubjectsPicker';
import { DashboardTab, TabButton } from './_components/shared';
import type { CodingMode, StudyTab } from './_lib/study-helpers';
import { t as translate, tf } from '@/lib/i18n';
import { studyLanguageInSentence, studyLanguageNativeName } from '@/lib/study-language';

// Uma aba de cada vez aparece, mas as três vinham no mesmo pacote: abrir
// "Estudos" baixava o currículo inteiro — flashcards, treinador de exercícios,
// realce de sintaxe — para quem só queria a aba de inglês, que é a que abre por
// padrão. O currículo passa a chegar quando for escolhido.
//
// Sem SSR de propósito: nada aqui é desenhado antes de o login responder, então
// pré-renderizar as abas no servidor não adiantaria nada e só devolveria o peso
// ao pacote inicial.
const tabFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="animate-spin text-primary" size={28} />
  </div>
);

// Every discipline — Programação, Francês, Direito — is the same study screen:
// subjects, reading, flashcards, questions and simulado.
const CodingTab = dynamic(() => import('./_components/CodingTab').then((m) => m.CodingTab), {
  ssr: false,
  loading: tabFallback,
});

export default function StudyPage() {
  const authState = useRequireAuth();
  // The language tab follows the language chosen at signup, not always English.
  const studyLanguage = useStudyLanguage();

  const [activeTab, setActiveTab] = useState<StudyTab>('english');
  const [codingMode, setCodingMode] = useState<CodingMode>('reading');
  // What the curriculum should open: a deep link, or a choice in the discipline
  // picker. It names one tab and discipline, so a subject id never opens under
  // another list; a new nonce remounts the curriculum to honour a new request.
  const [curriculumRequest, setCurriculumRequest] = useState<{
    tab: StudyTab | null;
    disciplineId: number | null;
    subjectId: number | null;
    topicId: number | null;
    nonce: number;
  }>({ tab: null, disciplineId: null, subjectId: null, topicId: null, nonce: 0 });
  // The other disciplines (null while loading) and the "Criar nova disciplina" form.
  const [disciplines, setDisciplines] = useState<StudyDiscipline[] | null>(null);
  const [disciplinesNonce, setDisciplinesNonce] = useState(0);
  const [showCreateDiscipline, setShowCreateDiscipline] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getLocalDateValue);
  const requestedStudyDateRef = useRef<string | null>(null);

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

  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [lessonGenMessage, setLessonGenMessage] = useState('');

  // ── Pomodoro state (shared) ─────────────────────────────────────────────────
  const [pomodoroState, setPomodoroState] = useState(createInitialPomodoroState);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [pomodoroMessage, setPomodoroMessage] = useState('');
  const todayPomodoroCount = getTodaysPomodoroCount(pomodoroState);
  // Baseline for detecting new pomodoro completions to sync to backend
  const pomodoroSyncBaseRef = useRef<Record<string, number> | null>(null);
  const { modules, loading: loadingModules } = useModules();
  const codingEnabled = modules.coding === true;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const requestedMode = params.get('mode');
    const requestedDate = params.get('date');
    const requestedDisciplineId = Number(params.get('discipline_id'));
    const requestedSubjectId = Number(params.get('subject_id'));
    const requestedTopicId = Number(params.get('topic_id'));
    if (requestedMode === 'reading' || requestedMode === 'flashcards' || requestedMode === 'questions') {
      setCodingMode(requestedMode);
    }
    // Any tab other than the fixed ones is an old link to a subject of
    // "Outras matérias", which now lives in that tab's list.
    const resolvedTab: StudyTab | null =
      tab === 'english' || tab === 'coding' || tab === 'diverse' || tab === 'dashboard'
        ? tab
        : tab
          ? 'diverse'
          : null;
    setCurriculumRequest({
      tab: resolvedTab,
      disciplineId: Number.isInteger(requestedDisciplineId) && requestedDisciplineId > 0 ? requestedDisciplineId : null,
      subjectId: Number.isInteger(requestedSubjectId) && requestedSubjectId > 0 ? requestedSubjectId : null,
      topicId: Number.isInteger(requestedTopicId) && requestedTopicId > 0 ? requestedTopicId : null,
      nonce: 0,
    });
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      requestedStudyDateRef.current = requestedDate;
      setSelectedDate(requestedDate);
    }
    if (resolvedTab) setActiveTab(resolvedTab);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || authState.status !== 'authenticated' || loading || activeTab !== 'english') {
      return;
    }
    const targetId = window.location.hash.slice(1);
    if (targetId !== 'english-questions' && targetId !== 'english-grammar') {
      return;
    }
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(scrollTimer);
  }, [activeTab, authState.status, loading]);

  // A saved link to ?tab=coding still opens the tab for an account that has the
  // module on; this only steps in once the answer says it is off.
  useEffect(() => {
    if (loadingModules || codingEnabled || activeTab !== 'coding') return;
    setActiveTab('diverse');
    setStudyUrlTab('diverse');
  }, [loadingModules, codingEnabled, activeTab]);

  function setStudyUrlTab(slug: string | null, disciplineId: number | null = null) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!slug || slug === 'english') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', slug);
    }
    // A picked discipline survives a reload; an old subject, topic or mode would not.
    for (const key of ['subject_id', 'topic_id', 'lesson_id']) url.searchParams.delete(key);
    if (disciplineId) url.searchParams.set('discipline_id', String(disciplineId));
    else url.searchParams.delete('discipline_id');
    window.history.replaceState(null, '', url.toString());
  }

  function requestCurriculum(tab: 'diverse' | 'coding', disciplineId: number | null) {
    setActiveTab(tab);
    setCurriculumRequest((current) => ({
      tab,
      disciplineId,
      subjectId: null,
      topicId: null,
      nonce: current.nonce + 1,
    }));
    setStudyUrlTab(tab, disciplineId);
  }

  function selectDiscipline(value: DisciplineSelection) {
    if (value === 'coding') {
      if (codingEnabled) requestCurriculum('coding', null);
      return;
    }
    if (value) requestCurriculum('diverse', Number(value.slice('discipline:'.length)));
  }

  async function deleteDiscipline(discipline: StudyDiscipline) {
    const warning = translate("Excluir a disciplina e todas as matérias, tópicos e flashcards dela?");
    if (!window.confirm(`${discipline.name}: ${warning}`)) return;
    try {
      await api.deleteStudyDiscipline(discipline.id);
      setDisciplines((current) => (current ?? []).filter((item) => item.id !== discipline.id));
      requestCurriculum('diverse', null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : translate("Não foi possível excluir a disciplina."));
    }
  }

  function selectStudyTab(tab: StudyTab) {
    // A deep link to ?tab=coding from before the module was switched off would
    // otherwise open a tab whose every request answers 403.
    if (tab === 'coding' && !codingEnabled) {
      selectDiverseOverview();
      return;
    }
    setActiveTab(tab);
    setStudyUrlTab(tab === 'english' ? null : tab);
  }

  function selectDiverseOverview() {
    requestCurriculum('diverse', curriculumRequest.disciplineId);
  }

  // ── Load the disciplines for the picker ─────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    if (activeTab !== 'diverse' && activeTab !== 'coding') return;
    let cancelled = false;
    api.getStudyDisciplines()
      .then((items) => { if (!cancelled) setDisciplines(items); })
      .catch(() => { if (!cancelled) setDisciplines((current) => current ?? []); });
    return () => { cancelled = true; };
  }, [authState.status, activeTab, disciplinesNonce]);

  // The discipline on screen: the one asked for, else the first one there is.
  const activeDiscipline =
    disciplines?.find((discipline) => discipline.id === curriculumRequest.disciplineId)
    ?? disciplines?.[0]
    ?? null;

  // ── Load dashboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let cancelled = false;
    setLoading(true);
    api.getStudyDashboard()
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setSelectedDate(requestedStudyDateRef.current || data.today.study_date);
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
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err : new ApiError(translate("Não foi possível carregar os estudos."))); })
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
      setPomodoroMessage(translate("Este navegador não suporta notificacoes."));
      return;
    }
    const p = await Notification.requestPermission();
    setNotificationPermission(p);
    setPomodoroMessage(p === 'granted' ? translate("Notificacoes ativadas.") : translate("Notificacoes não foram ativadas."));
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
      setSavedMessage(studiedText.trim() ? translate("Estudo registrado.") : translate("Planejamento salvo."));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(translate("Não foi possível salvar.")));
    } finally { setSaving(false); }
  }

  async function generateNewLesson() {
    setGeneratingLesson(true); setLessonGenMessage('');
    try {
      await api.generateMorePhrases({ quantity: 1 });
      setLessonGenMessage(translate("Nova lição criada com sucesso!"));
    } catch (err) {
      setLessonGenMessage(err instanceof ApiError ? err.message : translate("Não foi possível criar a lição."));
    } finally { setGeneratingLesson(false); }
  }

  // ── Auth guards ─────────────────────────────────────────────────────────────
  if (authState.status === 'loading' || authState.status === 'unauthenticated') {
    return <StatusCard tone="loading" title={translate("Verificando acesso")} message={translate("Confirmando seu cadastro...")} secondaryHref="/" secondaryLabel={translate("Voltar ao início")} />;
  }
  if (authState.status === 'server_missing') {
    return (
      <StatusCard tone="offline" title={translate("Servidor não disponível")} message={translate("O sistema está temporariamente indisponível. Tente novamente em instantes.")}
        primaryAction={<Link href="/offline" className="app-button bg-primary-dark hover:bg-primary-dark">{translate("Ver status")}</Link>}
        secondaryHref="/" secondaryLabel={translate("Voltar ao início")} />
    );
  }
  if (loading && (activeTab === 'english' || activeTab === 'dashboard')) {
    return <StatusCard tone="loading" title={translate("Abrindo caderno de estudos")} message={translate("Buscando planejamento e histórico...")} secondaryHref="/" secondaryLabel={translate("Voltar ao início")} />;
  }
  if (error?.isUnconfigured || error?.isOffline) {
    return (
      <StatusCard tone="offline" title={translate("Não consegui conectar")} message={error.message}
        primaryAction={<Link href="/offline" className="app-button bg-primary-dark hover:bg-primary-dark">{translate("Ver status")}</Link>}
        secondaryHref="/" secondaryLabel={translate("Voltar ao início")} />
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className={`mx-auto ${activeTab === 'coding' || activeTab === 'diverse' ? 'max-w-7xl' : 'max-w-5xl'}`}>

        {/* Top bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
            <ArrowLeft size={18} /> {translate("Voltar")}
          </Link>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <span className="app-tag w-fit text-xs">{translate("Painel de disciplina")}</span>
            <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
              <CalendarDays size={14} />
              <span className="sr-only">{translate("Data")}</span>
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
          <TabButton active={activeTab === 'dashboard'} onClick={() => selectStudyTab('dashboard')} icon={<BarChart2 size={17} />} label={translate("Dashboard")} />
          <TabButton active={activeTab === 'english'} onClick={() => selectStudyTab('english')} icon={<BookOpen size={17} />} label={studyLanguageNativeName(studyLanguage)} />
          <TabButton
            active={activeTab === 'diverse' || activeTab === 'coding'}
            onClick={selectDiverseOverview}
            icon={<Layers size={17} />}
            label={translate("Outras Disciplinas")}
            mobileLabel={translate("Disciplinas")}
          />
        </div>

        {(activeTab === 'diverse' || activeTab === 'coding') && (
          <OtherSubjectsPicker
            disciplines={disciplines ?? []}
            selectedValue={
              activeTab === 'coding' ? 'coding' : activeDiscipline ? `discipline:${activeDiscipline.id}` : ''
            }
            codingEnabled={codingEnabled}
            onSelect={selectDiscipline}
            onCreateDiscipline={() => setShowCreateDiscipline(true)}
            onDeleteDiscipline={
              activeTab === 'diverse' && activeDiscipline ? () => void deleteDiscipline(activeDiscipline) : undefined
            }
          />
        )}
        {showCreateDiscipline && (
          <CreateDisciplineModal
            onClose={() => setShowCreateDiscipline(false)}
            onCreated={(discipline) => {
              setShowCreateDiscipline(false);
              setDisciplines((current) =>
                [...(current ?? []), discipline].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
              );
              setDisciplinesNonce((n) => n + 1);
              requestCurriculum('diverse', discipline.id);
            }}
          />
        )}

        {activeTab === 'english' && (
          <Link
            href="/lesson"
            className="mb-6 flex w-full items-center gap-4 rounded-[1.5rem] border-2 border-primary/20 bg-white/90 p-5 text-left shadow-[0_10px_28px_rgba(14,165,233,0.12)] transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_14px_34px_rgba(14,165,233,0.18)]"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-dark text-white">
              <BookOpen size={26} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-black text-slate-800">{tf("Começar lição de {language}", { language: studyLanguageInSentence(studyLanguage) })}</span>
              <span className="mt-1 block text-sm font-semibold text-slate-500">{translate("Abrir página de lições")}</span>
            </span>
            <ChevronRight size={24} className="shrink-0 text-primary" />
          </Link>
        )}
        {activeTab === 'english' ? (
          <EnglishTab
            studyLanguage={studyLanguage}
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
        ) : activeTab === 'diverse' && disciplines === null ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : activeTab === 'diverse' && !activeDiscipline ? (
          <section className="app-surface p-8 text-center">
            <Layers size={32} className="mx-auto text-primary" />
            <h2 className="mt-3 text-xl font-black text-slate-800">{translate("Crie sua primeira disciplina")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-slate-500">
              {translate("Uma disciplina, como Francês ou Direito, reúne matérias; cada matéria vira um curso com aulas, flashcards, questões e simulado.")}
            </p>
            <button
              type="button"
              onClick={() => setShowCreateDiscipline(true)}
              className="mx-auto mt-5 flex min-h-12 items-center gap-2 rounded-2xl bg-primary-dark px-6 font-black text-white hover:bg-primary"
            >
              {translate("Criar nova disciplina")} <Plus size={18} />
            </button>
          </section>
        ) : activeTab === 'diverse' || activeTab === 'coding' ? (
          <CodingTab
            key={`${activeTab}:${activeTab === 'diverse' ? activeDiscipline?.id : 'coding'}:${curriculumRequest.nonce}`}
            track={activeTab === 'coding' ? 'programming' : 'general'}
            discipline={activeTab === 'diverse' ? activeDiscipline : null}
            codingMode={codingMode}
            setCodingMode={setCodingMode}
            initialSubjectId={
              curriculumRequest.tab === activeTab
              && (activeTab === 'coding' || curriculumRequest.disciplineId === activeDiscipline?.id)
                ? curriculumRequest.subjectId
                : null
            }
            initialTopicId={curriculumRequest.tab === activeTab ? curriculumRequest.topicId : null}
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
        ) : null}
      </div>

    </main>
  );
}

