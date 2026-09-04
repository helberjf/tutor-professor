'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserCheck } from 'lucide-react';

import { api } from '@/lib/api';
import { AdminAccountQueue } from '@/components/admin-account-queue';
import { StatusCard } from '@/components/status-card';

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
        title="Verificando acesso"
        message="Confirmando permissoes de administrador..."
        secondaryHref="/admin"
        secondaryLabel="Voltar ao admin"
      />
    );
  }

  if (!isAdmin) {
    return (
      <StatusCard
        tone="error"
        title="Acesso restrito"
        message="Somente o administrador pode aprovar contas."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={16} /> Dashboard admin
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
            <UserCheck size={14} /> Aprovacao de contas
          </span>
        </div>

        <section className="rounded-[1.75rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Admin</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">Aprovacao de contas</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
            Quem se cadastra fica aguardando aqui e so entra no app depois que voce aprovar.
            Recusar uma conta derruba as sessoes abertas dela na hora; a area de risco permite apagar uma conta e seus dados permanentemente.
          </p>
        </section>

        <AdminAccountQueue />
      </div>
    </main>
  );
}
