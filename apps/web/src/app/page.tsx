'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Bot, Brain, Trophy, WifiOff } from 'lucide-react';

import { ApiError, api, type Progress } from '@/lib/api';
import { getApiConnectionDetails, refreshRuntimeBackendConfig, subscribeToApiBaseUrlChange } from '@/lib/api-config';

export default function HomePage() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [connection, setConnection] = useState(() => getApiConnectionDetails());

  useEffect(() => {
    const syncConnection = () => setConnection(getApiConnectionDetails());
    syncConnection();
    void refreshRuntimeBackendConfig().then(syncConnection);
    return subscribeToApiBaseUrlChange(syncConnection);
  }, []);

  useEffect(() => {
    if (connection.source === 'missing') {
      setServerOk(false);
      return;
    }

    api
      .getProgress()
      .then((data) => {
        setProgress(data);
        setServerOk(true);
      })
      .catch((err) => {
        setServerOk(err instanceof ApiError && err.isUnconfigured ? false : false);
      });
  }, [connection.source]);

  const serverMissing = serverOk === false;

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-3xl">

        {/* Small server notice — only when offline */}
        {serverMissing && (
          <Link
            href="/connect"
            className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
          >
            <WifiOff size={16} className="shrink-0" />
            <span>Servidor ainda nao ativado — toque aqui para conectar</span>
          </Link>
        )}

        {/* Hero */}
        <section className="kid-surface story-dots relative overflow-hidden border-primary/30 p-8 text-center md:p-12">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-yellow-200/50 blur-3xl" />
          <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative">
            <span className="text-5xl md:text-6xl">🌟</span>
            <h1 className="mt-4 text-4xl font-black leading-tight text-slate-800 md:text-5xl">
              Vamos aprender ingles!
            </h1>
            <p className="mt-3 text-lg font-semibold text-slate-500 md:text-xl">
              Escolha uma atividade e comece a aventura de hoje.
            </p>

            {/* Progress pills */}
            {progress && (
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <span className="rounded-full bg-sky-100 px-4 py-2 text-sm font-bold text-sky-700">
                  🔥 {progress.streak_count} dias seguidos
                </span>
                <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                  💬 {progress.vocabulary_learned} frases aprendidas
                </span>
                {progress.themes_completed > 0 && (
                  <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
                    🏆 {progress.themes_completed} temas concluidos
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Activity cards */}
        <section className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-2">
          <ActivityCard
            href="/lesson"
            emoji="📖"
            icon={<BookOpen size={28} />}
            title="Licao"
            description="Aprenda as frases de hoje"
            bg="bg-sky-50"
            border="border-sky-200"
            iconColor="text-sky-600"
            disabled={serverMissing}
          />
          <ActivityCard
            href="/quiz"
            emoji="🏆"
            icon={<Trophy size={28} />}
            title="Quiz"
            description="Responda e ganhe pontos"
            bg="bg-amber-50"
            border="border-amber-200"
            iconColor="text-amber-600"
            disabled={serverMissing}
          />
          <ActivityCard
            href="/review"
            emoji="🧠"
            icon={<Brain size={28} />}
            title="Revisao"
            description="Pratique o que aprendeu"
            bg="bg-emerald-50"
            border="border-emerald-200"
            iconColor="text-emerald-600"
            disabled={serverMissing}
          />
          <ActivityCard
            href="/chat"
            emoji="🤖"
            icon={<Bot size={28} />}
            title="Chat"
            description="Converse com o tutor"
            bg="bg-rose-50"
            border="border-rose-200"
            iconColor="text-rose-500"
            disabled={serverMissing}
          />
        </section>

        {/* Difficult words — only when there's data */}
        {progress?.difficult_words && progress.difficult_words.length > 0 && (
          <section className="mt-6 kid-surface border-slate-200/60 p-6">
            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Para praticar mais</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {progress.difficult_words.map((word) => (
                <Link
                  key={word}
                  href="/review"
                  className="rounded-full bg-slate-100 px-4 py-2 text-base font-bold text-slate-700 transition hover:bg-primary-light hover:text-primary-dark"
                >
                  {word}
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

function ActivityCard({
  href,
  emoji,
  icon,
  title,
  description,
  bg,
  border,
  iconColor,
  disabled,
}: {
  href: string;
  emoji: string;
  icon: ReactNode;
  title: string;
  description: string;
  bg: string;
  border: string;
  iconColor: string;
  disabled: boolean;
}) {
  const inner = (
    <div
      className={`kid-surface h-full p-5 transition duration-200 md:p-7 ${border} ${disabled ? 'opacity-50' : 'hover:-translate-y-1 hover:shadow-lg cursor-pointer'}`}
    >
      <div className={`inline-flex rounded-2xl p-3 ${bg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="mt-4 text-xl font-black text-slate-800 md:text-2xl">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500 md:text-base md:leading-7">{description}</p>
      <p className="mt-4 text-2xl">{emoji}</p>
    </div>
  );

  if (disabled) {
    return <div>{inner}</div>;
  }

  return <Link href={href}>{inner}</Link>;
}
