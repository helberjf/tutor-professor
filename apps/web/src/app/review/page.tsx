'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Brain, CheckCircle2, ChevronRight, RotateCcw, Volume2, XCircle } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type ReviewCard, type ReviewSession } from '@/lib/api';

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
      setError(err instanceof ApiError ? err : new ApiError('Could not load review words.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReview();
  }, []);

  async function playAudio(text: string) {
    setAudioLoading(true);
    try {
      const data = await api.speak(text);
      if (data.audio_url) {
        const audio = new Audio(api.getAudioUrl(data.audio_url));
        await audio.play();
      }
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
      setError(err instanceof ApiError ? err : new ApiError('Could not save review progress.'));
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
        title="Gathering your review words"
        message="The tutor is picking the words that need a little extra practice."
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="Review could not connect"
        message="The backend looks offline. Start it, then try this page again."
        primaryAction={
          <button onClick={() => void loadReview()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Try Again
          </button>
        }
        secondaryHref="/offline"
        secondaryLabel="Offline Help"
      />
    );
  }

  if (error && !reviewSession) {
    return (
      <StatusCard
        tone="error"
        title="Review is stuck"
        message={error.message}
        primaryAction={
          <button onClick={() => void loadReview()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Reload Review
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  if (!reviewSession || reviewSession.items.length === 0) {
    return (
      <StatusCard
        tone="empty"
        title="No review words yet"
        message="Finish a lesson first. The tutor will save tricky words here and bring them back at the right time."
        secondaryHref="/lesson"
        secondaryLabel="Start a Lesson"
      />
    );
  }

  if (completed) {
    return (
      <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="kid-surface border-accent/60 p-10 text-center">
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-accent-light">
              <RotateCcw className="text-accent-dark" size={68} />
            </div>
            <h1 className="mt-6 text-5xl font-black text-slate-800">Review done!</h1>
            <p className="mt-5 text-2xl text-slate-600">
              You got <span className="font-black text-slate-800">{correctCount}</span> out of{' '}
              <span className="font-black text-slate-800">{reviewSession.items.length}</span> correct.
            </p>
            <p className="mx-auto mt-5 max-w-xl text-xl leading-9 text-slate-600">
              Hard words will come back sooner, and easy words will wait longer. That is how your smart review grows with you.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button onClick={() => void loadReview()} className="kid-button bg-primary hover:bg-primary-dark">
                Practice Again
              </button>
              <Link
                href="/"
                className="rounded-full border-2 border-slate-200 px-6 py-4 text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
              >
                Back Home
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const card = reviewSession.items[currentIndex];

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Back
          </Link>
          <p className="kid-tag">
            Review {currentIndex + 1} of {reviewSession.items.length}
          </p>
        </div>

        <div className="kid-surface border-accent/40 p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr,0.95fr]">
            <section>
              <div className="inline-flex rounded-[1.5rem] bg-accent-light p-4">
                <Brain className="text-accent-dark" size={34} />
              </div>
              <h1 className="mt-5 text-6xl font-black text-slate-800 md:text-7xl">{card.word_en}</h1>
              <p className="mt-4 text-xl leading-9 text-slate-600">
                Words with more mistakes show up more often. Let&apos;s make this one feel easy.
              </p>
              <button
                onClick={() => void playAudio(card.word_en)}
                disabled={audioLoading}
                className="mt-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-accent text-white shadow-[0_18px_40px_rgba(34,197,94,0.25)] transition hover:scale-105 hover:bg-accent-dark"
                aria-label={`Play ${card.word_en}`}
              >
                <Volume2 size={34} />
              </button>
            </section>

            <section className="rounded-[1.75rem] bg-white p-6 shadow-inner ring-1 ring-slate-100">
              <p className="text-2xl font-black text-slate-800">{card.prompt}</p>
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
                      className={`rounded-[1.5rem] border-2 px-5 py-4 text-left text-2xl font-bold transition ${optionClass}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {selectedOption ? (
                <div className="mt-6 rounded-[1.5rem] bg-slate-50 p-6">
                  <div className="flex items-center gap-3">
                    {isCorrect ? (
                      <CheckCircle2 className="text-accent-dark" size={32} />
                    ) : (
                      <XCircle className="text-rose-600" size={32} />
                    )}
                    <p className={`text-2xl font-black ${isCorrect ? 'text-accent-dark' : 'text-rose-600'}`}>
                      {isCorrect ? 'Nice remembering!' : 'That one will come back soon.'}
                    </p>
                  </div>
                  <p className="mt-4 text-xl text-slate-700">
                    <span className="font-black">{card.word_en}</span> means{' '}
                    <span className="font-black">{card.word_pt}</span>.
                  </p>
                  {error ? <p className="mt-4 text-sm font-bold text-kid-pink">{error.message}</p> : null}
                  <button onClick={handleNext} className="kid-button mt-6 bg-accent-dark hover:bg-accent">
                    {currentIndex < reviewSession.items.length - 1 ? 'Next Review Card' : 'Finish Review'}
                    <ChevronRight className="ml-2" size={20} />
                  </button>
                </div>
              ) : (
                <p className="mt-6 text-base font-bold uppercase tracking-[0.15em] text-slate-400">
                  Choose one answer to check your memory.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
