'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, Bot, Brain, ChevronRight, History, Link2, Settings, Sparkles, Trophy } from 'lucide-react';

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
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar o progresso.'));
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
        title="Conecte o tutor primeiro"
        message="Este aparelho precisa da URL atual do backend antes de carregar as licoes. Abra a pagina de conexao e salve a URL HTTPS do tunnel do seu computador."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Abrir configuracao de conexao
          </Link>
        }
        secondaryHref="/offline"
        secondaryLabel="Como funciona"
      />
    );
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Preparando a aventura de hoje"
        message="O tutor esta preparando sua licao, a revisao de frases e as atividades divertidas."
        secondaryHref="/offline"
        secondaryLabel="Precisa de ajuda?"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="O tutor tirou uma soneca"
        message="Nao conseguimos acessar o backend agora. Verifique se a API esta rodando e tente de novo."
        primaryAction={
          <button onClick={() => void loadProgress()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Tentar de novo
          </button>
        }
        secondaryHref="/offline"
        secondaryLabel="Abrir ajuda"
      />
    );
  }

  if (error) {
    return (
      <StatusCard
        tone="error"
        title="Algo saiu do lugar"
        message={error.message}
        primaryAction={
          <button onClick={() => void loadProgress()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Recarregar
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-6xl">
        <section className="kid-surface story-dots relative overflow-hidden border-primary/40 p-5 md:p-12">
          <div className="absolute -right-6 top-4 h-20 w-20 rounded-full bg-secondary/60 blur-2xl md:-right-8 md:top-6 md:h-28 md:w-28" />
          <div className="absolute bottom-0 left-0 h-16 w-16 rounded-full bg-accent/40 blur-2xl md:h-24 md:w-24" />
          <div className="relative grid gap-8 lg:grid-cols-[1.4fr,0.9fr] lg:items-center">
            <div>
              <span className="kid-tag mb-4">Hora do ingles</span>
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-slate-800 sm:text-5xl md:text-7xl">
                Aprenda ingles com brincadeiras, sorrisos e pequenos passos corajosos.
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600 md:mt-5 md:text-xl md:leading-9">
                Pratique uma licao, um quiz rapido, uma revisao inteligente e um chat alegre com o tutor.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/lesson" className="kid-button bg-primary hover:bg-primary-dark">
                  Comecar licao <ChevronRight className="ml-2" size={22} />
                </Link>
                <Link
                  href="/review"
                  className="rounded-full border-2 border-primary/20 bg-white px-6 py-4 text-lg font-bold text-primary-dark transition hover:border-primary hover:bg-primary-light"
                >
                  Revisar frases
                </Link>
              </div>
              <div className="mt-6 max-w-xl rounded-[1.5rem] border-2 border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-100 p-3">
                    <Link2 className="text-primary-dark" size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 md:text-sm md:tracking-[0.18em]">Conexao com o backend</p>
                    <p className="text-base font-black text-slate-800 md:text-lg">
                      {connection.baseUrl ? connection.host : 'Ainda nao conectado neste aparelho'}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base md:leading-7">
                  {connection.source === 'saved'
                    ? 'Usando a URL do tunnel salva neste navegador.'
                    : connection.source === 'default'
                      ? 'Usando a URL padrao da API vinda do ambiente da Vercel.'
                      : connection.source === 'development'
                        ? 'Usando o backend local porque o app esta rodando em desenvolvimento.'
                        : 'Abra a pagina de conexao e cole a URL HTTPS atual do tunnel do seu computador.'}
                </p>
                <Link href="/connect" className="mt-4 inline-flex font-bold uppercase tracking-[0.16em] text-primary-dark">
                  {connection.baseUrl ? 'Trocar conexao' : 'Conectar backend'}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.75rem] bg-sky-50 p-5 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-700">Sequencia</p>
                <p className="mt-2 text-3xl font-black text-sky-900 md:text-4xl">{progress?.streak_count ?? 0}</p>
                <p className="text-base text-sky-700">dias seguidos</p>
              </div>
              <div className="rounded-[1.75rem] bg-amber-50 p-5 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Phrases</p>
                <p className="mt-2 text-3xl font-black text-amber-900 md:text-4xl">{progress?.vocabulary_learned ?? 0}</p>
                <p className="text-base text-amber-700">aprendidas ate agora</p>
              </div>
              <div className="rounded-[1.75rem] bg-emerald-50 p-5 shadow-sm">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Temas</p>
                <p className="mt-2 text-3xl font-black text-emerald-900 md:text-4xl">{progress?.themes_completed ?? 0}</p>
                <p className="text-base text-emerald-700">aventuras concluidas</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          <ActionCard
            href="/lesson"
            icon={<BookOpen className="text-primary-dark" size={34} />}
            title="Licao"
            description="Conheca as tres frases de hoje e jogue a miniatividade."
            accentClass="bg-primary-light"
            extraLink={{ href: '/lesson/history', label: 'Licoes anteriores', icon: <History size={14} /> }}
          />
          <ActionCard
            href="/quiz"
            icon={<Trophy className="text-secondary-dark" size={34} />}
            title="Quiz"
            description="Responda perguntas divertidas e veja sua pontuacao."
            accentClass="bg-secondary-light"
          />
          <ActionCard
            href="/review"
            icon={<Brain className="text-accent-dark" size={34} />}
            title="Revisao"
            description="Pratique as frases que precisam de mais cuidado."
            accentClass="bg-accent-light"
          />
          <ActionCard
            href="/chat"
            icon={<Bot className="text-kid-pink" size={34} />}
            title="Chat com o tutor"
            description="Diga oi e peca ajuda com uma frase em ingles."
            accentClass="bg-rose-50"
          />
          <ActionCard
            href="/parents"
            icon={<Sparkles className="text-amber-700" size={34} />}
            title="Nova licao com IA"
            description="Crie o proximo dia de estudo com o Gemini e salve direto no banco."
            accentClass="bg-amber-50"
          />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="kid-surface border-secondary/50 p-8">
            <div className="flex items-center gap-3">
              <Sparkles className="text-secondary-dark" size={28} />
              <h2 className="text-2xl font-black text-slate-800 md:text-3xl">Cantinho do incentivo</h2>
            </div>
            <p className="mt-4 text-lg leading-8 text-slate-600 md:text-xl">
              Voce nao precisa ser perfeito. Cada tentativa ajuda o seu ingles a crescer mais e mais.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full bg-slate-100 px-4 py-2 font-bold text-slate-600">Pequenos passos contam</span>
              <span className="rounded-full bg-slate-100 px-4 py-2 font-bold text-slate-600">O audio ajuda a ouvir melhor</span>
              <span className="rounded-full bg-slate-100 px-4 py-2 font-bold text-slate-600">A revisao ajuda a fixar</span>
            </div>
          </div>

          <div className="kid-surface border-accent/50 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Frases em foco</p>
                <h2 className="mt-2 text-2xl font-black text-slate-800 md:text-3xl">Frases mais dificeis</h2>
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
                      Praticar
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-base leading-7 text-slate-600 md:text-lg md:leading-8">
                Ainda nao ha frases dificeis. Termine uma licao e a revisao vai juntar as frases para praticar depois.
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
  extraLink,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  accentClass: string;
  extraLink?: { href: string; label: string; icon?: ReactNode };
}) {
  return (
    <div className="group kid-surface h-full border-transparent p-6 transition duration-200 hover:-translate-y-1 hover:border-primary/30">
      <Link href={href}>
        <div className={`inline-flex rounded-[1.25rem] p-4 ${accentClass}`}>{icon}</div>
        <h2 className="mt-4 text-2xl font-black text-slate-800 md:mt-5 md:text-3xl">{title}</h2>
        <p className="mt-3 text-base leading-7 text-slate-600 md:text-lg md:leading-8">{description}</p>
        <p className="mt-6 inline-flex items-center text-base font-bold uppercase tracking-[0.18em] text-primary-dark">
          Vamos la <ChevronRight className="ml-1 transition group-hover:translate-x-1" size={18} />
        </p>
      </Link>
      {extraLink && (
        <Link
          href={extraLink.href}
          className="mt-4 flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-primary-dark"
        >
          {extraLink.icon}
          {extraLink.label}
        </Link>
      )}
    </div>
  );
}
