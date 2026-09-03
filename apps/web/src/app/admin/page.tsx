'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  KeyRound,
  LayoutDashboard,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { api, type AdminOverview } from '@/lib/api';
import { StatusCard } from '@/components/status-card';

export default function AdminDashboardPage() {
  const [checkDone, setCheckDone] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    api.adminCheck()
      .then(async (res) => {
        setIsAdmin(res.is_admin);
        if (res.is_admin) {
          setOverview(await api.adminOverview().catch(() => null));
        }
      })
      .catch(() => setIsAdmin(false))
      .finally(() => setCheckDone(true));
  }, []);

  if (!checkDone) {
    return (
      <StatusCard
        tone="loading"
        title="Verificando acesso"
        message="Confirmando permissoes de administrador..."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (!isAdmin) {
    return (
      <StatusCard
        tone="error"
        title="Acesso restrito"
        message="Esta area e exclusiva para o administrador configurado no backend."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  const pending = overview?.pending_users ?? 0;
  const metrics = [
    {
      label: 'Aguardando aprovacao',
      value: pending,
      icon: <UserCheck size={18} />,
      highlight: pending > 0,
    },
    { label: 'Contas aprovadas', value: overview?.approved_users ?? 0, icon: <Users size={18} /> },
    { label: 'Cadastros em 7 dias', value: overview?.signups_last_7_days ?? 0, icon: <UserPlus size={18} /> },
    { label: 'Contas com IA liberada', value: overview?.ai_authorized_users ?? 0, icon: <KeyRound size={18} /> },
  ];

  const cards = [
    {
      href: '/admin/accounts',
      title: 'Aprovacao de contas',
      description: 'Liberar ou recusar quem se cadastrou para usar o app.',
      icon: <UserCheck size={22} />,
      badge: pending > 0 ? `${pending} na fila` : null,
    },
    {
      href: '/admin/users',
      title: 'Usuarios',
      description: 'Listar contas cadastradas e autorizar o uso da IA para cada usuario.',
      icon: <Users size={22} />,
      badge: null,
    },
    {
      href: '/admin/learn',
      title: 'Conteudo admin',
      description: 'Acessar modulos, flashcards e editor de estudos administrativos.',
      icon: <BookOpen size={22} />,
      badge: null,
    },
  ];

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary">
          <ArrowLeft size={16} /> Inicio
        </Link>

        <section className="rounded-[1.75rem] border-2 border-slate-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary-dark">
              <LayoutDashboard size={24} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Admin</p>
              <h1 className="text-3xl font-black text-slate-800 md:text-4xl">Dashboard administrativo</h1>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Area separada para aprovar contas novas, gerenciar usuarios, autorizacao de IA e conteudos internos.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className={`rounded-2xl border-2 p-4 ${
                  metric.highlight ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    metric.highlight ? 'bg-amber-100 text-amber-700' : 'bg-white text-primary-dark'
                  }`}
                >
                  {metric.icon}
                </span>
                <p className="mt-3 text-3xl font-black text-slate-800">{metric.value}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">{metric.label}</p>
              </div>
            ))}
          </div>

          {pending > 0 ? (
            <Link
              href="/admin/accounts"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white transition hover:bg-primary-dark"
            >
              <UserCheck size={16} />
              Revisar {pending} {pending === 1 ? 'conta' : 'contas'} agora
            </Link>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-[1.5rem] border-2 border-slate-100 bg-white p-5 shadow-sm transition hover:border-primary hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-primary-dark">
                  {card.icon}
                </span>
                {card.badge ? (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    {card.badge}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-4 text-xl font-black text-slate-800">{card.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{card.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
