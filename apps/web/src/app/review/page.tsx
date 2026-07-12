'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';

import { CelebrationOverlay } from '@/components/celebration';
import { StatusCard } from '@/components/status-card';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  ApiError,
  api,
  type LessonQuestionReviewCard,
  type LessonSummary,
  type ReviewCard,
  type ReviewSession,
  type VocabularyReviewCard,
} from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';
import {
  isUncertainLessonQuestionGenerationError,
  validateConfirmedLessonQuestionBatch,
} from '@/lib/lesson-question-state';
import {
  advanceMixedReview,
  beginMixedReviewAdvancement,
  beginMixedReviewSubmission,
  buildReviewAttemptPayload,
  captureReviewAttempt,
  createMixedReviewState,
  isReviewAttemptCompletionCurrent,
  revealMixedReviewLessonAnswer,
  runLessonQuestionGeneration,
  type ReviewConfidenceValue,
} from '@/lib/mixed-review-state';

type GenerationMessage = {
  tone: 'success' | 'warning' | 'error';
  text: string;
};

interface ConfidenceLevel {
  value: ReviewConfidenceValue;
  label: string;
  emoji: string;
  bg: string;
  border: string;
  text: string;
  correct: boolean;
}

const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  { value: 0, label: 'Não sei', emoji: '😵', bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', correct: false },
  { value: 1, label: 'Dúvida', emoji: '🤔', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', correct: false },
  { value: 2, label: 'Quase certeza', emoji: '😊', bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-700', correct: true },
  { value: 3, label: 'Sei!', emoji: '🎉', bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', correct: true },
];

const REVIEW_LIMIT = 8;

export default function ReviewPage() {
  const authState = useRequireAuth();
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [chosenLevel, setChosenLevel] = useState<ConfidenceLevel | null>(null);
  const [lessonAnswerRevealed, setLessonAnswerRevealed] = useState(false);
  const [masteredCount, setMasteredCount] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<0.5 | 0.75 | 1.0>(1.0);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | ''>('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [generationFormOpen, setGenerationFormOpen] = useState(false);
  const [generationContext, setGenerationContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<GenerationMessage | null>(null);
  const [generationNeedsReviewReload, setGenerationNeedsReviewReload] = useState(false);

  const mountedRef = useRef(true);
  const reviewRequestRef = useRef(0);
  const optionsRequestRef = useRef(0);
  const selectedLessonIdRef = useRef<number | ''>('');
  const generationRequestRef = useRef(0);
  const generationInFlightRef = useRef(false);
  const reviewTransitionRef = useRef(createMixedReviewState(0));
  const reviewSessionEpochRef = useRef(0);
  const activeReviewCardRef = useRef<ReviewCard | null>(null);
  const advancementTimeoutRef = useRef<number | null>(null);

  function resetReviewProgress(total: number) {
    if (advancementTimeoutRef.current !== null) {
      window.clearTimeout(advancementTimeoutRef.current);
      advancementTimeoutRef.current = null;
    }
    setCompleted(false);
    setFlipped(false);
    setChosenLevel(null);
    setLessonAnswerRevealed(false);
    setCurrentIndex(0);
    setMasteredCount(0);
    setSubmitting(false);
    setShowCelebration(false);
    reviewTransitionRef.current = createMixedReviewState(total);
  }

  function installReviewSession(data: ReviewSession) {
    reviewSessionEpochRef.current += 1;
    activeReviewCardRef.current = data.items[0] ?? null;
    setReviewSession(data);
    resetReviewProgress(data.items.length);
  }

  async function loadReview(): Promise<boolean> {
    const requestToken = ++reviewRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getReviewSession(REVIEW_LIMIT);
      if (!mountedRef.current || reviewRequestRef.current !== requestToken) return false;
      installReviewSession(data);
      return true;
    } catch (err) {
      if (!mountedRef.current || reviewRequestRef.current !== requestToken) return false;
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar a revisao.'));
      return false;
    } finally {
      if (mountedRef.current && reviewRequestRef.current === requestToken) setLoading(false);
    }
  }

  async function loadGenerationOptions() {
    const requestToken = ++optionsRequestRef.current;
    setLessonsLoading(true);
    setLessonsError(null);
    const [lessonResult, settingsResult] = await Promise.allSettled([
      api.getAllLessons(),
      api.getParentSettings(),
    ]);
    if (!mountedRef.current || optionsRequestRef.current !== requestToken) return;

    if (lessonResult.status === 'fulfilled') {
      setLessons(lessonResult.value);
    } else {
      setLessons([]);
      setLessonsError('Nao foi possivel carregar as licoes disponiveis.');
    }
    if (settingsResult.status === 'fulfilled') {
      setTargetLanguage(settingsResult.value.target_language);
    }
    setLessonsLoading(false);
  }

  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    mountedRef.current = true;
    generationInFlightRef.current = false;
    setGenerating(false);
    void loadReview();
    void loadGenerationOptions();

    return () => {
      mountedRef.current = false;
      reviewRequestRef.current += 1;
      optionsRequestRef.current += 1;
      generationRequestRef.current += 1;
      generationInFlightRef.current = false;
      reviewTransitionRef.current = createMixedReviewState(0);
      activeReviewCardRef.current = null;
      if (advancementTimeoutRef.current !== null) {
        window.clearTimeout(advancementTimeoutRef.current);
        advancementTimeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.status]);

  async function reloadReviewAfterGeneration(
    requestToken: number,
    requestLessonId: number,
  ): Promise<boolean> {
    try {
      const data = await api.getReviewSession(REVIEW_LIMIT);
      if (
        !mountedRef.current
        || generationRequestRef.current !== requestToken
        || selectedLessonIdRef.current !== requestLessonId
      ) {
        return false;
      }
      installReviewSession(data);
      setError(null);
      setGenerationNeedsReviewReload(false);
      return true;
    } catch {
      return false;
    }
  }

  async function handleGenerateLessonQuestions() {
    if (
      generationInFlightRef.current
      || generationNeedsReviewReload
      || typeof selectedLessonId !== 'number'
    ) {
      if (typeof selectedLessonId !== 'number') {
        setGenerationMessage({ tone: 'error', text: 'Escolha uma licao antes de gerar.' });
      }
      return;
    }

    generationInFlightRef.current = true;
    const requestToken = ++generationRequestRef.current;
    const requestLessonId = selectedLessonId;
    const selectedLesson = lessons.find((lesson) => lesson.id === requestLessonId);
    setGenerating(true);
    setGenerationMessage(null);

    const isCurrentRequest = () => (
      mountedRef.current
      && generationRequestRef.current === requestToken
      && selectedLessonIdRef.current === requestLessonId
    );
    try {
      const outcome = await runLessonQuestionGeneration({
        lessonId: requestLessonId,
        generate: () => api.generateLessonQuestions(requestLessonId, generationContext),
        validate: validateConfirmedLessonQuestionBatch,
        reload: () => reloadReviewAfterGeneration(requestToken, requestLessonId),
        isCurrent: isCurrentRequest,
        isUncertainError: isUncertainLessonQuestionGenerationError,
      });

      if (outcome.kind === 'stale') return;
      if (outcome.kind === 'confirmed') {
        setGenerationContext('');
        setGenerationMessage({
          tone: outcome.reloaded ? 'success' : 'warning',
          text: outcome.reloaded
            ? `${outcome.count} novas questoes foram criadas para ${selectedLesson?.title || 'a licao'} e a revisao foi atualizada.`
            : `${outcome.count} novas questoes foram criadas, mas a revisao nao recarregou. Recarregue antes de gerar novamente.`,
        });
        setGenerationNeedsReviewReload(!outcome.reloaded);
      } else if (outcome.kind === 'uncertain') {
        setGenerationNeedsReviewReload(!outcome.reloaded);
        setGenerationMessage({
          tone: 'warning',
          text: outcome.reloaded
            ? 'A resposta da IA ficou incerta. A revisao foi recarregada; confira as questoes antes de tentar novamente.'
            : 'A resposta da IA ficou incerta. Recarregue a revisao antes de tentar novamente para evitar perguntas duplicadas.',
        });
      } else {
        const generationError = outcome.error;
        if (generationError instanceof ApiError && generationError.status === 409) {
          setGenerationMessage({ tone: 'error', text: generationError.message || 'Esta licao atingiu o limite de perguntas.' });
        } else {
          setGenerationMessage({
            tone: 'error',
            text: generationError instanceof Error ? generationError.message : 'Nao foi possivel criar as questoes.',
          });
        }
      }
    } finally {
      if (mountedRef.current && generationRequestRef.current === requestToken) {
        generationInFlightRef.current = false;
        setGenerating(false);
      }
    }
  }

  async function handleGenerationRecoveryReload() {
    if (generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    setGenerating(true);
    const reloaded = await loadReview();
    if (mountedRef.current) {
      setGenerationNeedsReviewReload(!reloaded);
      setGenerationMessage({
        tone: reloaded ? 'success' : 'error',
        text: reloaded
          ? 'Revisao recarregada. Confira as questoes antes de gerar novamente.'
          : 'Ainda nao foi possivel recarregar a revisao.',
      });
      generationInFlightRef.current = false;
      setGenerating(false);
    }
  }

  async function playAudio(text: string, speed = audioSpeed) {
    setAudioLoading(true);
    try {
      const data = await api.speak(text);
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || text,
        speed,
      );
    } catch {
      // Audio is optional during review.
    } finally {
      if (mountedRef.current) setAudioLoading(false);
    }
  }

  function handleFlip() {
    const transition = reviewTransitionRef.current;
    if (transition.chosenConfidence !== null || transition.advancementLocked) return;
    reviewTransitionRef.current = { ...transition, flipped: true };
    setFlipped(true);
  }

  function handleRevealLessonAnswer() {
    const reveal = revealMixedReviewLessonAnswer(reviewTransitionRef.current);
    if (!reveal.accepted) return;
    reviewTransitionRef.current = reveal.state;
    setLessonAnswerRevealed(true);
  }

  function advanceReview(immediate = false) {
    if (!reviewSession) return;
    const advancement = beginMixedReviewAdvancement(reviewTransitionRef.current);
    if (!advancement.accepted) return;
    reviewTransitionRef.current = advancement.state;
    const transition = advanceMixedReview(advancement.state);
    if (transition.completed) {
      reviewTransitionRef.current = transition;
      activeReviewCardRef.current = null;
      setShowCelebration(true);
      setCompleted(true);
      return;
    }
    setFlipped(transition.flipped);
    setChosenLevel(null);
    setLessonAnswerRevealed(false);
    if (immediate) {
      reviewTransitionRef.current = transition;
      activeReviewCardRef.current = reviewSession.items[transition.currentIndex] ?? null;
      setCurrentIndex(transition.currentIndex);
      return;
    }
    advancementTimeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      reviewTransitionRef.current = transition;
      activeReviewCardRef.current = reviewSession.items[transition.currentIndex] ?? null;
      setCurrentIndex(transition.currentIndex);
      setLessonAnswerRevealed(false);
      advancementTimeoutRef.current = null;
    }, 220);
  }

  async function handleVocabularyConfidence(card: VocabularyReviewCard, level: ConfidenceLevel) {
    const submission = beginMixedReviewSubmission(reviewTransitionRef.current);
    if (!submission.accepted) return;
    reviewTransitionRef.current = {
      ...submission.state,
      chosenConfidence: level.value,
    };
    const capturedAttempt = captureReviewAttempt(reviewSessionEpochRef.current, card);
    setChosenLevel(level);
    setSubmitting(true);
    if (level.correct) setMasteredCount((value) => value + 1);
    try {
      await api.submitReviewAttempt(buildReviewAttemptPayload(card, level.correct));
    } catch {
      // Keep the review usable when attempt logging is temporarily unavailable.
    } finally {
      if (
        mountedRef.current
        && isReviewAttemptCompletionCurrent(
          capturedAttempt,
          reviewSessionEpochRef.current,
          activeReviewCardRef.current,
        )
      ) {
        reviewTransitionRef.current = {
          ...reviewTransitionRef.current,
          submissionLocked: false,
        };
        setSubmitting(false);
      }
    }
  }

  async function handleLessonQuestionAnswer(card: LessonQuestionReviewCard, correct: boolean) {
    if (!reviewTransitionRef.current.lessonAnswerRevealed) return;
    const submission = beginMixedReviewSubmission(reviewTransitionRef.current);
    if (!submission.accepted) return;
    reviewTransitionRef.current = submission.state;
    const capturedAttempt = captureReviewAttempt(reviewSessionEpochRef.current, card);
    setSubmitting(true);
    if (correct) setMasteredCount((value) => value + 1);
    try {
      await api.submitReviewAttempt(buildReviewAttemptPayload(card, correct));
    } catch {
      // Keep the review usable when attempt logging is temporarily unavailable.
    } finally {
      if (
        mountedRef.current
        && isReviewAttemptCompletionCurrent(
          capturedAttempt,
          reviewSessionEpochRef.current,
          activeReviewCardRef.current,
        )
      ) {
        advanceReview(true);
        setSubmitting(false);
      }
    }
  }

  function handleNext() {
    advanceReview();
  }

  if (authState.status === 'loading' || authState.status === 'unauthenticated') {
    return (
      <StatusCard
        tone="loading"
        title="Verificando acesso"
        message="Confirmando seu cadastro..."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }
  if (authState.status === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title="Servidor nao disponivel"
        message="Ative o backend para acessar a revisao."
        primaryAction={<Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>}
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }
  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Separando sua revisao"
        message="O tutor esta escolhendo palavras e questoes que precisam de pratica."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }
  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title="Conecte o tutor primeiro"
        message="Este aparelho precisa da URL atual do backend."
        primaryAction={<Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Abrir configuracao</Link>}
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }
  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="A revisao nao conseguiu se conectar"
        message="O backend parece offline. Tente novamente quando ele estiver disponivel."
        primaryAction={<button onClick={() => void loadReview()} className="kid-button bg-kid-orange hover:bg-secondary-dark">Tentar de novo</button>}
        secondaryHref="/connect"
        secondaryLabel="Trocar conexao"
      />
    );
  }
  if (error) {
    return (
      <StatusCard
        tone="error"
        title="A revisao travou"
        message={error.message}
        primaryAction={<button onClick={() => void loadReview()} className="kid-button bg-kid-pink hover:bg-pink-500">Recarregar revisao</button>}
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (completed && reviewSession) {
    const total = reviewSession.items.length;
    return (
      <>
        <CelebrationOverlay show={showCelebration} />
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="kid-surface mx-auto w-full max-w-lg border-accent/60 p-6 text-center md:p-10 celebrate-pop">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-light">
              <RotateCcw className="text-accent-dark" size={44} />
            </div>
            <h1 className="mt-5 text-3xl font-black text-slate-800">Revisao concluida!</h1>
            <p className="mt-3 text-lg text-slate-600">
              <span className="font-black text-emerald-600">{masteredCount}</span> dominadas ·{' '}
              <span className="font-black text-rose-600">{total - masteredCount}</span> para praticar mais
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button onClick={() => void loadReview()} className="kid-button justify-center bg-primary hover:bg-primary-dark">Praticar de novo</button>
              <Link href="/" className="rounded-full border-2 border-slate-200 px-5 py-3.5 font-bold text-slate-600">Voltar ao inicio</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const generationPanel = (
    <section className="kid-surface mb-6 border-violet-200 p-5" aria-labelledby="generate-review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kid-tag inline-flex items-center gap-1 text-xs"><Sparkles size={12} /> IA</p>
          <h2 id="generate-review-title" className="mt-2 text-lg font-black text-slate-800">Criar mais questoes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gere 5 novas questoes para uma licao de {targetLanguage || 'idioma'} sem sair da revisao.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setGenerationFormOpen((open) => !open);
            setGenerationMessage(null);
          }}
          disabled={generating}
          aria-expanded={generationFormOpen}
          aria-controls="review-question-generator-panel"
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60"
        >
          <Plus size={16} /> Criar mais questoes com IA
        </button>
      </div>

      {generationFormOpen && (
        <div id="review-question-generator-panel" className="mt-5 space-y-4 border-t border-violet-100 pt-5">
          <label className="block text-sm font-black text-slate-700">
            Licao
            <select
              required
              value={selectedLessonId}
              onChange={(event) => {
                const value = event.target.value ? Number(event.target.value) : '';
                selectedLessonIdRef.current = value;
                setSelectedLessonId(value);
                setGenerationMessage(null);
              }}
              disabled={generating || lessonsLoading}
              className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-violet-400 disabled:opacity-60"
            >
              <option value="">Selecione uma licao</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lesson.title} · {lesson.theme}</option>
              ))}
            </select>
          </label>

          {lessonsLoading && <p className="text-sm font-bold text-slate-500">Carregando licoes...</p>}
          {lessonsError && (
            <div className="flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm font-bold text-rose-600">{lessonsError}</p>
              <button type="button" onClick={() => void loadGenerationOptions()} className="text-sm font-black text-violet-700 underline">Tentar novamente</button>
            </div>
          )}

          <label className="block text-sm font-black text-slate-700">
            Contexto opcional
            <textarea
              value={generationContext}
              onChange={(event) => setGenerationContext(event.target.value)}
              maxLength={1000}
              disabled={generating}
              rows={3}
              placeholder="Ex.: foco em gramatica, compreensao ou situacoes de viagem"
              className="mt-2 w-full resize-y rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-400 disabled:opacity-60"
            />
            <span className="mt-1 block text-right text-xs font-bold text-slate-400">{generationContext.length}/1000</span>
          </label>

          <p className="rounded-2xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700">Serão criadas exatamente 5 novas questoes ligadas à licao selecionada.</p>

          <div aria-live="polite" aria-atomic="true">
            {generationMessage && (
              <p
                role={generationMessage.tone === 'success' ? 'status' : 'alert'}
              className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                generationMessage.tone === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : generationMessage.tone === 'warning'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-rose-50 text-rose-700'
              }`}
              >
                {generationMessage.text}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {generationNeedsReviewReload ? (
              <button
                type="button"
                onClick={() => void handleGenerationRecoveryReload()}
                disabled={generating}
                className="kid-button justify-center bg-amber-500 hover:bg-amber-600 disabled:opacity-60"
              >
                {generating ? <Loader2 size={17} className="animate-spin" /> : <RotateCcw size={17} />}
                Recarregar revisao antes de tentar novamente
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleGenerateLessonQuestions()}
                disabled={generating || typeof selectedLessonId !== 'number' || lessonsLoading}
                className="kid-button justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
              >
                {generating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                {generating ? 'Criando 5 questoes...' : 'Criar 5 novas questoes'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );

  if (!reviewSession || reviewSession.items.length === 0) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-lg">
          <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-primary-dark"><ArrowLeft size={18} /> Voltar</Link>
          {generationPanel}
          <div className="kid-surface p-7 text-center">
            <Brain className="mx-auto text-slate-300" size={44} />
            <h1 className="mt-4 text-2xl font-black text-slate-800">Nada pendente para revisar</h1>
            <p className="mt-2 text-sm text-slate-500">Voce pode criar novas questoes para uma licao usando o formulario acima.</p>
          </div>
        </div>
      </main>
    );
  }

  const card = reviewSession.items[currentIndex];
  const total = reviewSession.items.length;
  const progressWidth = ((currentIndex + 1) / total) * 100;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark"><ArrowLeft size={18} /> Voltar</Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"><Brain size={12} /> Revisao</span>
            <span className="kid-tag text-xs">{currentIndex + 1}/{total}</span>
          </div>
        </div>

        {generationPanel}

        <div className="mb-5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressWidth}%` }} />
        </div>

        {card.card_type === 'lesson_question' ? (
          <section className="kid-surface border-violet-200 p-6 md:p-8" aria-label="Questao da licao">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-violet-700">{card.question_type.replaceAll('_', ' ')}</span>
              <span className="text-xs font-bold text-slate-400">Questao da licao</span>
            </div>
            <h1 className="mt-6 text-2xl font-black leading-snug text-slate-800 md:text-3xl">{card.prompt}</h1>

            {!lessonAnswerRevealed ? (
              <button
                type="button"
                onClick={handleRevealLessonAnswer}
                disabled={submitting || reviewTransitionRef.current.advancementLocked}
                className="kid-button mt-8 w-full justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
              >
                Revelar resposta
              </button>
            ) : (
              <div className="mt-7 space-y-5" aria-live="polite">
                <div className="rounded-2xl bg-violet-50 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-violet-500">Resposta</p>
                  <p className="mt-2 text-xl font-black text-slate-800">{card.answer}</p>
                  {card.supporting_example && (
                    <div className="mt-4 border-t border-violet-200 pt-4">
                      <p className="text-xs font-black uppercase tracking-widest text-violet-500">Exemplo de apoio</p>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{card.supporting_example}</p>
                    </div>
                  )}
                </div>
                <p className="text-center text-sm font-bold text-slate-500">Voce sabia a resposta antes de revelar?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void handleLessonQuestionAnswer(card, false)}
                    disabled={submitting || reviewTransitionRef.current.advancementLocked}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-4 font-black text-rose-700 disabled:opacity-60"
                  >
                    <XCircle size={18} /> Nao sabia
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLessonQuestionAnswer(card, true)}
                    disabled={submitting || reviewTransitionRef.current.advancementLocked}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-4 font-black text-emerald-700 disabled:opacity-60"
                  >
                    <CheckCircle2 size={18} /> Sabia
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section aria-label="Revisao de vocabulario">
            <div className="flashcard-scene mb-4" style={{ perspective: '1200px', minHeight: '260px' }}>
              <div
                className="flashcard-inner relative w-full transition-transform duration-500"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  minHeight: '260px',
                }}
              >
                <div
                  className="flashcard-face absolute inset-0 flex flex-col rounded-[1.75rem] border-2 border-emerald-200 bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] md:p-8"
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-emerald-700">
                      Frente
                    </span>
                    <div className="flex items-center gap-2" aria-label="Velocidade do audio">
                      {([0.5, 0.75, 1.0] as const).map((speed) => (
                        <button
                          type="button"
                          key={speed}
                          onClick={(event) => { event.stopPropagation(); setAudioSpeed(speed); }}
                          className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                            audioSpeed === speed
                              ? 'bg-emerald-500 text-white'
                              : 'border border-slate-200 text-slate-500 hover:border-emerald-400'
                          }`}
                          aria-pressed={audioSpeed === speed}
                          aria-label={`Velocidade ${speed}x`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4">
                    <p className="text-center text-4xl font-black leading-snug text-slate-800 md:text-5xl">
                      {card.word_en}
                    </p>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); void playAudio(card.word_en); }}
                      disabled={audioLoading}
                      className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition hover:bg-emerald-600 active:scale-95 disabled:opacity-60"
                      aria-label={`Ouvir: ${card.word_en}`}
                    >
                      {audioLoading ? <Loader2 size={22} className="animate-spin" /> : <Volume2 size={22} />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleFlip}
                    className="mt-2 w-full rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-black text-slate-400 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600"
                  >
                    Virar carta ↻
                  </button>
                </div>

                <div
                  className="flashcard-face absolute inset-0 flex flex-col rounded-[1.75rem] border-2 border-primary/30 bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] md:p-8"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-dark">
                      Verso
                    </span>
                    <span className="text-sm font-bold text-slate-400">{card.word_en}</span>
                  </div>

                  <div className="flex flex-1 flex-col items-center justify-center py-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Traducao</p>
                    <p className="mt-2 text-center text-3xl font-black text-slate-800 md:text-4xl">
                      {card.word_pt}
                    </p>
                  </div>

                  {!chosenLevel ? (
                    <div>
                      <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                        Como voce se saiu?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {CONFIDENCE_LEVELS.map((level) => (
                          <button
                            type="button"
                            key={level.value}
                            onClick={() => void handleVocabularyConfidence(card, level)}
                            disabled={submitting}
                            className={`rounded-2xl border-2 px-3 py-3 text-center font-bold transition active:scale-[.97] hover:scale-[1.02] disabled:opacity-60 ${level.bg} ${level.border} ${level.text}`}
                          >
                            <span className="block text-xl" aria-hidden="true">{level.emoji}</span>
                            <span className="mt-0.5 block text-xs">{level.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2" aria-live="polite">
                      <p className="mb-3 text-center text-sm font-semibold text-slate-500">
                        {chosenLevel.correct
                          ? 'Otimo! Essa frase voltara mais tarde.'
                          : 'Sem problema. Ela voltara em breve para mais pratica.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={submitting || reviewTransitionRef.current.advancementLocked}
                        className={`flex w-full items-center justify-center rounded-2xl py-4 text-base font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-60 ${
                          chosenLevel.correct ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-primary hover:bg-primary-dark'
                        }`}
                      >
                        {currentIndex < total - 1 ? 'Proxima carta →' : 'Ver resultado'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {card.difficulty_score > 0 && (
          <p className="mt-4 text-center text-xs font-bold text-slate-400">Dificuldade: {Math.round(card.difficulty_score * 100)}% · {card.error_count} erros anteriores</p>
        )}
      </div>
    </main>
  );
}
