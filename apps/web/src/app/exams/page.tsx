'use client';

import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';

import { ExamList } from '@/components/exam/ExamList';
import { StatusCard } from '@/components/status-card';
import { useModules } from '@/hooks/use-modules';
import { useRequireAuth } from '@/hooks/use-require-auth';

export default function ExamsPage() {
  const authState = useRequireAuth();
  const { modules, loading } = useModules();

  if (authState.status === 'loading' || authState.status === 'unauthenticated' || loading) {
    return (
      <StatusCard
        tone="loading"
        title="Abrindo simulados"
        message="Confirmando seu cadastro e os modos ativos."
        secondaryHref="/dashboard"
        secondaryLabel="Voltar ao dashboard"
      />
    );
  }

  if (authState.status === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title="Servidor nao disponivel"
        message="O sistema esta temporariamente indisponivel. Tente novamente em instantes."
        primaryAction={<Link href="/offline" className="kid-button bg-primary hover:bg-primary-dark">Ver status</Link>}
        secondaryHref="/dashboard"
        secondaryLabel="Voltar ao dashboard"
      />
    );
  }

  if (modules.exams === false) {
    return (
      <StatusCard
        tone="empty"
        title="Simulados desativados"
        message="Ative o modulo de simulados nas configuracoes da conta para usar este modo."
        secondaryHref="/dashboard"
        secondaryLabel="Voltar ao dashboard"
      />
    );
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
          <ArrowLeft size={18} /> Voltar ao dashboard
        </Link>

        <section className="rounded-[1.75rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
              <ClipboardList size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Modo independente</p>
              <h1 className="mt-1 text-2xl font-black text-slate-800 sm:text-3xl md:text-4xl">Simulados</h1>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm font-medium leading-7 text-slate-500 md:text-base">
            Abra uma prova quando quiser medir progresso. Este modo nao depende de concluir licao, questoes ou revisao antes.
          </p>
        </section>

        <section className="rounded-[1.6rem] border-2 border-slate-100 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
          <ExamList />
        </section>
      </div>
    </main>
  );
}
