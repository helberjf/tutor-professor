'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, CheckCircle2, ChevronLeft, ChevronRight, FileText, Flame, Layers, ListOrdered, Loader2, Plus, Sparkles, Star, Trash2, Trophy } from 'lucide-react';
import { api, type AICredits, type CodingReviewCard, type CodingSubjectSort, type CodingSubjectSummary, type ProgrammingSubject, type ProgrammingSubjectPage, type ProgrammingTopic } from '@/lib/api';
import { rememberStudyLocation } from '@/lib/study-resume';
import { CreateSubjectModal } from './CreateSubjectModal';
import { CreateTopicModal } from './CreateTopicModal';
import { SummarySheetModal } from './SummarySheetModal';
import { t as translate } from '@/lib/i18n';
import { useCurriculumApi, useCurriculumDisciplineName, useCurriculumTrack } from './curriculum-context';

// Estas quatro trocam a tela inteira pela lista de matérias, uma de cada vez, e
// são as maiores do módulo — a leitura de um tópico sozinha carrega o realce de
// sintaxe e o modal de questões. Vinham todas juntas só para mostrar a lista.
const viewFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader2 className="animate-spin text-primary" size={28} />
  </div>
);

const TopicView = dynamic(() => import('./TopicView').then((m) => m.TopicView), {
  ssr: false,
  loading: viewFallback,
});
const ReviewSession = dynamic(() => import('./ReviewSession').then((m) => m.ReviewSession), {
  ssr: false,
  loading: viewFallback,
});
const LeetCodeTrainer = dynamic(() => import('./LeetCodeTrainer').then((m) => m.LeetCodeTrainer), {
  ssr: false,
  loading: viewFallback,
});
const FlashcardDeck = dynamic(() => import('./FlashcardDeck').then((m) => m.FlashcardDeck), {
  ssr: false,
  loading: viewFallback,
});

type View =
  | { type: 'subjects' }
  | { type: 'topics'; subject: ProgrammingSubject }
  | { type: 'topic'; subject: ProgrammingSubject; topic: ProgrammingTopic }
  | { type: 'questionsTopic'; subject: ProgrammingSubject; topic: ProgrammingTopic; returnToQuestions?: boolean }
  | { type: 'review'; subject: ProgrammingSubject; cards: CodingReviewCard[] }
  | { type: 'deck'; subject: ProgrammingSubject; returnToTopics?: boolean }
  | { type: 'leetcode' };

type CodingFocusMode = 'reading' | 'flashcards' | 'questions';

const SUBJECTS_PER_PAGE = 10;
const EMPTY_SUBJECT_PAGE: ProgrammingSubjectPage = {
  items: [],
  page: 1,
  page_size: SUBJECTS_PER_PAGE,
  total: 0,
  total_pages: 1,
  topic_count: 0,
  studied_count: 0,
  due_review_count: 0,
};


interface CodingCurriculumProps {
  focusMode?: CodingFocusMode;
  initialSubjectId?: number | null;
  initialTopicId?: number | null;
}

const COURSE_LESSON_COUNTS = [5, 8, 10, 12];

export function CodingCurriculum({
  focusMode = 'reading',
  initialSubjectId = null,
  initialTopicId = null,
}: CodingCurriculumProps) {
  const curriculum = useCurriculumApi();
  // "Outras matérias" use these same screens; only the LeetCode trainer and a
  // few words are programming's own.
  const general = useCurriculumTrack() === 'general';
  const disciplineName = useCurriculumDisciplineName();
  const [view, setView] = useState<View>({ type: 'subjects' });
  const [subjects, setSubjects] = useState<ProgrammingSubject[]>([]);
  const [subjectPage, setSubjectPage] = useState<ProgrammingSubjectPage>(EMPTY_SUBJECT_PAGE);
  const [subjectSort, setSubjectSort] = useState<CodingSubjectSort>('last_used');
  const [topics, setTopics] = useState<ProgrammingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [showCreateSubject, setShowCreateSubject] = useState<false | 'blank' | 'suggest'>(false);
  // "Montar curso com IA": the next lessons of the subject in study order.
  const [showCourseOutline, setShowCourseOutline] = useState(false);
  const [courseLessonCount, setCourseLessonCount] = useState(8);
  const [courseContext, setCourseContext] = useState('');
  const [generatingCourse, setGeneratingCourse] = useState(false);
  const [courseError, setCourseError] = useState('');
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [generatingTopicAI, setGeneratingTopicAI] = useState(false);
  const [topicAIError, setTopicAIError] = useState('');
  const [newTopicId, setNewTopicId] = useState<number | null>(null);
  const [error, setError] = useState('');
  // The subject sheet is the join of the topic sheets. Each topic is summarised
  // once and stored, so adding a topic later costs one call for that topic
  // instead of rewriting the whole subject.
  const [summary, setSummary] = useState<CodingSubjectSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [aiCredits, setAiCredits] = useState<AICredits | null>(null);
  const [updatingRelevanceId, setUpdatingRelevanceId] = useState<number | null>(null);
  const initialRestoreDoneRef = useRef(false);
  const subjectLoadRequestRef = useRef(0);

  async function openSubjectSummary(subject: ProgrammingSubject, regenerate = false) {
    setLoadingSummary(true);
    setSummaryError('');
    try {
      let sheet = await curriculum.getSubjectSummary(subject.id);
      if (sheet.topic_count === 0) {
        setSummaryError(translate("Esta matéria ainda não tem aulas geradas para resumir."));
        return;
      }
      // Show what is already written while the missing topics are filled in.
      setSummary(sheet);
      const missing = regenerate
        ? topics.filter((topic) => topic.ai_content).map((topic) => ({ topic_id: topic.id, title: topic.title }))
        : sheet.pending;
      let failed = '';
      for (const [index, pendingTopic] of missing.entries()) {
        setSummaryProgress(`Resumindo ${index + 1} de ${missing.length}: ${pendingTopic.title}`);
        try {
          await curriculum.generateTopicSummary(pendingTopic.topic_id, regenerate);
        } catch (err) {
          failed = err instanceof Error ? err.message : translate("Não foi possível resumir um dos tópicos.");
        }
      }
      if (missing.length > 0) {
        sheet = await curriculum.getSubjectSummary(subject.id);
        setSummary(sheet);
        setAiCredits(await api.getMyAICredits());
        loadTopics(subject);
      }
      if (failed) setSummaryError(failed);
    } catch (err) {
      // Keep any sheet already on screen: a failed run should not throw away
      // the summary the reader is looking at.
      setSummaryError(err instanceof Error ? err.message : translate("Não foi possível gerar o resumo."));
    } finally {
      setSummaryProgress('');
      setLoadingSummary(false);
    }
  }

  useEffect(() => {
    void loadSubjects(1, 'last_used', Boolean(initialSubjectId));
  // A deep-link id can arrive after mount while the URL state is restored.
  // Once consumed, ordinary refreshes must not reopen it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubjectId]);

  useEffect(() => {
    if (loading || loadingTopics) return;
    if (view.type === 'topic') {
      rememberStudyLocation({
        kind: 'coding_topic',
        subject_id: view.subject.id,
        topic_id: view.topic.id,
        mode: 'reading',
      });
    } else if (view.type === 'questionsTopic') {
      rememberStudyLocation({
        kind: 'coding_questions',
        subject_id: view.subject.id,
        topic_id: view.topic.id,
        mode: 'questions',
      });
    } else if (view.type === 'deck') {
      rememberStudyLocation({
        kind: 'coding_flashcards',
        subject_id: view.subject.id,
        mode: 'flashcards',
      });
    }
  }, [focusMode, loading, loadingTopics, view]);

  useEffect(() => {
    setError('');
    setView((current) => {
      if (focusMode === 'flashcards') {
        if (current.type === 'topics' || current.type === 'topic' || current.type === 'questionsTopic') {
          return { type: 'deck', subject: current.subject, returnToTopics: true };
        }
        return current;
      }

      if (focusMode === 'questions') {
        if (current.type === 'topic') {
          return { type: 'questionsTopic', subject: current.subject, topic: current.topic, returnToQuestions: true };
        }
        if (current.type === 'deck' && current.returnToTopics) {
          void loadTopics(current.subject);
          return current;
        }
        return current;
      }

      if (focusMode === 'reading' && current.type === 'questionsTopic') {
        return { type: 'topic', subject: current.subject, topic: current.topic };
      }

      if (focusMode === 'reading' && current.type === 'deck') {
        if (current.returnToTopics) {
          void loadTopics(current.subject);
          return current;
        }
        setTopics([]);
        return { type: 'subjects' };
      }

      return current;
    });
  // Mode changes deliberately operate on the current view; loadTopics is not a trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode]);

  async function loadSubjects(
    requestedPage = subjectPage.page,
    requestedSort = subjectSort,
    restoreDeepLink = false,
  ) {
    const requestId = subjectLoadRequestRef.current + 1;
    subjectLoadRequestRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const shouldRestore = restoreDeepLink && !initialRestoreDoneRef.current;
      const fetchedSubject = shouldRestore && initialSubjectId
        ? await curriculum.getCodingSubject(initialSubjectId).catch(() => null)
        : null;
      if (subjectLoadRequestRef.current !== requestId) return;
      if (fetchedSubject) {
        initialRestoreDoneRef.current = true;
        if (focusMode === 'flashcards') {
          void curriculum.markCodingSubjectUsed(fetchedSubject.id).catch(() => undefined);
          setView({ type: 'deck', subject: fetchedSubject });
        } else {
          void loadTopics(fetchedSubject, initialTopicId);
        }
        return;
      }

      const loadedPage = await curriculum.getCodingSubjectPage(requestedPage, requestedSort);
      if (subjectLoadRequestRef.current !== requestId) return;
      setSubjects(loadedPage.items);
      setSubjectPage(loadedPage);
      if (shouldRestore) {
        initialRestoreDoneRef.current = true;
        const requestedSubject = loadedPage.items.find((subject) => subject.id === initialSubjectId);
        if (requestedSubject) {
          if (focusMode === 'flashcards') {
            void curriculum.markCodingSubjectUsed(requestedSubject.id).catch(() => undefined);
            setView({ type: 'deck', subject: requestedSubject });
          } else {
            void loadTopics(requestedSubject, initialTopicId);
          }
        }
      }
    } catch {
      if (subjectLoadRequestRef.current !== requestId) return;
      setError(translate("Erro ao carregar matérias."));
    } finally {
      if (subjectLoadRequestRef.current === requestId) setLoading(false);
    }
  }

  async function loadTopics(subject: ProgrammingSubject, requestedTopicId: number | null = null) {
    setLoadingTopics(true);
    setError('');
    rememberStudyLocation({
      kind: 'coding_subject',
      subject_id: subject.id,
      mode: focusMode,
    });
    void curriculum.markCodingSubjectUsed(subject.id).catch(() => undefined);
    // Navega imediatamente para a matéria; os tópicos carregam na própria tela.
    setTopics([]);
    setView({ type: 'topics', subject });
    void api.getMyAICredits().then(setAiCredits).catch(() => undefined);
    try {
      const loadedTopics = await curriculum.getCodingTopics(subject.id);
      setTopics(loadedTopics);
      const requestedTopic = loadedTopics.find((topic) => topic.id === requestedTopicId);
      if (requestedTopic) {
        setView(
          focusMode === 'questions'
            ? { type: 'questionsTopic', subject, topic: requestedTopic, returnToQuestions: true }
            : { type: 'topic', subject, topic: requestedTopic },
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : translate("Erro ao carregar os tópicos desta matéria."));
    } finally {
      setLoadingTopics(false);
    }
  }

  async function handleStartReview(subject: ProgrammingSubject) {
    setLoadingReview(true);
    try {
      const session = await curriculum.getCodingReview(subject.id);
      if (session.total_due === 0) {
        alert(translate("Nenhum flashcard para revisar agora. Continue estudando e volte mais tarde!"));
        return;
      }
      void curriculum.markCodingSubjectUsed(subject.id).catch(() => undefined);
      setView({ type: 'review', subject, cards: session.items });
    } finally {
      setLoadingReview(false);
    }
  }

  async function handleDeleteSubject(id: number) {
    if (!confirm(translate("Remover esta matéria e todos os seus tópicos e flashcards?"))) return;
    try {
      await curriculum.deleteCodingSubject(id);
      const nextPage = subjects.length === 1 && subjectPage.page > 1
        ? subjectPage.page - 1
        : subjectPage.page;
      await loadSubjects(nextPage, subjectSort);
      if (view.type !== 'subjects') setView({ type: 'subjects' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : translate("Não foi possível remover a matéria. Tente novamente."));
      await loadSubjects();
    }
  }

  async function handleRelevanceChange(subject: ProgrammingSubject, relevance: number) {
    if (relevance === subject.relevance || updatingRelevanceId === subject.id) return;
    const previousRelevance = subject.relevance;
    setUpdatingRelevanceId(subject.id);
    setSubjects((current) => current.map((item) => (
      item.id === subject.id ? { ...item, relevance } : item
    )));
    try {
      const updated = await curriculum.updateCodingSubject(subject.id, { relevance });
      setSubjects((current) => current.map((item) => (
        item.id === subject.id ? updated : item
      )));
      if (subjectSort === 'relevance') {
        await loadSubjects(subjectPage.page, subjectSort);
      }
    } catch (err: unknown) {
      setSubjects((current) => current.map((item) => (
        item.id === subject.id ? { ...item, relevance: previousRelevance } : item
      )));
      setError(err instanceof Error ? err.message : translate("Não foi possível atualizar a relevância."));
    } finally {
      setUpdatingRelevanceId(null);
    }
  }

  function handleSubjectSortChange(nextSort: CodingSubjectSort) {
    setSubjectSort(nextSort);
    void loadSubjects(1, nextSort);
  }

  function handleSubjectPageChange(nextPage: number) {
    if (loading || nextPage < 1 || nextPage > subjectPage.total_pages) return;
    void loadSubjects(nextPage, subjectSort);
  }

  async function handleDeleteTopic(id: number, subject: ProgrammingSubject) {
    if (!confirm(translate("Remover este tópico e seus flashcards?"))) return;
    await curriculum.deleteCodingTopic(id);
    setTopics((prev) => prev.filter((t) => t.id !== id));
    await loadSubjects();
    if (view.type === 'topic') setView({ type: 'topics', subject });
  }

  async function handleGenerateTopicAI(subject: ProgrammingSubject) {
    setGeneratingTopicAI(true);
    setTopicAIError('');
    setNewTopicId(null);
    try {
      const topic = await curriculum.generateCodingTopic(subject.id);
      // Topico novo entra minimizado no fim da lista (nao abre sozinho)
      setTopics((prev) => [...prev, topic]);
      setNewTopicId(topic.id);
      await loadSubjects();
    } catch (err: unknown) {
      setTopicAIError(err instanceof Error ? err.message : translate("Erro ao gerar tópico com IA."));
    } finally {
      setGeneratingTopicAI(false);
    }
  }

  async function handleGenerateCourse(subject: ProgrammingSubject) {
    setGeneratingCourse(true);
    setCourseError('');
    setNewTopicId(null);
    try {
      const created = await curriculum.generateCourseOutline(subject.id, {
        count: courseLessonCount,
        context: courseContext,
      });
      setTopics((prev) => [...prev, ...created]);
      setNewTopicId(created[0]?.id ?? null);
      setShowCourseOutline(false);
      setCourseContext('');
      await loadSubjects();
    } catch (err: unknown) {
      setCourseError(err instanceof Error ? err.message : translate("Não foi possível montar o curso com IA."));
    } finally {
      setGeneratingCourse(false);
    }
  }

  // ── Subjects view ────────────────────────────────────────────────────────
  function openSubject(subject: ProgrammingSubject) {
    if (focusMode === 'flashcards') {
      void curriculum.markCodingSubjectUsed(subject.id).catch(() => undefined);
      setView({ type: 'deck', subject });
      return;
    }

    void loadTopics(subject);
  }

  function openFlashcardDeck(subject: ProgrammingSubject) {
    void curriculum.markCodingSubjectUsed(subject.id).catch(() => undefined);
    setView({ type: 'deck', subject });
  }

  function returnToSubjectList() {
    setView({ type: 'subjects' });
    const returnPage = subjectSort === 'last_used' ? 1 : subjectPage.page;
    void loadSubjects(returnPage, subjectSort);
  }

  function openQuestionTopic(subject: ProgrammingSubject, topic: ProgrammingTopic) {
    setView({ type: 'questionsTopic', subject, topic, returnToQuestions: true });
  }

  if (view.type === 'subjects') {
    return (
      <div className="space-y-6">
        <section className="app-surface border-primary/30 p-3 md:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            {general ? `${translate("Disciplina")} · ${disciplineName}` : translate("Programação · Currículo")}
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-800 md:mt-2 md:text-3xl">{translate("Minhas Matérias")}</h1>
          <p className="mt-1 text-xs font-bold text-slate-500 md:mt-2 md:text-sm">
            {focusMode === 'flashcards'
              ? translate("Modo flashcards: escolha uma matéria para treinar.")
              : focusMode === 'questions'
                ? translate("Modo questões: escolha um tópico para fazer simulados.")
                : translate("Modo leitura: escolha uma matéria para estudar.")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 sm:grid-cols-3">
            <MetricChip icon={<BookOpen size={18} className="sm:h-5 sm:w-5" />} label={translate("Matérias")} value={subjectPage.total} tone="sky" />
            <MetricChip icon={<CheckCircle2 size={18} className="sm:h-5 sm:w-5" />} label={translate("Tópicos estudados")} value={subjectPage.studied_count} tone="green" />
            <MetricChip icon={<Flame size={18} className="sm:h-5 sm:w-5" />} label={translate("Para revisar")} value={subjectPage.due_review_count} tone="orange" />
          </div>
        </section>

        {/* LeetCode trainer entry — programming only */}
        {!general && (
          <button
            type="button"
            onClick={() => setView({ type: 'leetcode' })}
            className="leetcode-trainer-card flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
              <Trophy size={24} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-black text-slate-800">{translate("LeetCode Trainer")}</p>
              <p className="text-sm text-slate-500">{translate("Métodos e técnicas para entrevistas — explicação, exemplo e resultado, gerados pela IA um a um")}</p>
            </div>
            <Sparkles size={18} className="shrink-0 text-amber-400" />
          </button>
        )}

        <div className="flex flex-col gap-2 rounded-2xl border-2 border-slate-100 bg-white/85 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div>
            <p className="text-sm font-black text-slate-700">{translate("Exibindo até")} {SUBJECTS_PER_PAGE} {translate("matérias")}</p>
            <p className="text-xs font-semibold text-slate-500">{translate("As próximas são carregadas somente quando você troca de página.")}</p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600" htmlFor="coding-subject-sort">
            {translate("Ordenar por")}
            <select
              id="coding-subject-sort"
              value={subjectSort}
              onChange={(event) => handleSubjectSortChange(event.target.value as CodingSubjectSort)}
              className="min-h-11 rounded-xl border-2 border-slate-200 bg-white px-3 font-bold text-slate-700 outline-none focus:border-primary"
            >
              <option value="last_used">{translate("Último uso (padrão)")}</option>
              <option value="created_at">{translate("Data de criação")}</option>
              <option value="alphabetical">{translate("Ordem alfabética")}</option>
              <option value="relevance">{translate("Relevância")}</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadSubjects(subjectPage.page, subjectSort)}
              className="shrink-0 rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white hover:bg-rose-700"
            >
              {translate("Tentar de novo")}
            </button>
          </div>
        )}

        <div
          aria-busy={loading}
          aria-live="polite"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {loading ? (
            Array.from({ length: SUBJECTS_PER_PAGE }, (_, index) => (
              <SubjectCardSkeleton key={index} />
            ))
          ) : (
            <>
              {subjects.map((subject) => (
                <div
                  key={subject.id}
                  className="group cursor-pointer rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  onClick={() => openSubject(subject)}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-2xl">
                      {subject.icon_emoji || '📚'}
                    </div>
                    <button
                      type="button"
                      aria-label={translate("Remover matéria")}
                      onClick={(e) => { e.stopPropagation(); handleDeleteSubject(subject.id); }}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-rose-100 bg-white text-rose-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h3 className="font-black text-slate-800">{subject.name}</h3>
                  {subject.description && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{subject.description}</p>}
                  <div
                    role="group"
                    aria-label={`Relevância de ${subject.name}`}
                    className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-amber-100/80 px-3 py-2 dark:border-amber-300/25 dark:bg-amber-400/10"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="text-xs font-black text-amber-800 dark:text-amber-100">{translate("Relevância")}</span>
                    <span className="flex items-center">
                      {Array.from({ length: 5 }, (_, index) => {
                        const level = index + 1;
                        const active = level <= subject.relevance;
                        return (
                          <button
                            key={level}
                            type="button"
                            disabled={updatingRelevanceId === subject.id}
                            aria-label={`Definir relevância ${level} de 5 para ${subject.name}`}
                            aria-pressed={level === subject.relevance}
                            onClick={() => void handleRelevanceChange(subject, level)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-amber-200/70 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-amber-300/15"
                          >
                            <Star
                              size={17}
                              className={active ? 'fill-amber-400 text-amber-500 dark:text-amber-300' : 'text-slate-300 dark:text-slate-500'}
                            />
                          </button>
                        );
                      })}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-slate-500">
                    <span>{subject.studied_count}/{subject.topic_count} estudados</span>
                    {subject.due_review_count > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-700">{subject.due_review_count} para revisar</span>
                    )}
                  </div>
                  {subject.topic_count > 0 && (
                    <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${(subject.studied_count / subject.topic_count) * 100}%` }}
                      />
                    </div>
                  )}
                  <div className="mt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={loadingTopics}
                        onClick={() => openSubject(subject)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary-dark px-3 py-2 text-xs font-black text-white hover:bg-primary-dark disabled:opacity-50"
                      >
                        {loadingTopics ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : focusMode === 'flashcards' ? (
                          <Layers size={12} />
                        ) : (
                          <BookOpen size={12} />
                        )}
                        {focusMode === 'flashcards' ? translate("Flashcards") : focusMode === 'questions' ? translate("Fazer simulado") : translate("Estudar")}
                      </button>
                      <button
                        type="button"
                        disabled={loadingReview || subject.due_review_count === 0}
                        onClick={() => handleStartReview(subject)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                      >
                        {loadingReview ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />} {translate("Revisar")}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => openFlashcardDeck(subject)}
                      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                    >
                      <Layers size={12} /> {translate("Flashcards")}
                    </button>
                  </div>
                </div>
              ))}
              {subjects.length === 0 && (
                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center sm:col-span-2 lg:col-span-3">
                  <p className="font-black text-slate-600">{translate("Nenhuma matéria cadastrada.")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-400">{general
                      ? translate("Crie a primeira matéria desta disciplina (ex.: Gramática) e monte o curso dela.")
                      : translate("Crie sua primeira matéria para começar.")}</p>
                </div>
              )}
              <div className="grid min-h-40 gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateSubject('blank')}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 bg-white p-4 text-slate-400 transition hover:border-primary hover:text-primary-dark"
                >
                  <Plus size={24} />
                  <span className="font-black">{translate("Nova Matéria")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateSubject('suggest')}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-3xl border-2 border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-100"
                >
                  <Sparkles size={18} />
                  {translate("Sugerir matéria por IA?")}
                </button>
              </div>
            </>
          )}
        </div>

        {!loading && subjectPage.total_pages > 1 && (
          <nav aria-label={translate("Paginação de matérias")} className="flex flex-col items-center justify-between gap-3 rounded-2xl border-2 border-slate-100 bg-white/85 p-3 sm:flex-row sm:px-4">
            <p className="text-sm font-black text-slate-600">
              {translate("Página")} {subjectPage.page} de {subjectPage.total_pages}
              <span className="ml-2 font-semibold text-slate-400">· {subjectPage.total} {translate("matérias")}</span>
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                disabled={subjectPage.page <= 1}
                onClick={() => handleSubjectPageChange(subjectPage.page - 1)}
                className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border-2 border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:border-primary/40 hover:text-primary-dark disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
              >
                <ChevronLeft size={17} /> {translate("Anterior")}
              </button>
              <button
                type="button"
                disabled={subjectPage.page >= subjectPage.total_pages}
                onClick={() => handleSubjectPageChange(subjectPage.page + 1)}
                className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-primary-dark px-4 text-sm font-black text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
              >
                {translate("Próxima")} <ChevronRight size={17} />
              </button>
            </div>
          </nav>
        )}
        {showCreateSubject && (
          <CreateSubjectModal
            autoSuggest={showCreateSubject === 'suggest'}
            onClose={() => setShowCreateSubject(false)}
            onCreated={(created) => {
              setShowCreateSubject(false);
              // A new subject starts empty: open it so the course can be built.
              openSubject(created);
            }}
          />
        )}
      </div>
    );
  }

  // ── Topics view ──────────────────────────────────────────────────────────
  if (view.type === 'topics') {
    const { subject } = view;
    const summaryCreditCost = topics.filter((topic) => topic.ai_content && !topic.has_summary).length;
    const enoughSummaryCredits = aiCredits?.unlimited || (aiCredits?.credits ?? 0) >= summaryCreditCost;
    const statusIcon = (s: string) => s === 'mastered' ? '⭐' : s === 'studied' ? '✅' : '🔘';
    return (
      <div className="space-y-6">
        <section className="app-surface border-primary/30 p-6">
          <button type="button" onClick={returnToSubjectList} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary">
            <ArrowLeft size={16} /> {translate("Todas as matérias")}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{subject.icon_emoji || '📚'}</span>
            <div>
              <h1 className="text-2xl font-black text-slate-800">{subject.name}</h1>
              {subject.description && <p className="text-sm text-slate-500">{subject.description}</p>}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm font-semibold text-slate-500">
            <span>{subject.studied_count}/{subject.topic_count} {translate("tópicos estudados")}</span>
            {subject.due_review_count > 0 && (
              <button
                type="button"
                onClick={() => handleStartReview(subject)}
                disabled={loadingReview}
                className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-black text-amber-700 hover:bg-amber-200"
              >
                {loadingReview ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                {subject.due_review_count} para revisar
              </button>
            )}
          </div>

          <div className="mt-3 rounded-2xl border-2 border-violet-100 bg-violet-100/70 p-4 dark:border-violet-300/30 dark:bg-violet-400/10">
            <p className="text-sm font-black text-violet-900 dark:text-violet-100">{translate("Resumo da matéria")}</p>
            <p className="mt-1 text-xs font-bold text-violet-700 dark:text-violet-200">
              {translate("Resume cada tópico e junta tudo em uma folha só. Tópico novo entra sem refazer o resto.")}
            </p>
            <p className="mt-2 rounded-xl border border-violet-200/70 bg-slate-50/90 px-3 py-2 text-xs font-black text-violet-800 dark:border-violet-300/20 dark:bg-slate-950/45 dark:text-violet-100">
              {summaryCreditCost === 0
                ? translate("Nenhum crédito será usado: os resumos já estão prontos.")
                : `Esta ação usará ${summaryCreditCost} ${summaryCreditCost === 1 ? 'crédito' : 'créditos'} de IA.`}
              {aiCredits && !aiCredits.unlimited && summaryCreditCost > 0 && (
                <span className="ml-1 font-bold text-violet-600 dark:text-violet-200">{translate("Você tem")} {aiCredits.credits} hoje.</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => void openSubjectSummary(subject)}
              disabled={loadingSummary || !enoughSummaryCredits}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loadingSummary ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {loadingSummary ? summaryProgress || translate("Montando o resumo...") : translate("Gerar resumo")}
            </button>
            {!enoughSummaryCredits && (
              <p role="alert" className="mt-2 text-xs font-bold text-rose-700">
                {translate("Créditos insuficientes para resumir todos os tópicos. Gere por partes ou tente amanhã.")}
              </p>
            )}
            {summaryError && (
              <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {summaryError}
              </p>
            )}
          </div>
        </section>

        {summary && (
          <SummarySheetModal
            subjectName={subject.name}
            heading={translate("Resumo da matéria")}
            scopeLabel={`${summary.summarized_count} de ${summary.topic_count} tópicos`}
            content={summary.content}
            regenerating={loadingSummary}
            progress={summaryProgress}
            error={summaryError}
            onRegenerate={() => void openSubjectSummary(subject, true)}
            onClose={() => setSummary(null)}
          />
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setShowCreateTopic(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 font-black text-slate-500 hover:border-primary hover:text-primary-dark"
          >
            <Plus size={18} /> {translate("Novo tópico")}
          </button>
          <button
            type="button"
            onClick={() => handleGenerateTopicAI(subject)}
            disabled={generatingTopicAI}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generatingTopicAI ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {generatingTopicAI ? translate("Gerando tópico...") : translate("Gerar tópico por IA")}
          </button>
          <button
            type="button"
            onClick={() => setShowCourseOutline((open) => !open)}
            aria-expanded={showCourseOutline}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 font-black text-violet-700 transition hover:bg-violet-100 dark:border-violet-300/40 dark:bg-violet-400/10 dark:text-violet-100"
          >
            <ListOrdered size={18} /> {translate("Montar curso com IA")}
          </button>
        </div>
        {showCourseOutline && (
          <section className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4 dark:border-violet-300/30 dark:bg-violet-400/10">
            <p className="text-sm font-black text-violet-900 dark:text-violet-100">{translate("Montar curso com IA")}</p>
            <p className="mt-1 text-xs font-bold text-violet-700 dark:text-violet-200">
              {topics.length === 0
                ? translate("A IA monta as aulas em ordem, do básico ao avançado. Cada aula é escrita quando você abrir.")
                : translate("A IA continua o curso a partir das aulas que já existem. Cada aula é escrita quando você abrir.")}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-violet-900 dark:text-violet-100" htmlFor="course-lesson-count">
                {translate("Aulas")}
                <select
                  id="course-lesson-count"
                  value={courseLessonCount}
                  onChange={(event) => setCourseLessonCount(Number(event.target.value))}
                  className="min-h-11 rounded-xl border-2 border-violet-200 bg-white px-3 font-bold text-slate-700 outline-none focus:border-violet-500"
                >
                  {COURSE_LESSON_COUNTS.map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <input
                aria-label={translate("Foco do curso (opcional)")}
                value={courseContext}
                onChange={(event) => setCourseContext(event.target.value)}
                maxLength={1000}
                placeholder={translate("Foco do curso (opcional): ex. prova DELF B1, conversação...")}
                className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-violet-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-500"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCourseOutline(false)}
                disabled={generatingCourse}
                className="min-h-11 flex-1 rounded-2xl border-2 border-violet-200 bg-white px-4 text-sm font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50"
              >
                {translate("Cancelar")}
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateCourse(subject)}
                disabled={generatingCourse}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {generatingCourse ? <Loader2 size={16} className="animate-spin" /> : <ListOrdered size={16} />}
                {generatingCourse ? translate("Montando o curso...") : translate("Montar curso")}
              </button>
            </div>
            {courseError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{courseError}</p>}
          </section>
        )}
        {topicAIError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{topicAIError}</p>}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadTopics(subject)}
              className="shrink-0 rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white hover:bg-rose-700"
            >
              {translate("Tentar de novo")}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {loadingTopics ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={28} /></div>
          ) : topics.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-bold text-slate-500">{translate("Nenhum tópico ainda.")}</p>
              <p className="mt-1 text-sm text-slate-400">{translate("Crie o primeiro tópico do roteiro.")}</p>
              {!showCourseOutline && (
                <button
                  type="button"
                  onClick={() => setShowCourseOutline(true)}
                  className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-2xl bg-violet-600 px-5 text-sm font-black text-white hover:bg-violet-700"
                >
                  <ListOrdered size={16} /> {translate("Montar curso com IA")}
                </button>
              )}
            </div>
          ) : (
            topics.map((topic, idx) => (
              <div
                key={topic.id}
                className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white px-5 py-4 transition hover:border-primary/40 ${topic.id === newTopicId ? 'border-violet-300 bg-violet-50/60' : 'border-slate-100'}`}
                onClick={() => {
                  if (focusMode === 'questions') openQuestionTopic(subject, topic);
                  else setView({ type: 'topic', subject, topic });
                }}
              >
                <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-400">{idx + 1}</span>
                <span className="text-lg">{statusIcon(topic.status)}</span>
                <div className="flex-1">
                  <p className="font-black text-slate-800">
                    {topic.title}
                    {topic.id === newTopicId && (
                      <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-700">{translate("Novo")}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    {topic.flashcard_count} flashcard{topic.flashcard_count !== 1 ? 's' : ''}
                    {!topic.ai_content && ' · sem aula gerada'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteTopic(topic.id, subject); }}
                  className="shrink-0 rounded-xl p-1.5 text-slate-300 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {showCreateTopic && (
          <CreateTopicModal
            subjectId={subject.id}
            topicCount={topics.length}
            onClose={() => setShowCreateTopic(false)}
            onCreated={(t) => {
              setTopics((prev) => [...prev, t]);
              setShowCreateTopic(false);
              loadSubjects();
            }}
          />
        )}
      </div>
    );
  }

  // ── Topic detail view ────────────────────────────────────────────────────
  if (view.type === 'topic' || view.type === 'questionsTopic') {
    const { subject, topic } = view;
    return (
      <TopicView
        topic={topic}
        subjectName={subject.name}
        initialQuestionPracticeOpen={view.type === 'questionsTopic'}
        onBack={() => setView({ type: 'topics', subject })}
        onTopicUpdated={(updated) => {
          setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          loadSubjects();
        }}
      />
    );
  }

  // ── Review session view ──────────────────────────────────────────────────
  if (view.type === 'review') {
    const { subject, cards } = view;
    return (
      <ReviewSession
        subjectName={subject.name}
        cards={cards}
        onClose={() => {
          loadSubjects();
          setView({ type: 'topics', subject });
        }}
      />
    );
  }

  // ── Flashcard deck view ──────────────────────────────────────────────────
  if (view.type === 'deck') {
    const { subject, returnToTopics } = view;
    return (
      <FlashcardDeck
        subjectId={subject.id}
        subjectName={subject.name}
        subjectIcon={subject.icon_emoji}
        onBack={() => {
          if (returnToTopics) {
            void loadSubjects();
          } else {
            const returnPage = subjectSort === 'last_used' ? 1 : subjectPage.page;
            void loadSubjects(returnPage, subjectSort);
          }
          setView(returnToTopics ? { type: 'topics', subject } : { type: 'subjects' });
        }}
        onChanged={loadSubjects}
      />
    );
  }

  // ── LeetCode trainer view ────────────────────────────────────────────────
  if (view.type === 'leetcode') {
    return <LeetCodeTrainer onBack={returnToSubjectList} />;
  }

  return null;
}

function MetricChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'sky' | 'green' | 'orange' }) {
  const colors = { sky: 'bg-sky-50 text-sky-700', green: 'bg-emerald-50 text-emerald-700', orange: 'bg-amber-50 text-amber-700' };
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${colors[tone]} sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3`}>
      {icon}
      <div>
        <p className="text-lg font-black sm:text-xl">{value}</p>
        <p className="text-[11px] font-semibold leading-4 opacity-75 sm:text-xs">{label}</p>
      </div>
    </div>
  );
}

function SubjectCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[22rem] animate-pulse rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div className="h-12 w-12 rounded-2xl bg-slate-100" />
        <div className="h-11 w-11 rounded-xl bg-slate-100" />
      </div>
      <div className="mt-4 h-5 w-2/3 rounded-full bg-slate-100" />
      <div className="mt-2 h-3 w-full rounded-full bg-slate-100" />
      <div className="mt-4 h-12 rounded-xl bg-amber-50" />
      <div className="mt-4 h-3 w-1/2 rounded-full bg-slate-100" />
      <div className="mt-6 h-11 rounded-2xl bg-slate-100" />
      <div className="mt-2 h-11 rounded-2xl bg-slate-100" />
    </div>
  );
}
