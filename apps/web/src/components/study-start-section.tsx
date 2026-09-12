'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Brain, ClipboardList, GraduationCap, Languages, PlayCircle, SpellCheck2 } from 'lucide-react';

import { api, type StudySessionState } from '@/lib/api';

const studyActions = [
  {
    href: '/lesson',
    title: 'Licao',
    description: 'Comece pelas 3 frases por dia em ingles.',
    icon: BookOpen,
    tone: 'text-sky-700 bg-sky-50 border-sky-100',
  },
  {
    href: '/study?tab=english#english-questions',
    title: 'Questoes',
    description: 'Pratique somente perguntas da licao escolhida.',
    icon: ClipboardList,
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  },
  {
    href: '/study?tab=english#english-grammar',
    title: 'Gramatica',
    description: 'Treine estruturas das frases de ingles.',
    icon: SpellCheck2,
    tone: 'text-violet-700 bg-violet-50 border-violet-100',
  },
  {
    href: '/review',
    title: 'Revisao',
    description: 'Reforce o que precisa voltar hoje.',
    icon: Brain,
    tone: 'text-amber-700 bg-amber-50 border-amber-100',
  },
  {
    href: '/exams',
    title: 'Simulado',
    description: 'Abra uma prova independente quando quiser medir progresso.',
    icon: GraduationCap,
    tone: 'text-indigo-700 bg-indigo-50 border-indigo-100',
  },
];

/**
 * The five modes, with the one-click path in front of them.
 *
 * This section (on the dashboard) used to be five equal cards, which is one more
 * choice to make before studying anything, after the one the home screen already
 * asked for. The queue button answers it: one tap and the first card is on
 * screen. The five modes stay for whoever wants to pick a specific one.
 */
export function StudyStartSection() {
  const [sessionState, setSessionState] = useState<StudySessionState | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reading the state creates nothing, so this cannot start a session by
    // accident just because the page was opened.
    api
      .getStudySessionState()
      .then((state) => {
        if (!cancelled) setSessionState(state);
      })
      .catch(() => {
        /* The mode cards below work with or without this. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasOpenSession = Boolean(sessionState?.has_session && sessionState.remaining > 0);
  const remaining = sessionState?.remaining ?? 0;

  return (
    <section className="rounded-[1.6rem] border-2 border-slate-100 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Iniciar estudo</p>
          <h2 className="mt-1 text-2xl font-black text-slate-800">Comece pela licao de ingles</h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            A sugestao para ingles e estudar 3 frases por dia. Ainda assim, cada modo fica livre para abrir sozinho.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm font-black text-slate-600">
          <Languages size={16} />
          Ingles
        </div>
      </div>

      <Link
        href="/session"
        className="mt-4 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-5 py-3 text-white transition hover:scale-[1.01]"
      >
        <span className="inline-flex items-center gap-2 text-base font-black sm:text-lg">
          <PlayCircle size={22} />
          {hasOpenSession ? 'Continuar de onde parou' : 'Estudar agora'}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-white/85">
          {hasOpenSession ? `Faltam ${remaining}` : 'Fila do dia'}
        </span>
      </Link>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {studyActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={`group flex min-h-[8.5rem] flex-col justify-between rounded-[1.25rem] border-2 p-4 transition hover:-translate-y-0.5 hover:shadow-md ${action.tone}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80">
                  <Icon size={22} />
                </span>
                <ArrowRight size={18} className="opacity-70 transition group-hover:translate-x-0.5" />
              </span>
              <span>
                <span className="block text-base font-black">{action.title}</span>
                <span className="mt-1 block text-xs font-bold leading-5 opacity-80">{action.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
