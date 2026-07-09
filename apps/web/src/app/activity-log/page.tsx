'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { DailyActivityLog } from '@/components/daily-activity-log';
import { StatusCard } from '@/components/status-card';
import { ApiError, api } from '@/lib/api';

type GateState = 'loading' | 'authenticated' | 'unauthenticated' | 'server_missing';

export default function ActivityLogPage() {
  const [gateState, setGateState] = useState<GateState>('loading');

  useEffect(() => {
    let cancelled = false;

    api.getUserMe()
      .then(() => {
        if (!cancelled) setGateState('authenticated');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'unconfigured') {
          setGateState('server_missing');
        } else {
          setGateState('unauthenticated');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (gateState === 'loading') {
    return <StatusCard tone="loading" title="Carregando" message="Verificando acesso ao activity log..." />;
  }

  if (gateState === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title="Servidor nao disponivel"
        message="Ative o backend para ver o activity log."
        primaryAction={<Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>}
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (gateState === 'unauthenticated') {
    return (
      <StatusCard
        tone="empty"
        title="Área restrita"
        message="Entre com sua conta para ver o activity log."
        primaryAction={<Link href="/login?next=%2Factivity-log" className="kid-button bg-primary hover:bg-primary-dark">Entrar</Link>}
        secondaryHref="/study"
        secondaryLabel="Ir para estudos"
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-6">
      {/* Header */}
      <div className="mx-auto max-w-2xl">
        <Link
          href="/study"
          className="mb-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={18} />
          Voltar
        </Link>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl">
        <DailyActivityLog />
      </div>
    </div>
  );
}
