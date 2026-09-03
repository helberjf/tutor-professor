'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';

import { ApiError, api, type AccountStatus } from '@/lib/api';

type VerifyState =
  | { kind: 'checking' }
  | { kind: 'done'; status: AccountStatus }
  | { kind: 'failed'; message: string };

function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<VerifyState>({ kind: 'checking' });
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'failed', message: 'O link esta incompleto. Abra-o direto do e-mail.' });
      return;
    }
    let cancelled = false;
    api.verifyEmail(token)
      .then((profile) => {
        if (!cancelled) setState({ kind: 'done', status: profile.status });
      })
      .catch((cause) => {
        if (cancelled) return;
        setState({
          kind: 'failed',
          message:
            cause instanceof ApiError
              ? (cause.detail ?? cause.message)
              : 'Nao foi possivel confirmar o e-mail.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === 'checking') {
    return (
      <div className="kid-surface flex items-center justify-center gap-3 p-10">
        <Loader2 className="animate-spin text-primary" size={26} />
        <span className="text-base font-bold text-slate-600">Confirmando seu e-mail...</span>
      </div>
    );
  }

  if (state.kind === 'done') {
    return (
      <div className="kid-surface border-emerald-200 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-emerald-600" size={28} />
          <h1 className="text-2xl font-black text-slate-800 md:text-3xl">E-mail confirmado</h1>
        </div>
        <p className="mt-4 text-base leading-7 text-slate-600">
          {state.status === 'approved'
            ? 'Sua conta esta liberada. Bons estudos!'
            : 'Agora sua conta aguarda a liberacao do administrador. Avisaremos assim que for aprovada.'}
        </p>
        <Link
          href="/study"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 text-base font-black text-white transition hover:bg-primary-dark"
        >
          Ir para o app
        </Link>
      </div>
    );
  }

  return (
    <div className="kid-surface border-amber-200 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <MailWarning className="text-amber-600" size={28} />
        <h1 className="text-2xl font-black text-slate-800 md:text-3xl">Link invalido ou expirado</h1>
      </div>
      <p className="mt-4 text-base leading-7 text-slate-600">{state.message}</p>

      {resent ? (
        <p className="mt-6 rounded-2xl bg-emerald-50 p-4 text-base font-bold text-emerald-800">
          Se existir uma conta pendente com esse e-mail, enviamos um link novo.
        </p>
      ) : (
        <form
          className="mt-6 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void api.resendVerificationEmail(resendEmail.trim())
              .catch(() => undefined)
              .finally(() => setResent(true));
          }}
        >
          <label className="grid gap-2">
            <span className="text-sm font-black text-slate-600">E-mail da conta</span>
            <input
              type="email"
              required
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
              className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-primary"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 text-base font-black text-white transition hover:bg-primary-dark"
          >
            Enviar link novo
          </button>
        </form>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-4 py-10">
      <Suspense fallback={<div className="kid-surface p-6">Carregando...</div>}>
        <VerifyEmail />
      </Suspense>
    </main>
  );
}
