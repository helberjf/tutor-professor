'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import { StatusCard } from '@/components/status-card';
import { api } from '@/lib/api';

import {
  clearSavedApiBaseUrl,
  getApiConnectionDetails,
  refreshRuntimeBackendConfig,
  saveApiBaseUrl,
  subscribeToApiBaseUrlChange,
  verifySavedApiBaseUrl,
} from '@/lib/api-config';
import { t } from '@/lib/i18n';

function describeConnection() {
  const connection = getApiConnectionDetails();

  if (!connection.baseUrl) {
    return {
      ...connection,
      title: t("Ainda não existe um backend conectado neste aparelho."),
      detail: t("Cole a URL HTTPS atual do seu Cloudflare Tunnel para conectar o app."),
    };
  }

  if (connection.source === 'saved') {
    return {
      ...connection,
      title: `Conectado a ${connection.host}`,
      detail: t("Essa URL manual vale neste aparelho enquanto não houver uma URL global publicada na Vercel."),
    };
  }

  if (connection.source === 'global') {
    return {
      ...connection,
      title: `Usando backend global em ${connection.host}`,
      detail: t("Essa URL vem da configuração compartilhada publicada na Vercel e vale como padrão para todos os aparelhos no próximo acesso."),
    };
  }

  if (connection.source === 'development') {
    return {
      ...connection,
      title: `Usando backend local em ${connection.host}`,
      detail: t("Isso vem do modo de desenvolvimento local nesta máquina."),
    };
  }

  return {
    ...connection,
    title: `Usando backend padrão em ${connection.host}`,
    detail: t("Essa URL padrão veio de NEXT_PUBLIC_API_BASE_URL."),
  };
}

export default function ConnectPage() {
  const [accessChecked, setAccessChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [connection, setConnection] = useState(describeConnection);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const autoConnectHandledRef = useRef(false);

  useEffect(() => {
    api.adminCheck()
      .then((result) => setIsAdmin(result.is_admin))
      .catch(() => setIsAdmin(false))
      .finally(() => setAccessChecked(true));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const sync = () => {
      const nextConnection = describeConnection();
      setConnection(nextConnection);
      setDraft(nextConnection.source === 'saved' ? nextConnection.baseUrl || '' : '');
    };
    sync();
    void refreshRuntimeBackendConfig().then(sync);
    return subscribeToApiBaseUrlChange(sync);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || autoConnectHandledRef.current || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const apiUrl = params.get('apiUrl')?.trim() || '';
    const shouldAutoConnect = params.get('auto') === '1';
    if (!apiUrl) {
      return;
    }

    autoConnectHandledRef.current = true;
    setDraft(apiUrl);

    if (!shouldAutoConnect) {
      setMessage(t("A URL do backend foi preenchida a partir do link. Revise e toque em salvar."));
      return;
    }

    let cancelled = false;

    async function autoConnectFromLink() {
      setSaving(true);
      setMessage(t("Validando a URL recebida do seu link de conexão..."));
      setError('');

      const result = await verifySavedApiBaseUrl(apiUrl);
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setError(result.message);
        setMessage('');
        setSaving(false);
        return;
      }

      saveApiBaseUrl(result.baseUrl);
      setDraft(result.baseUrl);
      setConnection(describeConnection());
      setMessage(t("Backend conectado automaticamente neste aparelho. Agora você já pode voltar ao início."));
      setSaving(false);
      window.history.replaceState({}, '', '/connect');
    }

    void autoConnectFromLink();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    const result = await verifySavedApiBaseUrl(draft);
    if (!result.ok) {
      setError(result.message);
      setSaving(false);
      return;
    }

    saveApiBaseUrl(result.baseUrl);
    setDraft(result.baseUrl);
    setConnection(describeConnection());
    setMessage(t("Backend conectado neste aparelho. Agora você já pode voltar ao início."));
    setSaving(false);
  }

  function handleClearOverride() {
    clearSavedApiBaseUrl();
    setDraft('');
    setMessage(t("A conexão salva foi removida. O app vai usar a configuração global ou a URL padrão, se existir."));
    setError('');
    setConnection(describeConnection());
  }

  if (!accessChecked) {
    return <StatusCard tone="loading" title={t("Verificando acesso")} message={t("Confirmando permissões de administrador...")} />;
  }

  if (!isAdmin) {
    return (
      <StatusCard
        tone="error"
        title={t("Acesso restrito")}
        message={t("A configuração técnica do backend está disponível somente para o administrador.")}
        secondaryHref="/"
        secondaryLabel={t("Voltar ao início")}
      />
    );
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> {t("Voltar")}
          </Link>
          <p className="app-tag">{t("Conexão com o backend")}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <section className="app-surface border-primary/40 p-5 md:p-10">
            <div className="inline-flex rounded-[1.5rem] bg-primary-light p-4">
              <Link2 className="text-primary-dark" size={34} />
            </div>
            <h1 className="mt-4 text-2xl font-black text-slate-800 sm:text-3xl md:mt-5 md:text-4xl">{t("Conecte este aparelho ao seu backend")}</h1>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 md:text-xl md:leading-9">
              {t("Rode o backend no seu computador, abra um Cloudflare Tunnel para a porta `8001` e depois cole aqui a URL HTTPS completa.")}
            </p>

            <div className="mt-8 rounded-[1.5rem] border-2 border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">{t("Conexão atual")}</p>
              <p className="mt-3 text-xl font-black text-slate-800 md:text-2xl">{connection.title}</p>
              <p className="mt-3 text-base leading-7 text-slate-600 md:text-lg md:leading-8">{connection.detail}</p>
              {connection.baseUrl ? (
                <p className="mt-4 break-all rounded-[1.25rem] bg-white px-4 py-3 text-base font-bold text-slate-700">
                  {connection.baseUrl}
                </p>
              ) : null}
            </div>

            <form onSubmit={handleSave} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">{t("URL do tunnel")}</label>
                <input
              aria-label="https://random-name.trycloudflare.com"
                  type="url"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3 text-base outline-none transition focus:border-primary md:py-4 md:text-lg"
                  placeholder="https://random-name.trycloudflare.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50 p-5 text-slate-700">
                <p className="text-base font-bold uppercase tracking-[0.16em] text-sky-700">{t("No seu computador")}</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-7 text-sky-900">
cloudflared tunnel --url http://127.0.0.1:8001
                </pre>
                <p className="mt-3 text-base leading-7">
                  {t("Copie a URL HTTPS que o Cloudflare mostrar. Não use o ID do túnel nem o seu IP público.")}
                </p>
              </div>

              {error ? <p className="text-center text-sm font-bold text-brand-pink">{error}</p> : null}
              {message ? <p className="text-center text-sm font-bold text-emerald-600">{message}</p> : null}

              <div className="flex flex-col gap-4 sm:flex-row">
                <button type="submit" disabled={saving || !draft.trim()} className="app-button bg-primary-dark hover:bg-primary-dark">
                  {saving ? 'Verificando...' : t("Salvar conexão")}
                  <CheckCircle2 className="ml-2" size={18} />
                </button>
                <Link
                  href="/"
                  className="rounded-full border-2 border-slate-200 px-6 py-4 text-center text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                >
                  {t("Abrir início")}
                </Link>
                {connection.source === 'saved' ? (
                  <button
                    type="button"
                    onClick={handleClearOverride}
                    className="rounded-full border-2 border-slate-200 px-6 py-4 text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                  >
                    {t("Limpar URL salva")}
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="app-surface border-secondary/40 p-5 md:p-10">
            <div className="inline-flex rounded-[1.5rem] bg-secondary-light p-4">
              <ShieldCheck className="text-secondary-dark" size={34} />
            </div>
            <h2 className="mt-4 text-2xl font-black text-slate-800 md:mt-5 md:text-3xl">{t("Como isso funciona")}</h2>
            <div className="mt-5 space-y-4 text-base leading-7 text-slate-600 md:mt-6 md:text-lg md:leading-8">
              <p>{t("A URL manual continua funcionando neste navegador quando não houver uma URL global publicada. Se você usar outro celular, tablet ou computador, você ainda pode salvar uma URL diferente so naquele aparelho.")}</p>
              <p>{t("Quando o launcher pública uma configuração global na Vercel, o app troca automaticamente para essa URL no próximo acesso.")}</p>
              <p>{t("Quando a URL do tunnel mudar em outro dia, abra esta página de novo, cole a nova URL HTTPS e salve. Não precisa fazer novo deploy na Vercel.")}</p>
              <p>{t("Se depois você mover o backend para uma VPS, pode continuar usando esta página como override de emergência ou limpar e voltar para a URL padrão.")}</p>
            </div>

            <div className="mt-8 rounded-[1.5rem] border-2 border-amber-100 bg-amber-50 p-5">
              <div className="flex items-center gap-3 text-amber-700">
                <RefreshCw size={24} />
                <p className="text-lg font-black">{t("Checagem do dia")}</p>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-700">
                {t("Antes de abrir o site de outro lugar, confirme que o seu computador está ligado, o backend FastAPI está rodando e o túnel está ativo.")}
              </p>
              <p className="mt-3 text-base leading-7 text-slate-700">
                {t("Se preferir, envie o link pronto do terminal. Quando ele abrir este `/connect`, o app tenta salvar a URL automaticamente neste aparelho.")}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
