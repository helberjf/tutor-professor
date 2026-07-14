'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { ArrowLeft, Chrome, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';

import { ApiError, api } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/parents';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError('');

    try {
      await api.userLogin(email.trim(), password);
      const adminResult = await api.adminCheck().catch(() => ({ is_admin: false, email: '' }));
      const isDefaultLogin = next === '/parents' || next === '/dashboard';
      const isAdminDefaultLogin = adminResult.is_admin && isDefaultLogin;
      router.push(isAdminDefaultLogin ? '/admin' : next);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? 'E-mail ou senha incorretos.'
          : err instanceof ApiError
            ? (err.detail ?? 'Não foi possível entrar.')
            : 'Não foi possível entrar.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');
    try {
      window.location.href = await api.getGoogleLoginUrl(next);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (err.detail ?? err.message)
          : 'Não foi possível iniciar o login com Google.';
      setError(message);
      setGoogleLoading(false);
    }
  }

  const inputCls =
    'w-full rounded-2xl border-2 border-slate-200 bg-white py-3 pl-10 pr-4 text-base text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-primary disabled:opacity-60';

  return (
    <div className="flex min-h-screen flex-col px-3 py-5 sm:px-4 sm:py-6">
      {/* Header */}
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-primary-dark"
        >
          <ArrowLeft size={16} />
          Voltar ao início
        </Link>
      </div>

      {/* Card */}
      <div className="mx-auto mt-6 w-full max-w-md sm:mt-10">
        {/* Icon + title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-sky-100 via-amber-50 to-emerald-100 shadow-[0_16px_40px_rgba(14,165,233,0.15)]">
            <ShieldCheck className="text-primary-dark" size={32} />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Área restrita</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">Área dos pais</h1>
          <p className="mt-2 text-sm text-slate-500">
            Não tem conta?{' '}
            <Link href="/register" className="font-bold text-primary hover:underline">
              Cadastrar
            </Link>
          </p>
        </div>

        <div className="kid-surface border-slate-200/60 p-5 sm:p-7 md:p-9">
          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={loading || googleLoading}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            <Chrome size={18} />
            {googleLoading ? 'Abrindo Google…' : 'Entrar com Google'}
          </button>

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">ou</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
                E-mail
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Mail size={16} className="text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  disabled={loading}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Password */}
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
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  disabled={loading}
                  className={`${inputCls} pr-11`}
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
              disabled={loading || !email.trim() || !password}
              className="kid-button w-full bg-primary hover:bg-primary-dark"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
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
