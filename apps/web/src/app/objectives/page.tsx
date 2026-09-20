'use client';

import Link from 'next/link';
import { ArrowLeft, Target } from 'lucide-react';

import { ObjectivesBoard } from '@/components/objectives/ObjectivesBoard';
import { StatusCard } from '@/components/status-card';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { t } from '@/lib/i18n';

export default function ObjectivesPage() {
  const authState = useRequireAuth();

  if (authState.status === 'loading' || authState.status === 'unauthenticated') {
    return (
      <StatusCard
        tone="loading"
        title={t("Abrindo objetivos")}
        message={t("Confirmando seu cadastro.")}
        secondaryHref="/dashboard"
        secondaryLabel={t("Voltar ao dashboard")}
      />
    );
  }

  if (authState.status === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title={t("Servidor não disponível")}
        message={t("O sistema está temporariamente indisponível. Tente novamente em instantes.")}
        primaryAction={<Link href="/offline" className="app-button bg-primary-dark hover:bg-primary-dark">{t("Ver status")}</Link>}
        secondaryHref="/dashboard"
        secondaryLabel={t("Voltar ao dashboard")}
      />
    );
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
          <ArrowLeft size={18} /> {t("Voltar ao dashboard")}
        </Link>

        <section className="rounded-[1.75rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <Target size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Aonde você quer chegar")}</p>
              <h1 className="mt-1 text-2xl font-black text-slate-800 sm:text-3xl md:text-4xl">{t("Objetivos")}</h1>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm font-medium leading-7 text-slate-500 md:text-base">
            {t("Crie um objetivo e vá adicionando o que precisa estudar para alcançá-lo. Cada dia que você estuda uma área conclui o próximo item dela — os marcados assim aparecem como “concluído estudando”, e desmarcar devolve o item para você. Itens da área “Livre” continuam só no manual.")}
          </p>
        </section>

        <ObjectivesBoard />
      </div>
    </main>
  );
}
