'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, Bot, Brain, ClipboardList, GraduationCap, Home, Library, Link2, LogIn, Menu, Settings, Trophy, UserPlus, X } from 'lucide-react';

const primaryLinks = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/lesson', label: 'Licao', icon: BookOpen },
  { href: '/study', label: 'Estudos', icon: ClipboardList },
  { href: '/quiz', label: 'Quiz', icon: Trophy },
  { href: '/review', label: 'Revisao', icon: Brain },
  { href: '/chat', label: 'Chat', icon: Bot },
  { href: '/books', label: 'Livros', icon: Library },
  { href: '/parents', label: 'Area de pais', icon: Settings },
];

const authLinks = [
  { href: '/login', label: 'Entrar', icon: LogIn },
  { href: '/register', label: 'Cadastrar', icon: UserPlus },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="fixed left-0 top-0 z-40 w-full border-b border-white/70 bg-white/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-sky-400 via-indigo-500 to-emerald-400 shadow-[0_16px_32px_rgba(14,165,233,0.25)]">
              <GraduationCap size={22} className="text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-slate-400 md:text-sm">Language Tutor</p>
              <p className="truncate text-base font-black text-slate-800 md:text-lg">English Kids Tutor</p>
            </div>
          </Link>

          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-primary transition hover:border-primary focus:outline-none"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/18 backdrop-blur-sm"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />

          <aside className="fixed right-0 top-0 z-50 flex h-full w-[min(22rem,88vw)] flex-col border-l border-white/70 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="flex shrink-0 items-start justify-between gap-4 p-5 pb-0">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Menu</p>
                <h2 className="mt-2 text-2xl font-black text-slate-800">Navegacao</h2>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-primary transition hover:border-primary"
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Aprender</p>
              <ul className="mt-4 space-y-2">
                {primaryLinks.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 rounded-[1.35rem] px-4 py-3 text-base font-bold transition ${
                          isActive
                            ? 'bg-primary-light text-primary-dark'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-primary-dark'
                        }`}
                      >
                        <Icon size={19} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Conta</p>
              <ul className="mt-4 space-y-2">
                {authLinks.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  const isRegister = item.href === '/register';

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 rounded-[1.35rem] px-4 py-3 text-base font-bold transition ${
                          isActive
                            ? 'bg-primary-light text-primary-dark'
                            : isRegister
                              ? 'bg-gradient-to-r from-sky-50 to-indigo-50 text-primary-dark hover:brightness-95'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-primary-dark'
                        }`}
                      >
                        <Icon size={19} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-8 rounded-[1.6rem] border border-sky-100 bg-sky-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Suporte</p>
              <Link
                href="/connect"
                className="mt-3 flex items-start gap-3 rounded-[1.2rem] bg-white px-4 py-3 text-slate-700 transition hover:text-primary-dark"
              >
                <Link2 className="mt-0.5 text-primary-dark" size={19} />
                <span>
                  <span className="block text-base font-black">Conexao com o backend</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500">
                    Configure ou troque a URL do tunnel somente por aqui.
                  </span>
                </span>
              </Link>
            </div>

            </div>{/* end scrollable */}

            <p className="shrink-0 px-5 pb-5 pt-4 text-sm leading-6 text-slate-500">
              Se o site nao carregar as licoes, abra este menu e toque em <span className="font-bold text-slate-700">Conexao com o backend</span>.
            </p>
          </aside>
        </>
      ) : null}
    </>
  );
}
