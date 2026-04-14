'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronRight, Star, Trophy, XCircle } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type Quiz, type QuizSubmitResponse } from '@/lib/api';

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <StatusCard
          tone="loading"
          title="Setting up the quiz"
          message="The tutor is finding today's questions and score stars."
          secondaryHref="/"
          secondaryLabel="Back Home"
        />
      }
    >
      <QuizPageContent />
    </Suspense>
  );
}

function QuizPageContent() {
  const searchParams = useSearchParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<QuizSubmitResponse | null>(null);

  async function loadQuiz() {
    setLoading(true);
    try {
      const lessonIdParam = searchParams.get('lessonId');
      const lessonId = lessonIdParam ? Number(lessonIdParam) : undefined;
      const data = await api.getTodayQuiz(Number.isFinite(lessonId) ? lessonId : undefined);
      setQuiz(data);
      setCurrentIndex(0);
      setSelectedOption(null);
      setScore(0);
      setFinished(false);
      setSubmitMessage(null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Could not load the quiz.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuiz();
  }, [searchParams]);

  async function handleNext() {
    if (!quiz || !selectedOption) {
      return;
    }

    const question = quiz.questions[currentIndex];
    const nextScore = selectedOption === question.correct_option ? score + 1 : score;
    setScore(nextScore);

    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((value) => value + 1);
      setSelectedOption(null);
      return;
    }

    setSavingResult(true);
    try {
      const response = await api.submitQuiz({
        lesson_id: quiz.lesson_id,
        score: nextScore,
        total_questions: quiz.questions.length,
      });
      setSubmitMessage(response);
      setFinished(true);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Could not save the quiz result.'));
    } finally {
      setSavingResult(false);
    }
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Setting up the quiz"
        message="The tutor is finding today's questions and score stars."
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title="Connect the tutor first"
        message="This device needs the current backend URL before quizzes can load. Open the connection page and save the HTTPS tunnel URL from your computer."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Open Connection Setup
          </Link>
        }
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="The quiz could not connect"
        message="The backend is offline right now. Start the API and Cloudflare Tunnel on your computer, then try again."
        primaryAction={
          <button onClick={() => void loadQuiz()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Try Again
          </button>
        }
        secondaryHref="/connect"
        secondaryLabel="Change Connection"
      />
    );
  }

  if (error) {
    return (
      <StatusCard
        tone="error"
        title="The quiz got tangled"
        message={error.message}
        primaryAction={
          <button onClick={() => void loadQuiz()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Reload Quiz
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  if (!quiz || quiz.questions.length === 0) {
    return (
      <StatusCard
        tone="empty"
        title="No quiz yet"
        message="We could not find quiz questions. Add quiz JSON content and come back."
        secondaryHref="/lesson"
        secondaryLabel="Go to Lesson"
      />
    );
  }

  if (finished) {
    const total = quiz.questions.length;
    const percentage = Math.round((score / total) * 100);
    const stars = percentage === 100 ? 3 : percentage >= 60 ? 2 : 1;

    return (
      <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="kid-surface border-secondary/60 p-10 text-center">
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-secondary-light">
              <Trophy className="text-secondary-dark" size={70} />
            </div>
            <h1 className="mt-6 text-5xl font-black text-slate-800">Quiz complete!</h1>
            <p className="mt-4 text-2xl text-slate-600">
              You scored <span className="font-black text-slate-800">{score}</span> out of{' '}
              <span className="font-black text-slate-800">{total}</span>.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Star
                  key={index}
                  className={index < stars ? 'fill-secondary text-secondary-dark' : 'text-slate-300'}
                  size={34}
                />
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-xl text-xl leading-9 text-slate-600">
              {submitMessage?.encouragement || buildFallbackMessage(percentage)}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/review" className="kid-button bg-primary hover:bg-primary-dark">
                Practice Review Words
              </Link>
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

  const question = quiz.questions[currentIndex];
  const isCorrect = selectedOption === question.correct_option;

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Back
          </Link>
          <p className="kid-tag">
            Question {currentIndex + 1} of {quiz.questions.length}
          </p>
        </div>

        <div className="kid-surface border-secondary/50 p-8 md:p-10">
          <p className="kid-tag">Quiz Time</p>
          <h1 className="mt-5 text-4xl font-black leading-tight text-slate-800 md:text-5xl">{question.question}</h1>
          <div className="mt-8 grid gap-4">
            {question.options.map((option) => {
              const isChosen = selectedOption === option;
              const optionClass = !selectedOption
                ? 'border-slate-200 hover:border-secondary hover:bg-secondary-light'
                : option === question.correct_option
                  ? 'border-accent bg-accent-light text-accent-dark'
                  : isChosen
                    ? 'border-kid-pink bg-rose-50 text-rose-700'
                    : 'border-slate-200 opacity-70';

              return (
                <button
                  key={option}
                  onClick={() => setSelectedOption(option)}
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
                  {isCorrect ? 'Correct!' : 'Nice try!'}
                </p>
              </div>
              <p className="mt-4 text-xl leading-9 text-slate-700">{question.explanation}</p>
              <button
                onClick={() => void handleNext()}
                disabled={savingResult}
                className="kid-button mt-6 bg-secondary-dark hover:bg-secondary"
              >
                {currentIndex < quiz.questions.length - 1 ? 'Next Question' : savingResult ? 'Saving...' : 'See My Score'}
                <ChevronRight className="ml-2" size={20} />
              </button>
            </div>
          ) : (
            <p className="mt-6 text-base font-bold uppercase tracking-[0.15em] text-slate-400">
              Choose one answer to unlock the explanation.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function buildFallbackMessage(percentage: number) {
  if (percentage === 100) {
    return 'Amazing work! Every answer was right on target.';
  }
  if (percentage >= 60) {
    return 'Great job! You remembered a lot. A little review will make you even stronger.';
  }
  return 'Good effort! Review the words once more and come back for another try.';
}
