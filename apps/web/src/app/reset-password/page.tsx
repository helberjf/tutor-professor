'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { PasswordStrengthMeter } from '@/components/password-strength-meter';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.resetPassword(token, password);
      router.replace('/login?senha=redefinida');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? (cause.detail ?? cause.message)
          : 'Nao foi possivel redefinir a senha.',
      );
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="kid-surface border-rose-200 p-6 md:p-8">
        <h1 className="text-2xl font-black text-slate-800">Link incompleto</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Abra o link exatamente como ele chegou no seu e-mail, ou peca um novo.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 text-base font-black text-white transition hover:bg-primary-dark"
        >
          Pedir um link novo
        </Link>
      </div>
    );
  }

  return (
    <div className="kid-surface border-primary/40 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <KeyRound className="text-primary-dark" size={28} />
        <h1 className="text-2xl font-black text-slate-800 md:text-3xl">Criar uma senha nova</h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-600">Nova senha</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-primary"
          />
        </label>
        <PasswordStrengthMeter password={password} />

        {error ? (
          <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>
        ) : null}

        <p className="text-sm font-semibold text-slate-500">
          Ao redefinir, todas as sessoes abertas com a senha antiga sao encerradas.
        </p>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-black text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />}
          Redefinir senha
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-4 py-10">
      <Link href="/login" className="-ml-2 mb-6 inline-flex min-h-11 items-center gap-2 px-2 text-base font-bold text-primary-dark hover:text-primary">
        <ArrowLeft size={20} /> Voltar para o login
      </Link>
      <Suspense fallback={<div className="kid-surface p-6">Carregando...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
