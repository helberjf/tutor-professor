'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Brain, CheckCircle2, ChevronRight, Loader2, RotateCcw, Volume2, XCircle } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type ReviewCard, type ReviewSession } from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';

export default function ReviewPage() {
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<0.5 | 0.75 | 1.0>(1.0);

  async function loadReview() {
    setLoading(true);
    try {
      const data = await api.getReviewSession(5);
      setReviewSession(data);
      setCurrentIndex(0);
      setSelectedOption(null);
      setIsCorrect(false);
      setCorrectCount(0);
      setCompleted(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar as frases de revisao.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReview();
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
    } catch (err) {
      console.error('Audio error:', err);
    } finally {
      setAudioLoading(false);
    }
  }

  async function handleAnswer(option: string) {
    if (!reviewSession || selectedOption) {
      return;
    }

    const card = reviewSession.items[currentIndex];
    const nextIsCorrect = option === card.word_pt;
    setSelectedOption(option);
    setIsCorrect(nextIsCorrect);

    try {
      await api.submitReviewAttempt({
        review_item_id: card.review_item_id,
        word_en: card.word_en,
        word_pt: card.word_pt,
        correct: nextIsCorrect,
      });
      if (nextIsCorrect) {
        setCorrectCount((value) => value + 1);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel salvar o progresso da revisao.'));
    }
  }

  function handleNext() {
    if (!reviewSession) {
      return;
    }

    if (currentIndex < reviewSession.items.length - 1) {
      setCurrentIndex((value) => value + 1);
      setSelectedOption(null);
      setIsCorrect(false);
      return;
    }

    setCompleted(true);
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
        message="Este aparelho precisa da URL atual do backend antes de carregar a revisao. Abra a pagina de conexao e salve a URL HTTPS do tunnel do seu computador."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Abrir configuracao de conexao
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
        message="O backend parece offline. Inicie a API e o Cloudflare Tunnel no seu computador e tente esta pagina novamente."
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

  if (error && !reviewSession) {
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

  if (completed) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="kid-surface border-accent/60 p-6 text-center md:p-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-light md:h-28 md:w-28">
              <RotateCcw className="text-accent-dark" size={52} />
            </div>
            <h1 className="mt-5 text-3xl font-black text-slate-800 md:mt-6 md:text-5xl">Revisao concluida!</h1>
            <p className="mt-4 text-lg text-slate-600 md:mt-5 md:text-2xl">
              Voce acertou <span className="font-black text-slate-800">{correctCount}</span> de{' '}
              <span className="font-black text-slate-800">{reviewSession.items.length}</span>.
            </p>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-600 md:text-xl md:leading-9">
              Frases mais dificeis voltam mais cedo, e as mais faceis esperam mais. E assim que a revisao inteligente cresce com voce.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button onClick={() => void loadReview()} className="kid-button bg-primary hover:bg-primary-dark">
                Praticar de novo
              </button>
              <Link
                href="/"
                className="rounded-full border-2 border-slate-200 px-5 py-3.5 text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary md:px-6 md:py-4 md:text-lg"
              >
                Voltar ao inicio
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const card = reviewSession.items[currentIndex];

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-base font-bold text-primary-dark hover:text-primary md:text-lg">
            <ArrowLeft size={22} /> Voltar
          </Link>
          <p className="kid-tag">
            Revisao {currentIndex + 1} de {reviewSession.items.length}
          </p>
        </div>

        <div className="kid-surface border-accent/40 p-5 md:p-10">
          <div className="grid gap-6 md:gap-8 lg:grid-cols-[1fr,0.95fr]">
            <section>
              <div className="inline-flex rounded-[1.25rem] bg-accent-light p-3 md:rounded-[1.5rem] md:p-4">
                <Brain className="text-accent-dark" size={28} />
              </div>
              <h1 className="mt-4 text-4xl font-black text-slate-800 md:mt-5 md:text-7xl">{card.word_en}</h1>
              <p className="mt-3 text-lg leading-8 text-slate-600 md:mt-4 md:text-xl md:leading-9">
                Frases com mais erros aparecem com mais frequencia. Vamos deixar esta mais facil.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => void playAudio(card.word_en)}
                  disabled={audioLoading}
                  className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-[0_18px_40px_rgba(34,197,94,0.25)] transition hover:scale-105 hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-70 md:h-20 md:w-20"
                  aria-label={`Play ${card.word_en}`}
                >
                  {audioLoading ? <Loader2 size={28} className="animate-spin md:h-[34px] md:w-[34px]" /> : <Volume2 size={28} className="md:h-[34px] md:w-[34px]" />}
                </button>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Velocidade</span>
                  <div className="flex gap-2">
                    {([0.5, 0.75, 1.0] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setAudioSpeed(speed)}
                        className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                          audioSpeed === speed
                            ? 'bg-accent text-white'
                            : 'border border-slate-200 text-slate-500 hover:border-accent hover:text-accent-dark'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] bg-white p-5 shadow-inner ring-1 ring-slate-100 md:rounded-[1.75rem] md:p-6">
              <p className="text-xl font-black text-slate-800 md:text-2xl">{card.prompt}</p>
              <div className="mt-6 grid gap-4">
                {card.options.map((option) => {
                  const isChosen = selectedOption === option;
                  const optionClass = !selectedOption
                    ? 'border-slate-200 hover:border-accent hover:bg-accent-light'
                    : option === card.word_pt
                      ? 'border-accent bg-accent-light text-accent-dark'
                      : isChosen
                        ? 'border-kid-pink bg-rose-50 text-rose-700'
                        : 'border-slate-200 opacity-70';

                  return (
                    <button
                      key={option}
                      onClick={() => void handleAnswer(option)}
                      disabled={Boolean(selectedOption)}
                      className={`rounded-[1.25rem] border-2 px-4 py-3.5 text-left text-lg font-bold transition md:rounded-[1.5rem] md:px-5 md:py-4 md:text-2xl ${optionClass}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {selectedOption ? (
                <div className="mt-6 rounded-[1.25rem] bg-slate-50 p-4 md:rounded-[1.5rem] md:p-6">
                  <div className="flex items-center gap-3">
                    {isCorrect ? (
                      <CheckCircle2 className="text-accent-dark" size={32} />
                    ) : (
                      <XCircle className="text-rose-600" size={32} />
                    )}
                    <p className={`text-xl font-black md:text-2xl ${isCorrect ? 'text-accent-dark' : 'text-rose-600'}`}>
                      {isCorrect ? 'Boa memoria!' : 'Essa vai voltar em breve.'}
                    </p>
                  </div>
                  <p className="mt-4 text-lg text-slate-700 md:text-xl">
                    <span className="font-black">{card.word_en}</span> significa{' '}
                    <span className="font-black">{card.word_pt}</span>.
                  </p>
                  {error ? <p className="mt-4 text-sm font-bold text-kid-pink">{error.message}</p> : null}
                  <button onClick={handleNext} className="kid-button mt-6 bg-accent-dark hover:bg-accent">
                    {currentIndex < reviewSession.items.length - 1 ? 'Proximo cartao' : 'Finalizar revisao'}
                    <ChevronRight className="ml-2" size={20} />
                  </button>
                </div>
              ) : (
                <p className="mt-6 text-base font-bold uppercase tracking-[0.15em] text-slate-400">
                  Escolha uma resposta para testar sua memoria.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
