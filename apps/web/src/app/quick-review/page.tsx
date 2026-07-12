'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Volume2, XCircle, Zap } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { CelebrationOverlay } from '@/components/celebration';
import { ApiError, api, type ReviewCard, type ReviewSession } from '@/lib/api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { playAudioWithFallback } from '@/lib/browser-speech';

export default function QuickReviewPage() {
  const authState = useRequireAuth();
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  async function loadSession() {
    setLoading(true);
    setCompleted(false);
    setSelectedOption(null);
    setCurrentIndex(0);
    setCorrectCount(0);
    setError(null);
    setShowCelebration(false);
    try {
      const data = await api.getReviewSession(15, { vocabularyOnly: true });
      setSession(data);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar a revisao.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authState.status === 'authenticated') {
      void loadSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.status]);

  async function playAudio(text: string) {
    setAudioLoading(true);
    try {
      const data = await api.speak(text);
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || text,
        1.0,
      );
    } catch {
      // silent
    } finally {
      setAudioLoading(false);
    }
  }

  async function handleSelect(option: string) {
    if (!session || selectedOption || submitting) return;

    const card = session.items[currentIndex];
    const isCorrect = option === card.word_pt;
    setSelectedOption(option);
    setSubmitting(true);
    if (isCorrect) setCorrectCount((v) => v + 1);

    try {
      await api.submitReviewAttempt({
        review_item_id: card.review_item_id,
        word_en: card.word_en,
        word_pt: card.word_pt,
        correct: isCorrect,
      });
    } catch {
      // best-effort
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!session) return;
    if (currentIndex < session.items.length - 1) {
      setCurrentIndex((v) => v + 1);
      setSelectedOption(null);
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
        message="Ative o backend para acessar a revisao rapida."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  // ─── Loading / error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Preparando as palavras"
        message="O tutor esta selecionando as palavras para revisar agora."
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
        message="Este aparelho precisa da URL do backend. Abra a pagina de conexao e salve a URL do tunnel."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>
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
        title="Sem conexao com o tutor"
        message="Inicie a API e o Cloudflare Tunnel no seu computador e tente de novo."
        primaryAction={
          <button onClick={() => void loadSession()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
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
        title="Nao foi possivel carregar"
        message={error.message}
        primaryAction={
          <button onClick={() => void loadSession()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Tentar de novo
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (!session || session.items.length === 0) {
    return (
      <StatusCard
        tone="empty"
        title="Nenhuma palavra para revisar"
        message="Termine uma licao primeiro. As palavras aparecerao aqui para revisao rapida."
        secondaryHref="/lesson"
        secondaryLabel="Comecar uma licao"
      />
    );
  }

  // ─── Completed ────────────────────────────────────────────────────────────

  if (completed) {
    const total = session.items.length;
    const pct = Math.round((correctCount / total) * 100);
    return (
      <>
        <CelebrationOverlay show={showCelebration} />
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="mx-auto w-full max-w-sm">
            <div className="kid-surface border-accent/60 p-6 text-center md:p-8 celebrate-pop">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-light">
                <CheckCircle2 className="text-accent-dark" size={44} />
              </div>
              <p className="kid-tag text-xs">Revisao Rapida</p>
              <h1 className="mt-3 text-3xl font-black text-slate-800">
                {pct >= 80 ? 'Incrivel!' : pct >= 50 ? 'Muito bem!' : 'Continue praticando!'}
              </h1>
              <p className="mt-2 text-lg text-slate-600">
                <span className="font-black text-slate-800">{correctCount}</span> de{' '}
                <span className="font-black text-slate-800">{total}</span> corretas
              </p>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-bold text-slate-500">{pct}% de acerto</p>
              <div className="mt-7 flex flex-col gap-3">
                <button
                  onClick={() => void loadSession()}
                  className="kid-button w-full justify-center bg-primary hover:bg-primary-dark"
                >
                  Revisar de novo
                </button>
                <Link
                  href="/"
                  className="rounded-full border-2 border-slate-200 px-5 py-3.5 text-center text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary"
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

  // ─── Main card ────────────────────────────────────────────────────────────

  const card: ReviewCard = session.items[currentIndex];
  const total = session.items.length;
  const progressWidth = ((currentIndex + 1) / total) * 100;
  const options = card.options.slice(0, 3);

  return (
    <main className="flex min-h-screen flex-col px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-sm">

        {/* Nav */}
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={18} /> Sair
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
              <Zap size={12} /> Revisao Rapida
            </span>
            <span className="kid-tag text-xs">{currentIndex + 1}/{total}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        {/* Score pills */}
        <div className="mb-4 flex justify-center gap-3">
          <span className="rounded-full bg-accent-light px-3 py-1 text-xs font-bold text-accent-dark">
            ✓ {correctCount} certas
          </span>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">
            ✗ {currentIndex - correctCount} erradas
          </span>
        </div>

        {/* Card */}
        <div className="kid-surface border-primary/30 p-6 md:p-8">
          {/* English word + audio */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">O que significa?</p>
              <h1 className="mt-2 text-4xl font-black leading-tight text-slate-800 md:text-5xl">
                {card.word_en}
              </h1>
            </div>
            <button
              onClick={() => void playAudio(card.word_en)}
              disabled={audioLoading}
              className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_20px_rgba(14,165,233,0.30)] transition active:scale-95 hover:bg-primary-dark disabled:opacity-60"
              aria-label={`Ouvir: ${card.word_en}`}
            >
              {audioLoading ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
            </button>
          </div>

          <div className="my-5 h-px bg-slate-100" />

          {/* Options */}
          <div className="flex flex-col gap-3">
            {options.map((option) => {
              const chosen = selectedOption === option;
              const isCorrect = option === card.word_pt;
              let cls = 'rounded-2xl border-2 px-4 py-4 text-left text-lg font-bold transition active:scale-[.98] w-full ';

              if (!selectedOption) {
                cls += 'border-slate-200 bg-white hover:border-primary hover:bg-primary-light cursor-pointer';
              } else if (isCorrect) {
                cls += 'border-accent bg-accent-light text-accent-dark';
              } else if (chosen) {
                cls += 'border-rose-300 bg-rose-50 text-rose-700';
              } else {
                cls += 'border-slate-100 bg-slate-50 text-slate-400';
              }

              return (
                <button
                  key={option}
                  onClick={() => void handleSelect(option)}
                  disabled={Boolean(selectedOption) || submitting}
                  className={cls}
                >
                  <span className="flex items-center gap-2">
                    {selectedOption && isCorrect && <CheckCircle2 size={18} className="shrink-0 text-accent-dark" />}
                    {selectedOption && chosen && !isCorrect && <XCircle size={18} className="shrink-0 text-rose-600" />}
                    {option}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Feedback + Next */}
          {selectedOption && (
            <div className="mt-5">
              <p className={`text-center text-base font-black ${selectedOption === card.word_pt ? 'text-accent-dark' : 'text-rose-600'}`}>
                {selectedOption === card.word_pt
                  ? '🎉 Acertou!'
                  : `💪 Era: "${card.word_pt}"`}
              </p>
              <button
                onClick={handleNext}
                disabled={submitting}
                className={`mt-4 flex w-full items-center justify-center rounded-2xl py-4 text-lg font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-60 ${
                  selectedOption === card.word_pt ? 'bg-accent hover:bg-accent-dark' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {currentIndex < total - 1 ? 'Proxima →' : 'Ver resultado'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
