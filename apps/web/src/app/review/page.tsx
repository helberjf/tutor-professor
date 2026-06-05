'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Brain, Loader2, RotateCcw, Volume2 } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { CelebrationOverlay } from '@/components/celebration';
import { ApiError, api, type ReviewCard, type ReviewSession } from '@/lib/api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { playAudioWithFallback } from '@/lib/browser-speech';

interface ConfidenceLevel {
  value: 0 | 1 | 2 | 3;
  label: string;
  emoji: string;
  bg: string;
  border: string;
  text: string;
  correct: boolean;
}

const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  { value: 0, label: 'Não sei',       emoji: '😵', bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-700',    correct: false },
  { value: 1, label: 'Dúvida',        emoji: '🤔', bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-700',   correct: false },
  { value: 2, label: 'Quase certeza', emoji: '😊', bg: 'bg-sky-50',     border: 'border-sky-300',    text: 'text-sky-700',     correct: true  },
  { value: 3, label: 'Sei!',          emoji: '🎉', bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', correct: true  },
];

export default function ReviewPage() {
  const authState = useRequireAuth();
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [chosenLevel, setChosenLevel] = useState<ConfidenceLevel | null>(null);
  const [masteredCount, setMasteredCount] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<0.5 | 0.75 | 1.0>(1.0);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  async function loadReview() {
    setLoading(true);
    setCompleted(false);
    setFlipped(false);
    setChosenLevel(null);
    setCurrentIndex(0);
    setMasteredCount(0);
    setError(null);
    setShowCelebration(false);
    try {
      const data = await api.getReviewSession(8);
      setReviewSession(data);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar as frases de revisao.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // silent
    } finally {
      setAudioLoading(false);
    }
  }

  function handleFlip() {
    if (chosenLevel) return;
    setFlipped(true);
  }

  async function handleConfidence(level: ConfidenceLevel) {
    if (!reviewSession || chosenLevel || submitting) return;

    setChosenLevel(level);
    setSubmitting(true);
    if (level.correct) setMasteredCount((v) => v + 1);

    const card = reviewSession.items[currentIndex];
    try {
      await api.submitReviewAttempt({
        review_item_id: card.review_item_id,
        word_en: card.word_en,
        word_pt: card.word_pt,
        correct: level.correct,
      });
    } catch {
      // best-effort
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!reviewSession) return;
    if (currentIndex < reviewSession.items.length - 1) {
      setFlipped(false);
      setChosenLevel(null);
      // small delay so the unflip animation runs before switching card
      setTimeout(() => setCurrentIndex((v) => v + 1), 220);
    } else {
      setShowCelebration(true);
      setCompleted(true);
    }
  }

  // ─── Auth guards ──────────────────────────────────────────────────────────

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
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Separando suas frases de revisao"
        message="O tutor esta escolhendo as frases que precisam de um pouco mais de pratica."
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
        message="Este aparelho precisa da URL atual do backend. Abra a pagina de conexao e salve a URL HTTPS do tunnel."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Abrir configuracao
          </Link>
        }
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
        message="O backend parece offline. Inicie a API e o Cloudflare Tunnel no seu computador e tente novamente."
        primaryAction={
          <button onClick={() => void loadReview()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Tentar de novo
          </button>
        }
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
        primaryAction={
          <button onClick={() => void loadReview()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Recarregar revisao
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (!reviewSession || reviewSession.items.length === 0) {
    return (
      <StatusCard
        tone="empty"
        title="Ainda nao ha frases para revisar"
        message="Termine uma licao primeiro. O tutor vai salvar aqui as frases mais dificeis e trazelas de volta na hora certa."
        secondaryHref="/lesson"
        secondaryLabel="Comecar uma licao"
      />
    );
  }

  // ─── Completed ────────────────────────────────────────────────────────────

  if (completed) {
    const total = reviewSession.items.length;
    return (
      <>
        <CelebrationOverlay show={showCelebration} />
        <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
          <div className="mx-auto max-w-lg">
            <div className="kid-surface border-accent/60 p-6 text-center md:p-10 celebrate-pop">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-light md:h-24 md:w-24">
                <RotateCcw className="text-accent-dark" size={44} />
              </div>
              <h1 className="mt-5 text-3xl font-black text-slate-800 md:text-4xl">Revisao concluida!</h1>
              <p className="mt-3 text-lg text-slate-600">
                <span className="font-black text-emerald-600">{masteredCount}</span> dominadas &nbsp;·&nbsp;{' '}
                <span className="font-black text-rose-600">{total - masteredCount}</span> para praticar mais
              </p>
              <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${Math.round((masteredCount / total) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-bold text-slate-400">
                Palavras com duvida voltam mais cedo, dominadas voltam depois.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button onClick={() => void loadReview()} className="kid-button bg-primary hover:bg-primary-dark">
                  Praticar de novo
                </button>
                <Link
                  href="/"
                  className="rounded-full border-2 border-slate-200 px-5 py-3.5 text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                >
                  Voltar ao inicio
                </Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ─── Flashcard ────────────────────────────────────────────────────────────

  const card: ReviewCard = reviewSession.items[currentIndex];
  const total = reviewSession.items.length;
  const progressWidth = ((currentIndex + 1) / total) * 100;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-lg">

        {/* Nav + progress */}
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={18} /> Voltar
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              <Brain size={12} /> Revisao
            </span>
            <span className="kid-tag text-xs">{currentIndex + 1}/{total}</span>
          </div>
        </div>

        <div className="mb-6 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        {/* ── 3-D Flashcard ─────────────────────────────────────────────── */}
        <div
          className="flashcard-scene mb-4"
          style={{ perspective: '1200px', minHeight: '260px' }}
        >
          <div
            className="flashcard-inner relative w-full transition-transform duration-500"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: '260px',
            }}
          >
            {/* ── FRONT ─ target-language word ─────────────────────────── */}
            <div
              className="flashcard-face absolute inset-0 flex flex-col rounded-[1.75rem] border-2 border-emerald-200 bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] md:p-8"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-emerald-700">
                  Frente
                </span>
                <div className="flex items-center gap-2">
                  {([0.5, 0.75, 1.0] as const).map((speed) => (
                    <button
                      key={speed}
                      onClick={(e) => { e.stopPropagation(); setAudioSpeed(speed); }}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                        audioSpeed === speed
                          ? 'bg-emerald-500 text-white'
                          : 'border border-slate-200 text-slate-500 hover:border-emerald-400'
                      }`}
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
                  onClick={(e) => { e.stopPropagation(); void playAudio(card.word_en); }}
                  disabled={audioLoading}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition hover:bg-emerald-600 active:scale-95 disabled:opacity-60"
                  aria-label={`Ouvir: ${card.word_en}`}
                >
                  {audioLoading ? <Loader2 size={22} className="animate-spin" /> : <Volume2 size={22} />}
                </button>
              </div>

              {/* Tap-to-flip hint */}
              <button
                onClick={handleFlip}
                className="mt-2 w-full rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-black text-slate-400 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600"
              >
                Virar carta →
              </button>
            </div>

            {/* ── BACK ─ translation + confidence ──────────────────────── */}
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

              {/* Confidence buttons */}
              {!chosenLevel ? (
                <div>
                  <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    Como voce se saiu?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {CONFIDENCE_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => void handleConfidence(level)}
                        disabled={submitting}
                        className={`rounded-2xl border-2 px-3 py-3 text-center font-bold transition active:scale-[.97] hover:scale-[1.02] disabled:opacity-60 ${level.bg} ${level.border} ${level.text}`}
                      >
                        <span className="block text-xl">{level.emoji}</span>
                        <span className="mt-0.5 block text-xs">{level.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="mb-3 text-center text-sm font-semibold text-slate-500">
                    {chosenLevel.correct
                      ? 'Otimo! Essa frase voltara mais tarde.'
                      : 'Sem problema. Ela voltara em breve para mais pratica.'}
                  </p>
                  <button
                    onClick={handleNext}
                    disabled={submitting}
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

        {/* Difficulty indicator */}
        {card.difficulty_score > 0 && (
          <p className="text-center text-xs font-bold text-slate-400">
            Dificuldade: {Math.round(card.difficulty_score * 100)}% · {card.error_count} erros anteriores
          </p>
        )}
      </div>
    </main>
  );
}
