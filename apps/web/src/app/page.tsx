'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, Bot, Brain, ChevronRight, Link2, Settings, Sparkles, Trophy } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type Progress } from '@/lib/api';
import { getApiConnectionDetails, subscribeToApiBaseUrlChange } from '@/lib/api-config';

export default function HomePage() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [connection, setConnection] = useState(() => getApiConnectionDetails());

  async function loadProgress() {
    setLoading(true);
    try {
      const data = await api.getProgress();
      setProgress(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Could not load progress.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProgress();
  }, []);

  useEffect(() => {
    const syncConnection = () => setConnection(getApiConnectionDetails());
    syncConnection();
    return subscribeToApiBaseUrlChange(syncConnection);
  }, []);

  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title="Connect the tutor first"
        message="This device needs the current backend URL before lessons can load. Open the connection page and save the HTTPS tunnel URL from your computer."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Open Connection Setup
          </Link>
        }
        secondaryHref="/offline"
        secondaryLabel="How It Works"
      />
    );
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Warming up today's adventure"
        message="The tutor is preparing your lesson, review words, and fun practice games."
        secondaryHref="/offline"
        secondaryLabel="Need help?"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="The tutor is taking a tiny nap"
        message="We could not reach the backend right now. Check that the API is running, then try again."
        primaryAction={
          <button onClick={() => void loadProgress()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Try Again
          </button>
        }
        secondaryHref="/offline"
        secondaryLabel="Open Help"
      />
    );
  }

  if (error) {
    return (
      <StatusCard
        tone="error"
        title="Something went wobbly"
        message={error.message}
        primaryAction={
          <button onClick={() => void loadProgress()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Reload
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-6xl">
        <section className="kid-surface story-dots relative overflow-hidden border-primary/40 p-8 md:p-12">
          <div className="absolute -right-8 top-6 h-28 w-28 rounded-full bg-secondary/60 blur-2xl" />
          <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-accent/40 blur-2xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.4fr,0.9fr] lg:items-center">
            <div>
              <span className="kid-tag mb-4">English Time</span>
              <h1 className="max-w-3xl text-5xl font-black leading-tight text-slate-800 md:text-7xl">
                Learn English with play, smiles, and brave little steps.
              </h1>
              <p className="mt-5 max-w-2xl text-xl leading-9 text-slate-600">
                Practice one lesson, a quick quiz, a smart review, and a happy chat with your tutor.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/lesson" className="kid-button bg-primary hover:bg-primary-dark">
                  Start Lesson <ChevronRight className="ml-2" size={22} />
                </Link>
                <Link
                  href="/review"
                  className="rounded-full border-2 border-primary/20 bg-white px-6 py-4 text-lg font-bold text-primary-dark transition hover:border-primary hover:bg-primary-light"
                >
                  Review Words
                </Link>
              </div>
              <div className="mt-6 max-w-xl rounded-[1.5rem] border-2 border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-100 p-3">
                    <Link2 className="text-primary-dark" size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Backend Connection</p>
                    <p className="text-lg font-black text-slate-800">
                      {connection.baseUrl ? connection.host : 'Not connected yet on this device'}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-base leading-7 text-slate-600">
                  {connection.source === 'saved'
                    ? 'Using the saved tunnel URL from this browser.'
                    : connection.source === 'default'
                      ? 'Using the default API URL from the Vercel environment.'
                      : connection.source === 'development'
                        ? 'Using the local backend because the app is running in development.'
                        : 'Open the connection page and paste the current HTTPS tunnel URL from your computer.'}
                </p>
                <Link href="/connect" className="mt-4 inline-flex font-bold uppercase tracking-[0.16em] text-primary-dark">
                  {connection.baseUrl ? 'Change Connection' : 'Connect Backend'}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.75rem] bg-sky-50 p-5 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-700">Streak</p>
                <p className="mt-2 text-4xl font-black text-sky-900">{progress?.streak_count ?? 0}</p>
                <p className="text-base text-sky-700">days in a row</p>
              </div>
              <div className="rounded-[1.75rem] bg-amber-50 p-5 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Words</p>
                <p className="mt-2 text-4xl font-black text-amber-900">{progress?.vocabulary_learned ?? 0}</p>
                <p className="text-base text-amber-700">learned so far</p>
              </div>
              <div className="rounded-[1.75rem] bg-emerald-50 p-5 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Themes</p>
                <p className="mt-2 text-4xl font-black text-emerald-900">{progress?.themes_completed ?? 0}</p>
                <p className="text-base text-emerald-700">finished adventures</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            href="/lesson"
            icon={<BookOpen className="text-primary-dark" size={34} />}
            title="Lesson"
            description="Meet today's words and play the mini-activity."
            accentClass="bg-primary-light"
          />
          <ActionCard
            href="/quiz"
            icon={<Trophy className="text-secondary-dark" size={34} />}
            title="Quiz"
            description="Answer cheerful questions and see your score."
            accentClass="bg-secondary-light"
          />
          <ActionCard
            href="/review"
            icon={<Brain className="text-accent-dark" size={34} />}
            title="Review"
            description="Practice the words that need more love."
            accentClass="bg-accent-light"
          />
          <ActionCard
            href="/chat"
            icon={<Bot className="text-kid-pink" size={34} />}
            title="Tutor Chat"
            description="Say hello and ask for an English word."
            accentClass="bg-rose-50"
          />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="kid-surface border-secondary/50 p-8">
            <div className="flex items-center gap-3">
              <Sparkles className="text-secondary-dark" size={28} />
              <h2 className="text-3xl font-black text-slate-800">Cheer Corner</h2>
            </div>
            <p className="mt-4 text-xl leading-8 text-slate-600">
              You do not need to be perfect. Every try helps your English grow bigger and brighter.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full bg-slate-100 px-4 py-2 font-bold text-slate-600">Small steps count</span>
              <span className="rounded-full bg-slate-100 px-4 py-2 font-bold text-slate-600">Audio helps listening</span>
              <span className="rounded-full bg-slate-100 px-4 py-2 font-bold text-slate-600">Review makes words stick</span>
            </div>
          </div>

          <div className="kid-surface border-accent/50 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Focus Words</p>
                <h2 className="mt-2 text-3xl font-black text-slate-800">Tricky Friends</h2>
              </div>
              <Link href="/parents" className="rounded-full border border-slate-200 p-3 text-slate-500 transition hover:border-primary hover:text-primary">
                <Settings size={22} />
              </Link>
            </div>
            {progress?.difficult_words.length ? (
              <div className="mt-6 space-y-3">
                {progress.difficult_words.map((word) => (
                  <div key={word} className="flex items-center justify-between rounded-[1.25rem] bg-slate-50 px-4 py-3">
                    <span className="text-xl font-bold text-slate-700">{word}</span>
                    <Link href="/review" className="text-sm font-bold uppercase tracking-[0.15em] text-primary-dark">
                      Practice
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-lg leading-8 text-slate-600">
                No tricky words yet. Finish a lesson and the review helper will collect the words to practice next.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
  accentClass,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  accentClass: string;
}) {
  return (
    <Link href={href} className="group">
      <div className="kid-surface h-full border-transparent p-6 transition duration-200 hover:-translate-y-1 hover:border-primary/30">
        <div className={`inline-flex rounded-[1.25rem] p-4 ${accentClass}`}>{icon}</div>
        <h2 className="mt-5 text-3xl font-black text-slate-800">{title}</h2>
        <p className="mt-3 text-lg leading-8 text-slate-600">{description}</p>
        <p className="mt-6 inline-flex items-center text-base font-bold uppercase tracking-[0.18em] text-primary-dark">
          Let&apos;s go <ChevronRight className="ml-1 transition group-hover:translate-x-1" size={18} />
        </p>
      </div>
    </Link>
  );
}
