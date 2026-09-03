'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Loader2, Mail, ShieldCheck } from 'lucide-react';

import { ApiError, api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.forgotPassword(email.trim());
      // The API answers the same way whether or not the address has an account,
      // and so does this screen: anything else would let a stranger check who is
      // registered here.
      setSent(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-4 py-10">
      <Link href="/login" className="-ml-2 mb-6 inline-flex min-h-11 items-center gap-2 px-2 text-base font-bold text-primary-dark hover:text-primary">
        <ArrowLeft size={20} /> Voltar para o login
      </Link>

      <div className="kid-surface border-primary/40 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-primary-dark" size={28} />
          <h1 className="text-2xl font-black text-slate-800 md:text-3xl">Esqueci minha senha</h1>
        </div>

        {sent ? (
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <p className="text-base font-bold text-emerald-800">
              Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              O link vale por 1 hora. Confira tambem a caixa de spam.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <p className="text-base leading-7 text-slate-600">
              Informe o e-mail da conta. Enviaremos um link para voce criar uma senha nova.
            </p>
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-600">E-mail</span>
              <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-4 transition focus-within:border-primary">
                <Mail size={18} className="text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-12 w-full bg-transparent text-base font-semibold text-slate-700 outline-none"
                />
              </div>
            </label>

            {error ? (
              <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-black text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />}
              Enviar link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
