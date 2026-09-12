'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, BookOpen, Bot, Brain, ClipboardList, Flame, Layers, Library, LogIn, PlayCircle, Sparkles, Target, UserPlus, WifiOff, Zap } from 'lucide-react';

import { ApiError, api, type LevelAnalysis, type Progress, type StudySessionState } from '@/lib/api';
import { getApiConnectionDetails, refreshRuntimeBackendConfig, subscribeToApiBaseUrlChange } from '@/lib/api-config';

type HomeStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'server_missing';

export default function HomePage() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [level, setLevel] = useState<LevelAnalysis | null>(null);
  // What is still open in the study queue, so the first screen can offer to
  // continue it instead of asking the child to find their way back to it.
  const [sessionState, setSessionState] = useState<StudySessionState | null>(null);
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
        // Authenticated — now fetch progress. The level analysis rides along
        // because it is the only source of the real next-level target; without
        // it the progress bar has nothing honest to measure against.
        return Promise.all([
          api.getProgress().catch(() => null),
          api.getChildLevel().catch(() => null),
          // Reading the queue state creates nothing, so it is safe on load.
          api.getStudySessionState().catch(() => null),
        ]).then(([progressData, levelData, queueState]) => {
          setProgress(progressData);
          setLevel(levelData);
          setSessionState(queueState);
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
  // Only a missing server (or a status we do not know yet) makes a card dead.
  // Being logged out does not: the card sends you through the login and brings
  // you back to it, which beats a card that looks fine and does nothing.
  const cardsDisabled = serverMissing || status === 'loading';
  const cardHref = (href: string) =>
    isUnauthenticated ? `/login?next=${encodeURIComponent(href)}` : href;
  const levelProgress = getLevelProgress(progress, level);
  const hasOpenSession = Boolean(sessionState?.has_session && sessionState.remaining > 0);
  const remainingLabel = describeRemaining(sessionState);
  const queueHint = describeQueue(sessionState, hasOpenSession);

  return (
    <main className="min-h-screen px-3 py-4 sm:px-5 sm:py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">

        {/* Server notice */}
        {serverMissing && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
            <WifiOff size={16} className="shrink-0" />
            <span>O tutor esta temporariamente indisponivel. Tente novamente em instantes.</span>
          </div>
        )}

        {/* Login notice for unauthenticated users — the hero below already has the Entrar/Cadastrar buttons */}
        {isUnauthenticated && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-6 py-5 text-center sm:text-left">
            <LogIn size={20} className="shrink-0 text-sky-600" />
            <span className="flex-1 text-sm font-semibold text-sky-700">
              Faça cadastro ou entre para acessar as lições, quiz e livros.
            </span>
          </div>
        )}

        {/* Hero */}
        <section className="relative overflow-hidden rounded-[1.75rem] border-2 border-slate-100 bg-white p-4 text-left shadow-[0_18px_50px_rgba(15,23,42,0.10)] sm:p-7 md:p-10">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center md:gap-6">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-sky-700 ring-1 ring-sky-100 sm:px-3 sm:py-2">
                <Sparkles size={15} /> Seu amigo tutor
              </span>
            <h1 className="mt-3 max-w-3xl text-[1.7rem] sm:mt-4 font-semibold leading-tight text-slate-800 sm:text-4xl sm:leading-tight md:text-5xl">
              Vamos aprender tudo do seu jeito
            </h1>
            <p className="mt-3 max-w-2xl text-base font-semibold leading-6 text-slate-600 sm:mt-4 sm:text-lg sm:leading-8">
              {isUnauthenticated
                ? 'Crie sua conta gratuita e comece com lições, revisão e livros no mesmo lugar.'
                : 'Escolha uma trilha, mantenha o ritmo e continue aprendendo com foco.'}
            </p>
            </div>

            {/* Progress pills — authenticated only */}
            {isAuthenticated && progress && (
              <div className="hidden flex-wrap gap-2 md:flex md:justify-end">
                <span className="rounded-full bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 ring-1 ring-sky-100">
                  🔥 {progress.streak_count} dias seguidos
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 ring-1 ring-amber-100">
                  💬 {progress.vocabulary_learned} frases aprendidas
                </span>
                {progress.themes_completed > 0 && (
                  <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 ring-1 ring-emerald-100">
                    🏆 {progress.themes_completed} temas concluídos
                  </span>
                )}
              </div>
            )}

            {/* CTA principal */}
            {serverMissing ? (
              <Link
                href="/offline"
                className="mt-1 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-amber-300 sm:mt-6 px-6 text-lg font-black text-slate-950 shadow-[0_14px_30px_rgba(251,191,36,0.24)] transition hover:scale-[1.02] hover:bg-amber-200 sm:w-auto sm:px-8"
              >
                <WifiOff size={24} />
                Ver status
              </Link>
            ) : isUnauthenticated ? (
              <div className="mt-1 flex flex-col gap-3 sm:mt-6 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 px-6 text-lg font-black text-white shadow-[0_14px_30px_rgba(14,165,233,0.22)] transition hover:scale-[1.02] sm:w-auto"
                >
                  <UserPlus size={22} />
                  Cadastrar grátis
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 px-6 text-lg font-black text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 sm:w-auto"
                >
                  <LogIn size={22} />
                  Entrar
                </Link>
              </div>
            ) : isAuthenticated ? (
              <div className="mt-1 flex flex-col items-start gap-2.5 sm:mt-6 sm:gap-3">
                <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-stretch sm:gap-3">
                  {/* Continuing comes first: to a child who was already in the
                      middle of a session, it is the only thing on this screen
                      they are looking for. */}
                  {hasOpenSession && (
                    <Link
                      href="/session"
                      className="relative inline-flex min-h-[3.25rem] w-full flex-col items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-2 text-white shadow-[0_14px_34px_rgba(16,185,129,0.26)] transition hover:scale-[1.02] sm:min-h-14 sm:w-auto sm:px-7"
                    >
                      <span className="inline-flex items-center gap-2 text-lg font-black sm:text-xl">
                        <PlayCircle size={26} />
                        Continuar de onde parou
                      </span>
                      <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-white/85">
                        {remainingLabel}
                      </span>
                    </Link>
                  )}
                  <div className="relative inline-flex w-full sm:w-auto">
                    {!hasOpenSession && (
                      <span className="absolute inset-0 animate-ping rounded-2xl bg-primary opacity-20" aria-hidden />
                    )}
                    <Link
                      href={hasOpenSession ? '/session?restart=1' : '/session'}
                      className={`relative inline-flex min-h-[3.25rem] w-full flex-col items-center justify-center rounded-2xl px-6 py-2 transition hover:scale-[1.02] sm:min-h-14 sm:w-auto sm:px-7 ${
                        hasOpenSession
                          ? 'border-2 border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
                          : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-white shadow-[0_14px_34px_rgba(14,165,233,0.24)]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 text-lg font-black sm:text-xl">
                        <ClipboardList size={26} />
                        Iniciar estudos
                      </span>
                      {hasOpenSession && (
                        <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Monta uma fila nova
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
                {queueHint ? (
                  <p className="text-xs font-semibold text-slate-500 sm:text-sm">{queueHint}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {/* Mini progress dashboard */}
        {isAuthenticated && progress && (
          <section className="mt-3 rounded-[1.5rem] border-2 border-white/80 bg-white/85 p-4 shadow-[0_8px_24px_rgba(14,165,233,0.08)] sm:mt-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Progresso do aluno</p>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-100 px-2.5 py-1 text-xs font-black text-sky-700">
                Nível {level?.level ?? progress.current_level}
                {/* The label doubles the pill's width, which wraps it onto a
                    second line on a phone. The number carries the meaning. */}
                {level?.label ? <span className="hidden sm:inline"> · {level.label}</span> : null}
              </span>
            </div>

            {/* Progress towards the next level */}
            {levelProgress && (
              <>
                <div
                  className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={levelProgress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progresso para o nível ${levelProgress.nextLevel}`}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-700"
                    style={{ width: `${levelProgress.percent}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.6875rem] font-semibold text-slate-400 sm:text-xs">
                  {levelProgress.learned} de {levelProgress.target} tópicos para o nível {levelProgress.nextLevel}
                </p>
              </>
            )}

            {/* Stats row */}
            <div className="mt-3 grid grid-cols-3 gap-1 divide-x divide-slate-100 sm:mt-4 sm:gap-3">
              <div className="flex flex-col items-center gap-0.5 px-1 text-center sm:gap-1 sm:px-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-100 sm:h-8 sm:w-8">
                  <Flame size={16} className="text-orange-600" />
                </div>
                <p className="text-lg font-black text-slate-800 sm:text-xl">{progress.streak_count}</p>
                <p className="text-xs font-semibold text-slate-400">Dias</p>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-1 text-center sm:gap-1 sm:px-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 sm:h-8 sm:w-8">
                  <Target size={16} className="text-emerald-600" />
                </div>
                <p className="text-lg font-black text-slate-800 sm:text-xl">{progress.vocabulary_learned}</p>
                <p className="text-xs font-semibold text-slate-400">Tópicos</p>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-1 text-center sm:gap-1 sm:px-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-100 sm:h-8 sm:w-8">
                  <BookOpen size={16} className="text-violet-600" />
                </div>
                <p className="text-lg font-black text-slate-800 sm:text-xl">{progress.themes_completed}</p>
                <p className="text-xs font-semibold text-slate-400">Temas</p>
              </div>
            </div>
          </section>
        )}

        {/* Activity cards */}
        <section className="mt-4 grid grid-cols-1 gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          <ActivityCard
            href={cardHref('/dashboard')}
            emoji="📊"
            icon={<BarChart3 size={28} />}
            title="Dashboard"
            description="Veja as métricas e acompanhe sua evolução"
            bg="bg-slate-50"
            border="border-slate-200"
            iconColor="text-slate-700"
            disabled={cardsDisabled}
          />
          <ActivityCard
            href={cardHref('/lesson')}
            emoji="📖"
            icon={<BookOpen size={28} />}
            title="Lição"
            description="Aprenda as frases de hoje"
            bg="bg-sky-50"
            border="border-sky-200"
            iconColor="text-sky-600"
            disabled={cardsDisabled}
          />
          <ActivityCard
            href={cardHref('/review')}
            emoji="🧠"
            icon={<Brain size={28} />}
            title="Revisão"
            description="Pratique o que aprendeu"
            bg="bg-emerald-50"
            border="border-emerald-200"
            iconColor="text-emerald-600"
            disabled={cardsDisabled}
          />
          <ActivityCard
            href={cardHref('/study')}
            emoji="📝"
            icon={<ClipboardList size={28} />}
            title="Estudos"
            description="Planeje e registre seu foco"
            bg="bg-teal-50"
            border="border-teal-200"
            iconColor="text-teal-600"
            disabled={cardsDisabled}
          />
          <ActivityCard
            href={cardHref('/diverse')}
            emoji="🧩"
            icon={<Layers size={28} />}
            title="Outras matérias"
            description="Crie aulas com IA"
            bg="bg-indigo-50"
            border="border-indigo-200"
            iconColor="text-indigo-600"
            disabled={cardsDisabled}
            highlight
          />
          <ActivityCard
            href={cardHref('/chat')}
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
            href={cardHref('/quick-review')}
            emoji="⚡"
            icon={<Zap size={28} />}
            title="Revisão rápida"
            description="Relembre palavras em segundos"
            bg="bg-amber-50"
            border="border-amber-300"
            iconColor="text-amber-500"
            disabled={cardsDisabled}
            highlight
          />
          <ActivityCard
            href={cardHref('/books')}
            emoji="📚"
            icon={<Library size={28} />}
            title="Livros"
            description="Leia historinhas em inglês"
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

        {/* Parents area link — hidden while logged out, where it only led to a
            login wall for an area a visitor has nothing to do in yet. */}
        {isAuthenticated && (
          <div className="mt-6 text-center">
            <Link href="/parents" className="inline-flex min-h-11 items-center px-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition hover:text-slate-600">
              Área dos pais
            </Link>
          </div>
        )}

      </div>
    </main>
  );
}

/** "Faltam 4 itens - Revisao": what the continue button is promising. */
function describeRemaining(state: StudySessionState | null): string {
  if (!state || state.remaining <= 0) return '';
  const items = state.remaining === 1 ? '1 item' : `${state.remaining} itens`;
  return state.next_label ? `Faltam ${items} · ${state.next_label}` : `Faltam ${items}`;
}

/**
 * One line saying what a new session would hold.
 *
 * It is here so the buttons are not a leap of faith: a child with nothing due
 * should read that, rather than press a button and land on an empty screen.
 */
function describeQueue(state: StudySessionState | null, hasOpenSession: boolean): string {
  if (!state) return '';
  const parts: string[] = [];
  if (state.lesson_pending) parts.push('licao de hoje');
  if (state.due_review > 0) {
    parts.push(state.due_review === 1 ? '1 revisao vencida' : `${state.due_review} revisoes vencidas`);
  }
  if (state.pending_questions > 0) {
    parts.push(
      state.pending_questions === 1
        ? '1 questao pendente'
        : `${state.pending_questions} questoes pendentes`,
    );
  }
  if (parts.length === 0) {
    return hasOpenSession ? 'Termine a sessao aberta para fechar o dia.' : 'Tudo em dia por aqui.';
  }
  return `Na fila: ${parts.join(' · ')}.`;
}

/**
 * How far the child is through the current level, or null when the backend did
 * not give a usable target. Clamped because `next_level_at` is a threshold the
 * child can already be sitting on top of.
 */
function getLevelProgress(progress: Progress | null, level: LevelAnalysis | null) {
  if (!level || !Number.isFinite(level.next_level_at) || level.next_level_at <= 0) {
    return null;
  }

  const learned = level.vocabulary_learned ?? progress?.vocabulary_learned ?? 0;
  const target = level.next_level_at;

  return {
    learned,
    target,
    nextLevel: level.level + 1,
    percent: Math.max(0, Math.min(100, Math.round((learned / target) * 100))),
  };
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
      className={`kid-surface flex h-full min-h-[5.5rem] items-center gap-3.5 p-3.5 transition duration-200 sm:block sm:min-h-[7.5rem] sm:gap-4 sm:p-5 md:p-6 ${border} ${disabled ? 'cursor-not-allowed opacity-50 grayscale' : 'cursor-pointer hover:-translate-y-1 hover:shadow-lg'} ${highlight && !disabled ? 'ring-2 ring-amber-300 ring-offset-1' : ''}`}
    >
      <div className={`inline-flex shrink-0 rounded-2xl p-2.5 sm:p-3 ${bg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-black leading-tight text-slate-900 sm:mt-4 sm:text-xl md:text-2xl">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] font-semibold leading-5 text-slate-600 sm:mt-1 sm:text-sm sm:leading-6 md:text-base md:leading-7">{description}</p>
      </div>
      <p className="shrink-0 text-xl sm:mt-4 sm:text-2xl">{emoji}</p>
    </div>
  );

  if (disabled) {
    return <div aria-disabled="true">{inner}</div>;
  }

  return <Link href={href}>{inner}</Link>;
}
