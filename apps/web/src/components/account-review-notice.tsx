'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Clock, LogOut, RefreshCw, ShieldX } from 'lucide-react';

import { api, type AccountStatus, type UserProfile } from '@/lib/api';

/**
 * Shown in place of the app while an account waits in the administrator's queue.
 *
 * The person is logged in — the session exists so the app can explain the wait
 * instead of bouncing them back to the login form with no reason given.
 */
export function AccountReviewNotice({
  user,
  onRecheck,
}: {
  user: UserProfile;
  onRecheck: () => void;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const status: AccountStatus = user.status;
  const rejected = status === 'rejected';

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.userLogout();
    } finally {
      router.replace('/login');
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-6 md:py-10">
      <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center md:min-h-[70vh]">
        <div className="w-full rounded-[1.5rem] border-4 border-slate-100 bg-white p-6 text-center shadow-[0_30px_80px_rgba(14,165,233,0.18)] md:rounded-[2rem] md:p-10">
          <div className="mb-5 flex justify-center">
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-[1.25rem] ${
                rejected ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
              }`}
            >
              {rejected ? <ShieldX size={32} /> : <Clock size={32} />}
            </span>
          </div>

          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">
            {rejected ? 'Acesso recusado' : 'Conta em análise'}
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">
            {rejected ? 'Seu acesso foi recusado' : 'Aguardando aprovação'}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">
            {rejected
              ? 'O administrador não liberou esta conta. Se você acha que foi um engano, fale com quem administra o app.'
              : 'Sua conta foi criada e está na fila do administrador. Assim que ela for aprovada, é só recarregar esta página para entrar.'}
          </p>

          <p className="mt-4 break-all text-sm font-bold text-slate-500">{user.email}</p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {!rejected ? (
              <button
                type="button"
                onClick={onRecheck}
                disabled={loggingOut}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-black text-white transition hover:bg-primary-dark disabled:opacity-60"
              >
                <RefreshCw size={17} />
                Verificar de novo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-slate-200 px-6 py-3 text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <LogOut size={17} />
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
