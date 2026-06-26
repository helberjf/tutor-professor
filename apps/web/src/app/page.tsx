'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Bot, Brain, ClipboardList, Flame, Layers, Library, LogIn, Sparkles, Target, UserPlus, WifiOff, Zap } from 'lucide-react';

import { ApiError, api, type Progress } from '@/lib/api';
import { getApiConnectionDetails, refreshRuntimeBackendConfig, subscribeToApiBaseUrlChange } from '@/lib/api-config';

type HomeStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'server_missing';

export default function HomePage() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState<HomeStatus>('loading');
  const [connection, setConnection] = useState(() => getApiConnectionDetails());

  useEffect(() => {
    const syncConnection = () => setConnection(getApiConnectionDetails());
    syncConnection();
    void refreshRuntimeBackendConfig().then(syncConnection);
    return subscribeToApiBaseUrlChange(syncConnection);
  }, []);

  useEffect(() => {
    if (connection.source === 'missing') {
      setStatus('server_missing');
      return;
    }

    setStatus('loading');
    api
      .getUserMe()
      .then(() => {
        // Authenticated — now fetch progress
        return api.getProgress().then((data) => {
          setProgress(data);
          setStatus('authenticated');
        }).catch(() => {
          setStatus('authenticated');
        });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'unconfigured') {
          setStatus('server_missing');
        } else if (err instanceof ApiError && err.code === 'offline') {
          setStatus('server_missing');
        } else {
          // 401 or other → not authenticated
          setStatus('unauthenticated');
        }
      });
  }, [connection.source]);

  const serverMissing = status === 'server_missing';
  const isAuthenticated = status === 'authenticated';
  const isUnauthenticated = status === 'unauthenticated';
  const cardsDisabled = serverMissing || isUnauthenticated || status === 'loading';

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-3xl">

        {/* Server notice */}
        {serverMissing && (
          <Link
            href="/connect"
            className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
          >
            <WifiOff size={16} className="shrink-0" />
            <span>Servidor ainda nao ativado — toque aqui para conectar</span>
          </Link>
        )}

        {/* Login notice for unauthenticated users */}
        {isUnauthenticated && (
          <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-6 py-5 text-center sm:flex-row sm:text-left">
            <LogIn size={20} className="shrink-0 text-sky-600" />
            <span className="flex-1 text-sm font-semibold text-sky-700">
              Faca cadastro ou entre para acessar as licoes, quiz e livros.
            </span>
            <div className="flex gap-2">
              <Link href="/login" className="rounded-full bg-sky-600 px-4 py-2 text-sm font-black text-white hover:bg-sky-700">
                Entrar
              </Link>
              <Link href="/register" className="rounded-full border-2 border-sky-600 px-4 py-2 text-sm font-black text-sky-700 hover:bg-sky-100">
                Cadastrar
              </Link>
            </div>
          </div>
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
              {isUnauthenticated
                ? 'Crie uma conta gratuita e comece sua jornada no idioma.'
                : 'Escolha uma atividade e comece a aventura de hoje.'}
            </p>

            {/* Progress pills — authenticated only */}
            {isAuthenticated && progress && (
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

            {/* CTA principal */}
            {serverMissing ? (
              <Link
                href="/connect"
                className="mt-8 inline-flex items-center gap-3 rounded-full bg-amber-400 px-8 py-4 text-xl font-black text-white shadow-[0_12px_30px_rgba(251,191,36,0.45)] transition hover:scale-105 hover:bg-amber-500 md:px-10 md:py-5 md:text-2xl"
              >
                <WifiOff size={24} />
                Conectar o tutor
              </Link>
            ) : isUnauthenticated ? (
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-xl font-black text-white shadow-[0_12px_30px_rgba(14,165,233,0.45)] transition hover:scale-105 hover:bg-primary-dark"
                >
                  <UserPlus size={22} />
                  Cadastrar gratis
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-8 py-4 text-xl font-black text-primary transition hover:bg-primary-light"
                >
                  <LogIn size={22} />
                  Entrar
                </Link>
              </div>
            ) : isAuthenticated ? (
              <div className="mt-8 flex flex-col items-center gap-3">
                <div className="relative inline-flex">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />
                  <Link
                    href="/study"
                    className="relative inline-flex items-center gap-3 rounded-full bg-primary px-10 py-5 text-2xl font-black text-white shadow-[0_12px_30px_rgba(14,165,233,0.45)] transition hover:scale-105 hover:bg-primary-dark md:px-12 md:py-6 md:text-3xl"
                  >
                    <ClipboardList size={28} />
                    Iniciar estudos
                  </Link>
                </div>
                {progress && progress.themes_completed > 0 && (
                  <p className="text-sm font-semibold text-slate-400">Continue de onde parou ▸</p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        {/* Mini progress dashboard */}
        {isAuthenticated && progress && (
          <section className="mt-4 rounded-[1.5rem] border-2 border-white/80 bg-white/85 p-5 shadow-[0_8px_24px_rgba(14,165,233,0.08)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Progresso do aluno</p>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-black text-sky-700">
                Nível {progress.current_level}
              </span>
            </div>

            {/* Progress bar */}
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-700"
                style={{ width: `${Math.min(100, Math.round((progress.vocabulary_learned / Math.max(progress.vocabulary_learned + 5, 15)) * 100))}%` }}
              />
            </div>

            {/* Stats row */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100">
              <div className="flex flex-col items-center gap-1 px-2 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100">
                  <Flame size={16} className="text-orange-600" />
                </div>
                <p className="text-xl font-black text-slate-800">{progress.streak_count}</p>
                <p className="text-xs font-semibold text-slate-400">Dias</p>
              </div>
              <div className="flex flex-col items-center gap-1 px-2 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
                  <Target size={16} className="text-emerald-600" />
                </div>
                <p className="text-xl font-black text-slate-800">{progress.vocabulary_learned}</p>
                <p className="text-xs font-semibold text-slate-400">Tópicos</p>
              </div>
              <div className="flex flex-col items-center gap-1 px-2 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">
                  <BookOpen size={16} className="text-violet-600" />
                </div>
                <p className="text-xl font-black text-slate-800">{progress.themes_completed}</p>
                <p className="text-xs font-semibold text-slate-400">Temas</p>
              </div>
            </div>
          </section>
        )}

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
            disabled={cardsDisabled}
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
            disabled={cardsDisabled}
          />
          <ActivityCard
            href="/study"
            emoji="ðŸ“"
            icon={<ClipboardList size={28} />}
            title="Estudos"
            description="Planeje e registre seu foco"
            bg="bg-teal-50"
            border="border-teal-200"
            iconColor="text-teal-600"
            disabled={cardsDisabled}
          />
          <ActivityCard
            href="/diverse"
            emoji="AI"
            icon={<Layers size={28} />}
            title="Outras materias"
            description="Crie aulas com IA"
            bg="bg-indigo-50"
            border="border-indigo-200"
            iconColor="text-indigo-600"
            disabled={cardsDisabled}
            highlight
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
            disabled={cardsDisabled}
          />
          <ActivityCard
            href="/quick-review"
            emoji="⚡"
            icon={<Zap size={28} />}
            title="Revisao Rapida"
            description="Relembre palavras em segundos"
            bg="bg-amber-50"
            border="border-amber-300"
            iconColor="text-amber-500"
            disabled={cardsDisabled}
            highlight
          />
          <ActivityCard
            href="/books"
            emoji="📚"
            icon={<Library size={28} />}
            title="Livros"
            description="Leia historinhas em ingles"
            bg="bg-violet-50"
            border="border-violet-200"
            iconColor="text-violet-600"
            disabled={cardsDisabled}
          />
        </section>

        {/* Difficult words — only when there's data */}
        {isAuthenticated && progress?.difficult_words && progress.difficult_words.length > 0 && (
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

        {/* Parents area link */}
        <div className="mt-6 text-center">
          <Link href="/parents" className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition">
            Area dos pais
          </Link>
        </div>

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
  highlight = false,
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
  highlight?: boolean;
}) {
  const inner = (
    <div
      className={`kid-surface h-full p-5 transition duration-200 md:p-7 ${border} ${disabled ? 'opacity-50' : 'hover:-translate-y-1 hover:shadow-lg cursor-pointer'} ${highlight && !disabled ? 'ring-2 ring-amber-300 ring-offset-1' : ''}`}
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
