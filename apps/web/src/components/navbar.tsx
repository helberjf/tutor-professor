'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Bot, Brain, ClipboardList, GraduationCap, Home, Library, LogIn, LogOut, Menu, Settings, Trophy, UserPlus, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';

const primaryLinks = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/lesson', label: 'Lição', icon: BookOpen },
  { href: '/study', label: 'Estudos', icon: ClipboardList },
  { href: '/quiz', label: 'Quiz', icon: Trophy },
  { href: '/review', label: 'Revisão', icon: Brain },
  { href: '/chat', label: 'Chat', icon: Bot },
  { href: '/books', label: 'Livros', icon: Library },
  { href: '/parents', label: 'Área de pais', icon: Settings },
];

const authLinks = [
  { href: '/login', label: 'Entrar', icon: LogIn },
  { href: '/register', label: 'Cadastrar', icon: UserPlus },
];

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    api.getUserMe()
      .then((profile) => {
        if (!cancelled) {
          setAuthStatus('authenticated');
          setFirstName(profile.first_name.trim());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthStatus('unauthenticated');
          setFirstName('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    setAuthStatus('unauthenticated');
    setFirstName('');
    setOpen(false);
    try {
      await api.userLogout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <>
      <nav className="app-navbar fixed left-0 top-0 z-40 w-full border-b border-white/70 bg-white/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-sky-400 via-indigo-500 to-emerald-400 shadow-[0_16px_32px_rgba(14,165,233,0.25)]">
              <GraduationCap size={22} className="text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-slate-400 md:text-sm">Tutor pessoal</p>
              <p className="truncate text-sm font-black text-slate-800 md:text-lg">Tutor and Professor</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle compact className="hidden sm:inline-grid" />
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-primary transition hover:border-primary focus:outline-none"
              aria-label={open ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {open ? (
        <>
          <button
            type="button"
            className="app-menu-overlay fixed inset-0 z-40 bg-slate-900/18 backdrop-blur-sm"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />

          <aside className="app-menu-panel fixed right-0 top-0 z-50 flex h-full w-[min(22rem,88vw)] flex-col border-l border-white/70 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="flex shrink-0 items-start justify-between gap-4 p-5 pb-0">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Menu</p>
                <h2 className="mt-2 text-2xl font-black text-slate-800">
                  {authStatus === 'authenticated' && firstName
                    ? `Vamos estudar ${firstName}!`
                    : 'Navegação'}
                </h2>
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
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Aparencia</p>
                <ThemeToggle className="mt-4 w-full" />
              </div>

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
                {authStatus === 'authenticated' ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-3 rounded-[1.35rem] px-4 py-3 text-left text-base font-bold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700"
                    >
                      <LogOut size={19} />
                      Sair
                    </button>
                  </li>
                ) : null}

                {authStatus === 'unauthenticated' ? authLinks.map((item) => {
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
                }) : null}
              </ul>
            </div>

            </div>{/* end scrollable */}
          </aside>
        </>
      ) : null}
    </>
  );
}
