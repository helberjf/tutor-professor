'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { PasswordStrengthMeter } from '@/components/password-strength-meter';

/**
 * Password and sessions, handled by the account itself.
 *
 * Both actions end every session on purpose, including this one: a password
 * change that leaves the old sessions alive protects nobody.
 */
export function AccountSecuritySection() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'sessions' | null>(null);
  const [error, setError] = useState('');

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy('password');
    setError('');
    try {
      await api.changeOwnPassword(currentPassword, newPassword);
      await api.userLogout().catch(() => undefined);
      router.replace('/login?senha=alterada');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel trocar a senha.');
      setBusy(null);
    }
  }

  async function revokeSessions() {
    setBusy('sessions');
    setError('');
    try {
      await api.revokeOwnSessions();
      await api.userLogout().catch(() => undefined);
      router.replace('/login?sessoes=encerradas');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel encerrar as sessoes.');
      setBusy(null);
    }
  }

  return (
    <section className="kid-surface mb-6 border-slate-200 p-5 md:p-8">
      <div className="flex items-center gap-3">
        <KeyRound className="text-slate-700" size={28} />
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Seguranca</p>
          <h2 className="text-2xl font-black text-slate-800 md:text-3xl">Senha e acessos</h2>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>
      ) : null}

      <form onSubmit={changePassword} className="mt-6 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-600">Senha atual</span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-primary"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-600">Nova senha</span>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-primary"
          />
        </label>
        <PasswordStrengthMeter password={newPassword} />
        <p className="text-sm font-semibold text-slate-500">
          Trocar a senha encerra todas as sessoes, inclusive esta.
        </p>
        <button
          type="submit"
          disabled={busy !== null}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {busy === 'password' ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
          Trocar senha
        </button>
      </form>

      <button
        type="button"
        onClick={() => void revokeSessions()}
        disabled={busy !== null}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-60"
      >
        {busy === 'sessions' ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
        Sair de todos os aparelhos
      </button>
    </section>
  );
}
