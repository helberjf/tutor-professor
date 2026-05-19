'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, ThumbsDown, ThumbsUp, Volume2, Zap } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type ReviewCard, type ReviewSession } from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';

export default function QuickReviewPage() {
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [knewIt, setKnewIt] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function loadSession() {
    setLoading(true);
    try {
      const data = await api.getReviewSession(15);
      setSession(data);
      setCurrentIndex(0);
      setRevealed(false);
      setKnewIt(null);
      setCorrectCount(0);
      setCompleted(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar a revisao.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

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

  async function handleKnew(correct: boolean) {
    if (!session || submitting || knewIt !== null) return;

    const card = session.items[currentIndex];
    setKnewIt(correct);
    setSubmitting(true);
    if (correct) setCorrectCount((v) => v + 1);

    try {
      await api.submitReviewAttempt({
        review_item_id: card.review_item_id,
        word_en: card.word_en,
        word_pt: card.word_pt,
        correct,
      });
    } catch {
      // progress saved best-effort
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!session) return;
    if (currentIndex < session.items.length - 1) {
      setCurrentIndex((v) => v + 1);
      setRevealed(false);
      setKnewIt(null);
    } else {
      setCompleted(true);
    }
  }

  // ─── Loading / error states ───────────────────────────────────────────────

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
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Conectar
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
        message="Termine uma licao primeiro. As palavras aparecern aqui para revisao rapida."
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
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="kid-surface border-accent/60 p-6 text-center md:p-8">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-light">
              <CheckCircle2 className="text-accent-dark" size={44} />
            </div>
            <p className="kid-tag text-xs">Revisao rapida</p>
            <h1 className="mt-3 text-3xl font-black text-slate-800">Muito bem!</h1>
            <p className="mt-2 text-lg text-slate-600">
              <span className="font-black text-slate-800">{correctCount}</span> de{' '}
              <span className="font-black text-slate-800">{total}</span> palavras corretas
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
    );
  }

  // ─── Main flashcard ───────────────────────────────────────────────────────

  const card: ReviewCard = session.items[currentIndex];
  const total = session.items.length;
  const progressWidth = ((currentIndex + 1) / total) * 100;

  return (
    <>
      <main className="flex min-h-screen flex-col pb-36 px-4 py-6 md:px-8 md:py-8">
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

          {/* Progress bar */}
          <div className="mb-5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          {/* Flashcard */}
          <div
            className={`kid-surface cursor-pointer select-none overflow-hidden transition-all duration-200 active:scale-[.98] ${
              !revealed ? 'border-primary/30' : knewIt === true ? 'border-accent' : knewIt === false ? 'border-kid-pink' : 'border-accent/30'
            }`}
            onClick={() => { if (!revealed) setRevealed(true); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (!revealed) setRevealed(true); } }}
            aria-label={revealed ? 'Cartao revelado' : 'Toque para revelar a traducao'}
          >
            <div className="p-6 md:p-8">

              {/* English word */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ingles</p>
                  <h1 className="mt-2 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
                    {card.word_en}
                  </h1>
                </div>

                {/* Play button */}
                <button
                  onClick={(e) => { e.stopPropagation(); void playAudio(card.word_en); }}
                  disabled={audioLoading}
                  className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_20px_rgba(14,165,233,0.30)] transition active:scale-95 hover:bg-primary-dark disabled:opacity-60"
                  aria-label={`Ouvir: ${card.word_en}`}
                >
                  {audioLoading ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                </button>
              </div>

              {/* Divider */}
              <div className="my-5 h-px bg-slate-100" />

              {/* Translation — revealed state */}
              {revealed ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Portugues</p>
                  <p className="mt-2 text-2xl font-black text-slate-700 md:text-3xl">{card.word_pt}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="rounded-2xl bg-primary-light px-5 py-3">
                    <p className="text-sm font-black text-primary-dark">Toque para revelar a traducao</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Score pills */}
          <div className="mt-4 flex justify-center gap-3">
            <span className="rounded-full bg-accent-light px-3 py-1 text-xs font-bold text-accent-dark">
              ✓ {correctCount} sabia
            </span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">
              ✗ {currentIndex - correctCount + (knewIt !== null ? 0 : 0)} nao sabia
            </span>
          </div>

        </div>
      </main>

      {/* Sticky bottom actions */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm md:px-8">
        <div className="mx-auto max-w-sm">
          {!revealed ? (
            /* Before reveal: single "Revelar" button */
            <button
              onClick={() => setRevealed(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-lg font-black text-white shadow-[0_8px_24px_rgba(14,165,233,0.30)] transition active:scale-[.98] hover:bg-primary-dark"
            >
              Revelar traducao
            </button>
          ) : knewIt === null ? (
            /* After reveal, before choosing: two choice buttons */
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void handleKnew(false)}
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 py-4 text-base font-black text-rose-600 transition active:scale-[.98] hover:bg-rose-100 disabled:opacity-60"
              >
                <ThumbsDown size={20} />
                Nao sabia
              </button>
              <button
                onClick={() => void handleKnew(true)}
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-accent bg-accent-light py-4 text-base font-black text-accent-dark transition active:scale-[.98] hover:bg-emerald-100 disabled:opacity-60"
              >
                <ThumbsUp size={20} />
                Sabia!
              </button>
            </div>
          ) : (
            /* After choosing: next button */
            <button
              onClick={handleNext}
              disabled={submitting}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-60 ${
                knewIt ? 'bg-accent hover:bg-accent-dark' : 'bg-primary hover:bg-primary-dark'
              }`}
            >
              {knewIt ? '🎉 ' : '💪 '}
              {currentIndex < total - 1 ? 'Proxima palavra' : 'Ver resultado'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
