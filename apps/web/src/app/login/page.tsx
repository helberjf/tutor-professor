'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

import { ApiError, api } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/parents';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');

    try {
      await api.parentLogin(password.trim());
      router.push(next);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? 'Senha incorreta. Tente de novo.'
          : err instanceof ApiError
            ? err.detail || 'Nao foi possivel entrar.'
            : 'Nao foi possivel entrar.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
      {/* Header */}
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-primary-dark"
        >
          <ArrowLeft size={16} />
          Voltar ao inicio
        </Link>
      </div>

      {/* Card */}
      <div className="mx-auto mt-10 w-full max-w-md">
        {/* Icon + title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-sky-100 via-amber-50 to-emerald-100 shadow-[0_16px_40px_rgba(14,165,233,0.15)]">
            <ShieldCheck className="text-primary-dark" size={32} />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Area restrita</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">Area dos pais</h1>
          <p className="mt-2 text-base text-slate-500">
            Digite a senha para acessar as configuracoes.
          </p>
        </div>

        <div className="kid-surface border-slate-200/60 p-7 md:p-9">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
                Senha
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Lock size={16} className="text-slate-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white py-3 pl-10 pr-11 text-base text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-primary disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="kid-button w-full bg-primary hover:bg-primary-dark"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
            A senha padrao e <span className="font-bold">tutor123</span>. Troque em{' '}
            <code className="font-mono font-bold">apps/api/.env</code> na variavel{' '}
            <code className="font-mono font-bold">PARENT_PASSWORD</code>.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
