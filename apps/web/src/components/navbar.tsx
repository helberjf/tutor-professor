'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Link2, Menu, X } from 'lucide-react';

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed left-0 top-0 z-40 w-full bg-white/80 shadow-sm backdrop-blur-md">
      <div className="flex h-14 items-center px-4">
        <button
          className="mr-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-primary hover:border-primary focus:outline-none"
          aria-label="Abrir menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
        <span className="font-baloo text-lg font-black text-primary">Tutor de Ingles</span>
      </div>
      {open ? (
        <div className="absolute left-0 top-14 w-64 rounded-br-2xl border-b-4 border-r-4 border-white/70 bg-white/95 p-6 shadow-xl animate-in fade-in slide-in-from-left-8">
          <ul className="space-y-4">
            <li>
              <Link
                href="/connect"
                className="flex items-center gap-2 text-base font-bold text-primary hover:text-primary-dark"
                onClick={() => setOpen(false)}
              >
                <Link2 size={18} /> Conexao com backend
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
