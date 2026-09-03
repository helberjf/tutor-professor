'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, Loader2, Trash2 } from 'lucide-react';
import { ApiError, api } from '@/lib/api';

/**
 * The two rights the LGPD gives the person behind the account: a copy of the
 * data, and its deletion.
 *
 * Both are self-service on purpose. A right that requires e-mailing the owner
 * and waiting is a right in name only, and this app holds data about children.
 */
export function AccountDataSection() {
  const router = useRouter();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  async function handleExport() {
    setBusy('export');
    setError('');
    try {
      const data = await api.exportOwnAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tutor-professor-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel exportar os dados.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    setBusy('delete');
    setError('');
    try {
      await api.deleteOwnAccount(password);
      router.replace('/login?conta=apagada');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? (cause.detail ?? cause.message)
          : 'Nao foi possivel apagar a conta.',
      );
      setBusy(null);
    }
  }

  return (
    <section className="kid-surface mb-6 border-rose-200 p-5 md:p-8">
      <div className="flex items-center gap-3">
        <Download className="text-slate-700" size={28} />
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Seus dados</p>
          <h2 className="text-2xl font-black text-slate-800 md:text-3xl">Exportar ou apagar</h2>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>
      ) : null}

      <p className="mt-4 text-sm leading-6 text-slate-500">
        Baixe uma copia de tudo que guardamos sobre sua conta e sobre os perfis
        das criancas. A senha e a chave de IA nunca entram no arquivo.
      </p>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy !== null}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {busy === 'export' ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
        Baixar meus dados (JSON)
      </button>

      <div className="mt-8 rounded-[1.25rem] border-2 border-rose-100 bg-rose-50/50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={20} />
          <div className="min-w-0">
            <p className="text-lg font-black text-rose-800">Apagar a conta</p>
            <p className="mt-1 text-sm font-semibold text-rose-700">
              Remove a conta, os perfis das criancas e todo o historico de estudo.
              Nao da para desfazer. Exporte seus dados antes, se quiser guarda-los.
            </p>
          </div>
        </div>

        {confirming ? (
          <form onSubmit={handleDelete} className="mt-4 grid gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-black text-rose-800">Confirme sua senha</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-12 rounded-2xl border-2 border-rose-200 bg-white px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-rose-500"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy !== null}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {busy === 'delete' ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                Apagar definitivamente
              </button>
              <button
                type="button"
                onClick={() => { setConfirming(false); setPassword(''); }}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition hover:border-slate-400"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-white px-5 text-sm font-black text-rose-600 transition hover:bg-rose-100"
          >
            <Trash2 size={16} />
            Quero apagar minha conta
          </button>
        )}
      </div>
    </section>
  );
}
