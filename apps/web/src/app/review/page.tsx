'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Languages,
  Loader2,
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
  type ReviewCard,
  type ReviewSession,
  type VocabularyReviewCard,
} from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';
import { rememberStudyLocation } from '@/lib/study-resume';
import {
  advanceMixedReview,
  beginMixedReviewAdvancement,
  beginMixedReviewSubmission,
  buildReviewAttemptPayload,
  captureReviewAttempt,
  createMixedReviewState,
  isReviewAttemptCompletionCurrent,
  revealMixedReviewLessonAnswer,
  type ReviewConfidenceValue,
} from '@/lib/mixed-review-state';
import { t } from '@/lib/i18n';

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
  { value: 0, label: "Não sei", emoji: '😵', bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', correct: false },
  { value: 1, label: "Dúvida", emoji: '🤔', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', correct: false },
  { value: 2, label: "Quase certeza", emoji: '😊', bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-700', correct: true },
  { value: 3, label: "Sei!", emoji: '🎉', bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', correct: true },
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
  const [phraseTranslationShown, setPhraseTranslationShown] = useState(false);
  const [masteredCount, setMasteredCount] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<0.5 | 0.75 | 1.0>(1.0);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const [targetLanguage, setTargetLanguage] = useState('');
  const [generationFormOpen, setGenerationFormOpen] = useState(false);
  const [generationContext, setGenerationContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<GenerationMessage | null>(null);
  const [generationNeedsReviewReload, setGenerationNeedsReviewReload] = useState(false);

  const mountedRef = useRef(true);
  const reviewRequestRef = useRef(0);
  const optionsRequestRef = useRef(0);
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
    setPhraseTranslationShown(false);
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
    if (data.items.length > 0) {
      rememberStudyLocation({ kind: 'language_review' });
    }
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
      setError(err instanceof ApiError ? err : new ApiError(t("Não foi possível carregar a revisão.")));
      return false;
    } finally {
      if (mountedRef.current && reviewRequestRef.current === requestToken) setLoading(false);
    }
  }

  async function loadGenerationOptions() {
    const requestToken = ++optionsRequestRef.current;
    try {
      const settings = await api.getParentSettings();
      if (!mountedRef.current || optionsRequestRef.current !== requestToken) return;
      setTargetLanguage(settings.target_language);
    } catch {
      if (!mountedRef.current || optionsRequestRef.current !== requestToken) return;
      setTargetLanguage('');
    }
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

  async function reloadReviewAfterGeneration(requestToken: number): Promise<boolean> {
    try {
      const data = await api.getReviewSession(REVIEW_LIMIT);
      if (
        !mountedRef.current
        || generationRequestRef.current !== requestToken
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

  async function handleGenerateNextLesson() {
    if (generationInFlightRef.current || generationNeedsReviewReload) return;

    generationInFlightRef.current = true;
    const requestToken = ++generationRequestRef.current;
    setGenerating(true);
    setGenerationMessage(null);

    const isCurrentRequest = () => (
      mountedRef.current
      && generationRequestRef.current === requestToken
    );
    try {
      const result = await api.generateMorePhrases({ quantity: 1, topic: generationContext.trim() || undefined });
      if (!isCurrentRequest()) return;

      const reloaded = await reloadReviewAfterGeneration(requestToken);
      if (!isCurrentRequest()) return;

      setGenerationContext('');
      setGenerationMessage({
        tone: reloaded ? 'success' : 'warning',
        text: reloaded
          ? `Nova lição criada: ${result.lesson.title}. A revisão foi atualizada com as novas perguntas.`
          : `Nova lição criada: ${result.lesson.title}, mas a revisão não recarregou. Recarregue antes de gerar novamente.`,
      });
      setGenerationNeedsReviewReload(!reloaded);
    } catch (err) {
      if (!isCurrentRequest()) return;
      setGenerationMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : t("Não foi possível criar a próxima lição."),
      });
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
          ? t("Revisão recarregada. Confira as questões antes de gerar novamente.")
          : t("Ainda não foi possível recarregar a revisão."),
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
    setPhraseTranslationShown(false);
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
        title={t("Verificando acesso")}
        message={t("Confirmando seu cadastro...")}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }
  if (authState.status === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title={t("Servidor não disponível")}
        message={t("O sistema está temporariamente indisponível. Tente novamente em instantes.")}
        primaryAction={<Link href="/offline" className="app-button bg-primary-dark hover:bg-primary-dark">{t("Ver status")}</Link>}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }
  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title={t("Separando sua revisão")}
        message={t("O tutor está escolhendo palavras e questões que precisam de prática.")}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }
  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title={t("Tutor temporariamente indisponível")}
        message={t("Não foi possível carregar a revisão agora. Tente novamente em instantes.")}
        primaryAction={<Link href="/offline" className="app-button bg-primary-dark hover:bg-primary-dark">{t("Ver status")}</Link>}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }
  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title={t("A revisão não conseguiu se conectar")}
        message={t("Não foi possível carregar a revisão agora. Tente novamente em instantes.")}
        primaryAction={<button onClick={() => void loadReview()} className="app-button bg-brand-orange hover:bg-secondary-dark">{t("Tentar de novo")}</button>}
        secondaryHref="/offline"
        secondaryLabel={t("Trocar conexão")}
      />
    );
  }
  if (error) {
    return (
      <StatusCard
        tone="error"
        title={t("A revisão travou")}
        message={error.message}
        primaryAction={<button onClick={() => void loadReview()} className="app-button bg-brand-pink hover:bg-pink-500">{t("Recarregar revisão")}</button>}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }

  if (completed && reviewSession) {
    const total = reviewSession.items.length;
    return (
      <>
        <CelebrationOverlay show={showCelebration} />
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="app-surface mx-auto w-full max-w-lg border-accent/60 p-6 text-center md:p-10 celebrate-pop">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-light">
              <RotateCcw className="text-accent-dark" size={44} />
            </div>
            <h1 className="mt-5 text-3xl font-black text-slate-800">{t("Revisão concluída!")}</h1>
            <p className="mt-3 text-lg text-slate-600">
              <span className="font-black text-emerald-600">{masteredCount}</span> {t("dominadas ·")}{' '}
              <span className="font-black text-rose-600">{total - masteredCount}</span> {t("para praticar mais")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button onClick={() => void loadReview()} className="app-button justify-center bg-primary-dark hover:bg-primary-dark">{t("Praticar de novo")}</button>
              <Link href="/" className="rounded-full border-2 border-slate-200 px-5 py-3.5 font-bold text-slate-600">{t("Voltar ao início")}</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const generationPanel = (
    <section className="app-surface mb-6 border-violet-200 p-5" aria-labelledby="generate-review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="app-tag inline-flex items-center gap-1 text-xs"><Sparkles size={12} /> {t("IA")}</p>
          <h2 id="generate-review-title" className="mt-2 text-lg font-black text-slate-800">{t("Criar próxima lição")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("A IA cria a próxima lição de")} {targetLanguage || 'idioma'} {t("e adiciona novas perguntas na revisão.")}
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
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60"
        >
          <Sparkles size={16} /> {t("Criar próxima lição com IA")}
        </button>
      </div>

      {generationFormOpen && (
        <div id="review-question-generator-panel" className="mt-5 space-y-4 border-t border-violet-100 pt-5">
          <label className="block text-sm font-black text-slate-700">
            {t("Tema opcional")}
            <textarea
              value={generationContext}
              onChange={(event) => setGenerationContext(event.target.value)}
              maxLength={80}
              disabled={generating}
              rows={2}
              placeholder={t("Ex.: frases para viagem, entrevista ou rotina")}
              className="mt-2 w-full resize-y rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-400 disabled:opacity-60"
            />
            <span className="mt-1 block text-right text-xs font-bold text-slate-400">{generationContext.length}/80</span>
          </label>

          <p className="rounded-2xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700">{t("A próxima lição será criada em sequência, como Dia 6, Dia 7 e assim por diante.")}</p>

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
                className="app-button justify-center bg-amber-700 hover:bg-amber-800 disabled:opacity-60"
              >
                {generating ? <Loader2 size={17} className="animate-spin" /> : <RotateCcw size={17} />}
                {t("Recarregar revisão antes de tentar novamente")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleGenerateNextLesson()}
                disabled={generating}
                className="app-button justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
              >
                {generating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                {generating ? t("Criando próxima lição...") : t("Criar próxima lição")}
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
          <Link href="/" className="-ml-2 mb-5 inline-flex min-h-11 items-center gap-2 px-2 text-sm font-bold text-primary-dark"><ArrowLeft size={18} /> {t("Voltar")}</Link>
          {generationPanel}
          <div className="app-surface p-7 text-center">
            <Brain className="mx-auto text-slate-300" size={44} />
            <h1 className="mt-4 text-2xl font-black text-slate-800">{t("Nada pendente para revisar")}</h1>
            <p className="mt-2 text-sm text-slate-500">{t("Você pode criar a próxima lição com IA usando o formulário acima.")}</p>
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
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark"><ArrowLeft size={18} /> {t("Voltar")}</Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"><Brain size={12} /> {t("Revisão")}</span>
            <span className="app-tag text-xs">{currentIndex + 1}/{total}</span>
          </div>
        </div>

        {generationPanel}

        <div className="mb-5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-700 transition-all duration-500" style={{ width: `${progressWidth}%` }} />
        </div>

        {card.card_type === 'lesson_question' ? (
          <section className="app-surface border-violet-200 p-6 md:p-8" aria-label={t("Questão da lição")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-violet-700">{card.question_type.replaceAll('_', ' ')}</span>
              <span className="text-xs font-bold text-slate-400">{t("Questão da lição")}</span>
            </div>
            <h1 className="mt-6 text-2xl font-black leading-snug text-slate-800 md:text-3xl">{card.prompt}</h1>

            {phraseTranslationShown && card.prompt_translation && (
              <p className="mt-3 rounded-2xl bg-violet-50 px-4 py-3 text-base font-semibold text-slate-600" aria-live="polite">
                {card.prompt_translation}
              </p>
            )}

            {(card.prompt_translation || card.supporting_example_translation) && (
              <button
                type="button"
                onClick={() => setPhraseTranslationShown((shown) => !shown)}
                aria-expanded={phraseTranslationShown}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-violet-200 px-4 py-2 text-sm font-black text-violet-700 transition hover:bg-violet-50"
              >
                <Languages size={16} />
                {phraseTranslationShown ? t("Ocultar tradução da frase") : t("Ver tradução da frase")}
              </button>
            )}

            {!lessonAnswerRevealed ? (
              <button
                type="button"
                onClick={handleRevealLessonAnswer}
                disabled={submitting || reviewTransitionRef.current.advancementLocked}
                className="app-button mt-8 w-full justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
              >
                {t("Revelar resposta")}
              </button>
            ) : (
              <div className="mt-7 space-y-5" aria-live="polite">
                <div className="rounded-2xl bg-violet-50 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-violet-500">{t("Resposta")}</p>
                  <p className="mt-2 text-xl font-black text-slate-800">{card.answer}</p>
                  {card.supporting_example && (
                    <div className="mt-4 border-t border-violet-200 pt-4">
                      <p className="text-xs font-black uppercase tracking-widest text-violet-500">{t("Exemplo de apoio")}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{card.supporting_example}</p>
                      {phraseTranslationShown && card.supporting_example_translation && (
                        <p className="mt-1 text-sm font-semibold text-slate-500">{card.supporting_example_translation}</p>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-center text-sm font-bold text-slate-500">{t("Você sabia a resposta antes de revelar?")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void handleLessonQuestionAnswer(card, false)}
                    disabled={submitting || reviewTransitionRef.current.advancementLocked}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-4 font-black text-rose-700 disabled:opacity-60"
                  >
                    <XCircle size={18} /> {t("Não sabia")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLessonQuestionAnswer(card, true)}
                    disabled={submitting || reviewTransitionRef.current.advancementLocked}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-4 font-black text-emerald-700 disabled:opacity-60"
                  >
                    <CheckCircle2 size={18} /> {t("Sabia")}
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section aria-label={t("Revisão de vocabulário")}>
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
                      {t("Frente")}
                    </span>
                    <div className="flex items-center gap-2" aria-label={t("Velocidade do áudio")}>
                      {([0.5, 0.75, 1.0] as const).map((speed) => (
                        <button
                          type="button"
                          key={speed}
                          onClick={(event) => { event.stopPropagation(); setAudioSpeed(speed); }}
                          className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                            audioSpeed === speed
                              ? 'bg-emerald-700 text-white'
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
                      className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition hover:bg-emerald-800 active:scale-95 disabled:opacity-60"
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
                    {t("Virar carta ↻")}
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
                      {t("Verso")}
                    </span>
                    <span className="text-sm font-bold text-slate-400">{card.word_en}</span>
                  </div>

                  <div className="flex flex-1 flex-col items-center justify-center py-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("Tradução")}</p>
                    <p className="mt-2 text-center text-3xl font-black text-slate-800 md:text-4xl">
                      {card.word_pt}
                    </p>
                  </div>

                  {!chosenLevel ? (
                    <div>
                      <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                        {t("Como você se saiu?")}
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
                          ? t("Ótimo! Essa frase voltará mais tarde.")
                          : t("Sem problema. Ela voltará em breve para mais prática.")}
                      </p>
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={submitting || reviewTransitionRef.current.advancementLocked}
                        className={`flex w-full items-center justify-center rounded-2xl py-4 text-base font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-60 ${
                          chosenLevel.correct ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-primary-dark hover:bg-primary-dark'
                        }`}
                      >
                        {currentIndex < total - 1 ? t("Próxima carta →") : t("Ver resultado")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {card.difficulty_score > 0 && (
          <p className="mt-4 text-center text-xs font-bold text-slate-400">{t("Dificuldade:")} {Math.round(card.difficulty_score * 100)}% · {card.error_count} erros anteriores</p>
        )}
      </div>
    </main>
  );
}
