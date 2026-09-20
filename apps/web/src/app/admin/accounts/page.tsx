'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserCheck } from 'lucide-react';

import { api } from '@/lib/api';
import { AdminAccountQueue } from '@/components/admin-account-queue';
import { StatusCard } from '@/components/status-card';
import { t } from '@/lib/i18n';

export default function AdminAccountsPage() {
  const [checkDone, setCheckDone] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api.adminCheck()
      .then((res) => setIsAdmin(res.is_admin))
      .catch(() => setIsAdmin(false))
      .finally(() => setCheckDone(true));
  }, []);

  if (!checkDone) {
    return (
      <StatusCard
        tone="loading"
        title={t("Verificando acesso")}
        message={t("Confirmando permissões de administrador...")}
        secondaryHref="/admin"
        secondaryLabel={t("Voltar ao admin")}
      />
    );
  }

  if (!isAdmin) {
    return (
      <StatusCard
        tone="error"
        title={t("Acesso restrito")}
        message={t("Somente o administrador pode aprovar contas.")}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={16} /> {t("Dashboard admin")}
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
            <UserCheck size={14} /> {t("Aprovação de contas")}
          </span>
        </div>

        <section className="rounded-[1.75rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{t("Admin")}</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">{t("Aprovação de contas")}</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
            {t("Quem se cadastra fica aguardando aqui e só entra no app depois que você aprovar. Recusar uma conta derruba as sessões abertas dela na hora; a área de risco permite apagar uma conta e seus dados permanentemente.")}
          </p>
        </section>

        <AdminAccountQueue />
      </div>
    </main>
  );
}
