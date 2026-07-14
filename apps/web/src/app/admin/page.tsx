'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, LayoutDashboard, Users } from 'lucide-react';

import { api } from '@/lib/api';
import { StatusCard } from '@/components/status-card';

export default function AdminDashboardPage() {
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

  const cards = [
    {
      href: '/admin/users',
      title: 'Usuarios',
      description: 'Listar contas cadastradas e autorizar o uso da IA para cada usuario.',
      icon: <Users size={22} />,
    },
    {
      href: '/admin/learn',
      title: 'Conteudo admin',
      description: 'Acessar modulos, flashcards e editor de estudos administrativos.',
      icon: <BookOpen size={22} />,
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
            Area separada para gerenciar usuarios, autorizacao de IA e conteudos internos.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-[1.5rem] border-2 border-slate-100 bg-white p-5 shadow-sm transition hover:border-primary hover:shadow-md"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-primary-dark">
                {card.icon}
              </span>
              <h2 className="mt-4 text-xl font-black text-slate-800">{card.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{card.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
