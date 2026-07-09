'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api, type StudyDashboard, ApiError } from '@/lib/api';
import { ActivityLogSection } from '@/components/activity-log-section';
import { DashboardOverview } from '@/components/dashboard-overview';
import { StatusCard } from '@/components/status-card';

export default function DashboardPage() {
  const authState = useRequireAuth();
  const [dashboard, setDashboard] = useState<StudyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pomodoroState] = useState({ completedByDate: {} as Record<string, number> });

  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let cancelled = false;

    setLoading(true);
    api.getStudyDashboard()
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authState.status]);

  if (authState.status === 'loading' || authState.status === 'unauthenticated') {
    return null;
  }

  if (authState.status === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title="Servidor nao disponivel"
        message="Ative o backend para ver o dashboard e os activity logs."
        primaryAction={<Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>}
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold text-slate-500">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl rounded-[1.6rem] border-2 border-rose-200 bg-white p-6 text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
          <ArrowLeft size={18} /> Voltar
        </Link>

        <section className="rounded-[1.75rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Dashboard</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">Resumo de estudos</h1>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-7 text-slate-500 md:text-base">
            Acompanhamento do ritmo, da sequência e dos activity logs em um painel separado.
          </p>
        </section>

        <section className="rounded-[1.6rem] border-2 border-slate-100 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
          <DashboardOverview dashboard={dashboard} pomodoroState={pomodoroState} />
        </section>

        <ActivityLogSection />
      </div>
    </main>
  );
}