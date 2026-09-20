'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api, type StudyDashboard, ApiError } from '@/lib/api';
import { ActivityLogSection } from '@/components/activity-log-section';
import { DashboardOverview } from '@/components/dashboard-overview';
import { ObjectivesProgressCard } from '@/components/objectives-progress-card';
import { StudyStartSection } from '@/components/study-start-section';
import { StatusCard } from '@/components/status-card';
import { t } from '@/lib/i18n';

type GateState = 'loading' | 'authenticated' | 'unauthenticated' | 'server_missing';

export default function DashboardPage() {
  const router = useRouter();
  const [gateState, setGateState] = useState<GateState>('loading');
  const [dashboard, setDashboard] = useState<StudyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pomodoroState] = useState({ completedByDate: {} as Record<string, number> });

  useEffect(() => {
    let cancelled = false;

    // Both answers are needed before anything can render, and neither depends on
    // the other — asking in sequence just stacked two round trips onto a screen
    // that has not drawn a single pixel yet.
    const adminCheck = api.adminCheck().catch(() => ({ is_admin: false, email: '' }));

    api.getUserMe()
      .then(async () => {
        const adminResult = await adminCheck;
        if (cancelled) return;
        if (adminResult.is_admin) {
          router.replace('/admin');
          return;
        }
        setGateState('authenticated');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'unconfigured') {
          setGateState('server_missing');
        } else {
          setGateState('unauthenticated');
        }
      })

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (gateState !== 'authenticated') return;
    let cancelled = false;

    setLoading(true);
    api.getStudyDashboard()
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("Não foi possível carregar o dashboard."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gateState]);

  if (gateState === 'loading') {
    return <StatusCard tone="loading" title={t("Carregando")} message={t("Verificando acesso ao dashboard...")} />;
  }

  if (gateState === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title={t("Servidor não disponível")}
        message={t("O sistema está temporariamente indisponível. Tente novamente em instantes.")}
        primaryAction={<Link href="/offline" className="app-button bg-primary-dark hover:bg-primary-dark">{t("Ver status")}</Link>}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }

  if (gateState === 'unauthenticated') {
    return (
      <StatusCard
        tone="empty"
        title={t("Área restrita")}
        message={t("Entre com sua conta para ver o dashboard.")}
        primaryAction={<Link href="/login?next=%2Fdashboard" className="app-button bg-primary-dark hover:bg-primary-dark">{t("Entrar")}</Link>}
        secondaryHref="/study"
        secondaryLabel={t("Ir para estudos")}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold text-slate-500">{t("Carregando dashboard...")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl rounded-[1.6rem] border-2 border-rose-200 bg-white p-6 text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
          <ArrowLeft size={18} /> {t("Voltar")}
        </Link>

        <section className="rounded-[1.75rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Dashboard")}</p>
          <h1 className="mt-2 text-2xl font-black text-slate-800 sm:text-3xl md:text-4xl">{t("Resumo de estudos")}</h1>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-7 text-slate-500 md:text-base">
            {t("Acompanhe ritmo, sequência, desempenho e tudo que foi estudado hoje em uma única visão.")}
          </p>
        </section>

        <StudyStartSection />

        <ObjectivesProgressCard />

        <ActivityLogSection />

        <section className="rounded-[1.6rem] border-2 border-slate-100 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
          <DashboardOverview dashboard={dashboard} pomodoroState={pomodoroState} />
        </section>
      </div>
    </main>
  );
}
