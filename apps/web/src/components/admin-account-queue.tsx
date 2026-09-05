'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Coins, KeyRound, Loader2, RotateCcw, ShieldCheck, ShieldX, Trash2, X } from 'lucide-react';

import { api, type AccountStatus, type AdminUser } from '@/lib/api';

const FILTERS: { id: AccountStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Aguardando' },
  { id: 'approved', label: 'Aprovadas' },
  { id: 'rejected', label: 'Recusadas' },
  { id: 'all', label: 'Todas' },
];

const STATUS_BADGE: Record<AccountStatus, { label: string; className: string }> = {
  pending: { label: 'Aguardando aprovação', className: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Aprovada', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Recusada', className: 'bg-rose-50 text-rose-700' },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function AdminAccountQueue() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<AccountStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.adminListUsers());
      setMessage(null);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel carregar as contas.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const counts = useMemo(() => {
    const base: Record<AccountStatus | 'all', number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      all: users.length,
    };
    for (const user of users) base[user.status] += 1;
    return base;
  }, [users]);

  const visible = useMemo(
    () => (filter === 'all' ? users : users.filter((user) => user.status === filter)),
    [filter, users],
  );

  async function review(user: AdminUser, decision: 'approve' | 'reject') {
    setBusyUserId(user.id);
    setMessage(null);
    try {
      const note = notes[user.id]?.trim();
      const saved =
        decision === 'approve'
          ? await api.adminApproveUser(user.id, note)
          : await api.adminRejectUser(user.id, note);
      setUsers((current) => current.map((item) => (item.id === user.id ? saved : item)));
      setNotes((current) => ({ ...current, [user.id]: '' }));
      setMessage({
        tone: 'success',
        text:
          decision === 'approve'
            ? `${user.email} agora pode usar o app.`
            : `${user.email} teve o acesso recusado.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel salvar a decisao.',
      });
    } finally {
      setBusyUserId(null);
    }
  }

  // The second switch, independent of approval: an approved account still has no
  // AI until it is authorized here, and revoking it leaves the account working.
  async function setAIAccess(user: AdminUser, grant: boolean) {
    setBusyUserId(user.id);
    setMessage(null);
    try {
      const ai_settings = grant
        ? await api.adminSaveUserAISettings(user.id, {
            provider: user.ai_settings.provider,
            model: user.ai_settings.model,
            base_url: user.ai_settings.base_url ?? undefined,
            use_global_key: true,
          })
        : await api.adminRevokeUserAI(user.id);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, ai_settings } : item)),
      );
      setMessage({
        tone: 'success',
        text: grant
          ? `${user.email} pode usar a IA com a sua chave global.`
          : `${user.email} perdeu o acesso a IA, mas continua usando o app.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel mudar o acesso a IA.',
      });
    } finally {
      setBusyUserId(null);
    }
  }

  async function setCredits(
    user: AdminUser,
    payload: { credits?: number; add?: number; daily_limit?: number; unlimited?: boolean },
  ) {
    setBusyUserId(user.id);
    setMessage(null);
    try {
      const saved = await api.adminSetUserAICredits(user.id, payload);
      setUsers((current) => current.map((item) => (item.id === user.id ? saved : item)));
      setMessage({
        tone: 'success',
        text: saved.ai_credits.unlimited
          ? `${user.email} passou a usar a IA sem limite.`
          : `${user.email} ficou com ${saved.ai_credits.credits} creditos de IA.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel mudar os creditos.',
      });
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteUser(user: AdminUser) {
    const confirmed = window.confirm(
      `Apagar permanentemente a conta ${user.email}?\n\nEsta ação remove filhos, estudos, sessões e todos os dados relacionados. Não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setBusyUserId(user.id);
    setMessage(null);
    try {
      await api.adminDeleteUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setNotes((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      setMessage({ tone: 'success', text: `${user.email} foi apagada permanentemente.` });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel apagar a conta.',
      });
    } finally {
      setBusyUserId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-2xl border-2 border-slate-100 bg-slate-50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full border-2 px-4 py-2 text-sm font-black transition ${
                filter === item.id
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 text-slate-600 hover:border-primary hover:text-primary-dark'
              }`}
            >
              {item.label} ({counts[item.id]})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:border-primary hover:text-primary-dark"
        >
          <RotateCcw size={15} /> Atualizar
        </button>
      </div>

      {message ? (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-sm font-bold ${
            message.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {visible.map((user) => {
        const badge = STATUS_BADGE[user.status];
        const busy = busyUserId === user.id;
        const hasAI = user.ai_settings.use_global_key || user.ai_settings.has_api_key;
        const aiLabel = user.ai_settings.use_global_key
          ? 'IA pela chave global'
          : user.ai_settings.has_api_key
            ? 'IA com chave propria'
            : 'Sem IA';

        return (
          <article key={user.id} className="rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  {user.first_name} {user.last_name}
                  {user.is_admin ? (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-500">
                      Administrador
                    </span>
                  ) : null}
                </h3>
                <p className="break-all text-sm font-bold text-slate-500">{user.email}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Cadastro em {formatDate(user.created_at)} - login: {user.auth_provider}
                  {user.reviewed_at ? ` - decidido em ${formatDate(user.reviewed_at)}` : ''}
                </p>
                {user.review_note ? (
                  <p className="mt-2 text-xs font-bold text-slate-500">Nota: {user.review_note}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${badge.className}`}>
                  {user.status === 'rejected' ? <ShieldX size={13} /> : <ShieldCheck size={13} />}
                  {badge.label}
                </span>
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
                  hasAI ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  <KeyRound size={13} />
                  {aiLabel}
                </span>
              </div>
            </div>

            {user.is_admin ? (
              <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
                A conta do administrador não passa pela fila de aprovação.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    1. Acesso ao app
                  </p>
                  <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end">
                    <label className="flex-1 text-sm font-black text-slate-700">
                      Nota interna (opcional)
                      <input
                        value={notes[user.id] ?? ''}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [user.id]: event.target.value }))
                        }
                        placeholder="Ex.: familia conhecida, turma da escola..."
                        maxLength={300}
                        className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                      />
                    </label>
                    <div className="flex gap-2">
                      {user.status !== 'approved' ? (
                        <button
                          type="button"
                          onClick={() => void review(user, 'approve')}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                          {user.status === 'rejected' ? 'Reabrir acesso' : 'Aprovar'}
                        </button>
                      ) : null}
                      {user.status !== 'rejected' ? (
                        <button
                          type="button"
                          onClick={() => void review(user, 'reject')}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                          {user.status === 'approved' ? 'Revogar acesso' : 'Recusar'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="border-t-2 border-slate-100 pt-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    2. Acesso a IA (separado)
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold leading-6 text-slate-500">
                      {hasAI
                        ? user.ai_settings.use_global_key
                          ? 'Usa a sua chave global do servidor.'
                          : `Usa a chave propria ${user.ai_settings.api_key_preview ?? 'salva'}.`
                        : 'Aprovada ou nao, esta conta nao gera nada por IA ate voce liberar.'}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      {!user.ai_settings.use_global_key ? (
                        <button
                          type="button"
                          onClick={() => void setAIAccess(user, true)}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-sky-200 bg-sky-50 px-4 py-2 text-sm font-black text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                          Liberar minha chave
                        </button>
                      ) : null}
                      {hasAI ? (
                        <button
                          type="button"
                          onClick={() => void setAIAccess(user, false)}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2 text-sm font-black text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                          Revogar IA
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {user.ai_settings.use_global_key ? (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-700">
                          {user.ai_credits.unlimited
                            ? 'Creditos: ilimitado'
                            : `Creditos: ${user.ai_credits.credits} restantes`}
                          <span className="ml-2 text-xs font-bold text-slate-400">
                            {user.ai_credits.used} ja usados
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={() => void setCredits(user, { unlimited: !user.ai_credits.unlimited })}
                          disabled={busy}
                          className="rounded-lg border-2 border-slate-200 px-3 py-1 text-xs font-black text-slate-600 transition hover:border-slate-300 disabled:opacity-60"
                        >
                          {user.ai_credits.unlimited ? 'Voltar a cobrar creditos' : 'Deixar ilimitado'}
                        </button>
                      </div>
                      {!user.ai_credits.unlimited ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-slate-500">
                              Limite diario: {user.ai_credits.daily_limit}
                            </span>
                            <button
                              type="button"
                              onClick={() => void setCredits(user, { daily_limit: Math.max(0, user.ai_credits.daily_limit - 1) })}
                              disabled={busy || user.ai_credits.daily_limit === 0}
                              className="rounded-lg border-2 border-slate-200 px-3 py-1 text-xs font-black text-slate-600 disabled:opacity-60"
                            >
                              -1 por dia
                            </button>
                            <button
                              type="button"
                              onClick={() => void setCredits(user, { daily_limit: user.ai_credits.daily_limit + 1 })}
                              disabled={busy}
                              className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 disabled:opacity-60"
                            >
                              +1 por dia
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                          {[10, 50, 100].map((amount) => (
                            <button
                              key={amount}
                              type="button"
                              onClick={() => void setCredits(user, { add: amount })}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-lg border-2 border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700 transition hover:border-sky-300 disabled:opacity-60"
                            >
                              <Coins size={13} /> +{amount}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => void setCredits(user, { credits: 0 })}
                            disabled={busy || user.ai_credits.credits === 0}
                            className="rounded-lg border-2 border-slate-200 px-3 py-1 text-xs font-black text-slate-600 transition hover:border-slate-300 disabled:opacity-60"
                          >
                            Zerar
                          </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="border-t-2 border-rose-100 pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-rose-500">Área de risco</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                        Remove a conta e todos os dados relacionados de forma permanente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteUser(user)}
                      disabled={busy}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      Apagar conta
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {visible.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
          {filter === 'pending'
            ? 'Nenhuma conta esperando aprovação agora.'
            : 'Nenhuma conta nesta lista.'}
        </p>
      ) : null}
    </div>
  );
}
