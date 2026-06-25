'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Bot, Brain, ClipboardList, Trophy } from 'lucide-react';

const tabs = [
  { href: '/lesson', label: 'Licao', icon: BookOpen },
  { href: '/study', label: 'Estudos', icon: ClipboardList },
  { href: '/quiz', label: 'Quiz', icon: Trophy },
  { href: '/review', label: 'Revisao', icon: Brain },
  { href: '/chat', label: 'Chat', icon: Bot },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/90 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegacao rapida"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[3.75rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[0.68rem] font-bold transition ${
                  isActive ? 'text-primary-dark' : 'text-slate-400'
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    isActive ? 'bg-primary-light' : 'bg-transparent'
                  }`}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
