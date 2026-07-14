'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, RotateCcw } from 'lucide-react';

import { api, type AdminUser, type AIProvider } from '@/lib/api';

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-32 animate-pulse rounded-2xl border-2 border-slate-100 bg-slate-50" />
      ))}
    </div>
  );
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [forms, setForms] = useState<Record<number, { provider: string; model: string; base_url: string; api_key: string }>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [userList, providerList] = await Promise.all([
        api.adminListUsers(),
        api.getAIProviders(),
      ]);
      setUsers(userList);
      setProviders(providerList);
      setForms(Object.fromEntries(userList.map((user) => [
        user.id,
        {
          provider: user.ai_settings.provider,
          model: user.ai_settings.model,
          base_url: user.ai_settings.base_url ?? '',
          api_key: '',
        },
      ])));
      setMessage(null);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel carregar usuarios.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function updateForm(userId: number, field: 'provider' | 'model' | 'base_url' | 'api_key', value: string) {
    setForms((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? {
          provider: 'gemini',
          model: 'gemini-3.1-flash-lite',
          base_url: '',
          api_key: '',
        }),
        [field]: value,
      },
    }));
  }

  async function saveUserSettings(user: AdminUser) {
    const form = forms[user.id];
    if (!form) return;
    if (!user.ai_settings.has_api_key && !form.api_key.trim()) {
      setMessage({ tone: 'error', text: 'Cole a chave de API antes de salvar para este usuario.' });
      return;
    }

    setSavingUserId(user.id);
    setMessage(null);
    try {
      const saved = await api.adminSaveUserAISettings(user.id, {
        provider: form.provider,
        model: form.model,
        base_url: form.base_url.trim() || undefined,
        use_global_key: false,
        ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
      });
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, ai_settings: saved } : item
      )));
      setForms((current) => ({
        ...current,
        [user.id]: {
          provider: saved.provider,
          model: saved.model,
          base_url: saved.base_url ?? '',
          api_key: '',
        },
      }));
      setMessage({ tone: 'success', text: `Chave de IA salva para ${user.email}.` });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel salvar a chave de IA.',
      });
    } finally {
      setSavingUserId(null);
    }
  }

  async function authorizeUserWithGlobalKey(user: AdminUser) {
    const form = forms[user.id] ?? {
      provider: user.ai_settings.provider,
      model: user.ai_settings.model,
      base_url: user.ai_settings.base_url ?? '',
      api_key: '',
    };

    setSavingUserId(user.id);
    setMessage(null);
    try {
      const saved = await api.adminSaveUserAISettings(user.id, {
        provider: form.provider,
        model: form.model,
        base_url: form.base_url.trim() || undefined,
        use_global_key: true,
      });
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, ai_settings: saved } : item
      )));
      setForms((current) => ({
        ...current,
        [user.id]: {
          provider: saved.provider,
          model: saved.model,
          base_url: saved.base_url ?? '',
          api_key: '',
        },
      }));
      setMessage({ tone: 'success', text: `${user.email} autorizado a usar a chave global do servidor.` });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel autorizar o uso da IA.',
      });
    } finally {
      setSavingUserId(null);
    }
  }

  if (loading) {
    return <LoadingRows />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary-dark">Usuarios</p>
          <h2 className="text-2xl font-black text-slate-800">Autorizar IA por conta</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Autorize uma conta criada a usar a chave global do servidor ou salve uma chave propria para ela.
          </p>
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

      {users.map((user) => {
        const form = forms[user.id] ?? {
          provider: user.ai_settings.provider,
          model: user.ai_settings.model,
          base_url: user.ai_settings.base_url ?? '',
          api_key: '',
        };
        const provider = providers.find((item) => item.id === form.provider);
        const saving = savingUserId === user.id;

        return (
          <article key={user.id} className="rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">{user.first_name} {user.last_name}</h3>
                <p className="break-all text-sm font-bold text-slate-500">{user.email}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Login: {user.auth_provider} - Criado em {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
                user.ai_settings.has_api_key || user.ai_settings.use_global_key ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <KeyRound size={13} />
                {user.ai_settings.use_global_key
                  ? 'Autorizado pela chave global'
                  : user.ai_settings.has_api_key
                    ? `Chave ${user.ai_settings.api_key_preview ?? 'salva'}`
                    : 'Sem autorizacao'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-black text-slate-700">
                Provedor
                <select
                  value={form.provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value;
                    const selectedProvider = providers.find((item) => item.id === nextProvider);
                    updateForm(user.id, 'provider', nextProvider);
                    if (selectedProvider) updateForm(user.id, 'model', selectedProvider.default_model);
                  }}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                >
                  {providers.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-black text-slate-700">
                Modelo
                <input
                  value={form.model}
                  onChange={(event) => updateForm(user.id, 'model', event.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                />
              </label>
              <label className="text-sm font-black text-slate-700 md:col-span-2">
                Base URL
                <input
                  value={form.base_url}
                  onChange={(event) => updateForm(user.id, 'base_url', event.target.value)}
                  placeholder={provider?.requires_base_url ? 'URL obrigatoria para este provedor' : 'Opcional'}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                />
              </label>
              <label className="text-sm font-black text-slate-700 md:col-span-2">
                Nova chave API
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(event) => updateForm(user.id, 'api_key', event.target.value)}
                  placeholder="Cole a nova chave"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => authorizeUserWithGlobalKey(user)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                Autorizar IA
              </button>
              <button
                type="button"
                onClick={() => void saveUserSettings(user)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                {saving ? 'Salvando...' : 'Salvar chave'}
              </button>
            </div>
          </article>
        );
      })}

      {users.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
          Nenhum usuario cadastrado ainda.
        </p>
      ) : null}
    </div>
  );
}
