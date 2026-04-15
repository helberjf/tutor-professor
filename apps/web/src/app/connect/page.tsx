'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Link2, RefreshCw, ShieldCheck } from 'lucide-react';

import {
  clearSavedApiBaseUrl,
  getApiConnectionDetails,
  refreshRuntimeBackendConfig,
  saveApiBaseUrl,
  subscribeToApiBaseUrlChange,
  verifySavedApiBaseUrl,
} from '@/lib/api-config';

function describeConnection() {
  const connection = getApiConnectionDetails();

  if (!connection.baseUrl) {
    return {
      ...connection,
      title: 'Ainda nao existe um backend conectado neste aparelho.',
      detail: 'Cole a URL HTTPS atual do seu Cloudflare Tunnel para conectar o app.',
    };
  }

  if (connection.source === 'saved') {
    return {
      ...connection,
      title: `Conectado a ${connection.host}`,
      detail: 'Essa URL salva substitui qualquer URL padrao da API neste aparelho.',
    };
  }

  if (connection.source === 'global') {
    return {
      ...connection,
      title: `Usando backend global em ${connection.host}`,
      detail: 'Essa URL vem da configuracao compartilhada publicada na Vercel e vale como padrao para todos os aparelhos no proximo acesso.',
    };
  }

  if (connection.source === 'development') {
    return {
      ...connection,
      title: `Usando backend local em ${connection.host}`,
      detail: 'Isso vem do modo de desenvolvimento local nesta maquina.',
    };
  }

  return {
    ...connection,
    title: `Usando backend padrao em ${connection.host}`,
    detail: 'Essa URL padrao veio de NEXT_PUBLIC_API_BASE_URL.',
  };
}

export default function ConnectPage() {
  const [connection, setConnection] = useState(describeConnection);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const autoConnectHandledRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      const nextConnection = describeConnection();
      setConnection(nextConnection);
      setDraft(nextConnection.source === 'saved' ? nextConnection.baseUrl || '' : '');
    };
    sync();
    void refreshRuntimeBackendConfig().then(sync);
    return subscribeToApiBaseUrlChange(sync);
  }, []);

  useEffect(() => {
    if (autoConnectHandledRef.current || typeof window === 'undefined') {
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
      setMessage('A URL do backend foi preenchida a partir do link. Revise e toque em salvar.');
      return;
    }

    let cancelled = false;

    async function autoConnectFromLink() {
      setSaving(true);
      setMessage('Validando a URL recebida do seu link de conexao...');
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
      setMessage('Backend conectado automaticamente neste aparelho. Agora voce ja pode voltar ao inicio.');
      setSaving(false);
      window.history.replaceState({}, '', '/connect');
    }

    void autoConnectFromLink();

    return () => {
      cancelled = true;
    };
  }, []);

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
    setMessage('Backend conectado neste aparelho. Agora voce ja pode voltar ao inicio.');
    setSaving(false);
  }

  function handleClearOverride() {
    clearSavedApiBaseUrl();
    setDraft('');
    setMessage('A conexao salva foi removida. O app vai usar a configuracao global ou a URL padrao, se existir.');
    setError('');
    setConnection(describeConnection());
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Voltar
          </Link>
          <p className="kid-tag">Conexao com o backend</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <section className="kid-surface border-primary/40 p-5 md:p-10">
            <div className="inline-flex rounded-[1.5rem] bg-primary-light p-4">
              <Link2 className="text-primary-dark" size={34} />
            </div>
            <h1 className="mt-4 text-3xl font-black text-slate-800 md:mt-5 md:text-4xl">Conecte este aparelho ao seu backend</h1>
            <p className="mt-4 text-lg leading-8 text-slate-600 md:text-xl md:leading-9">
              Rode o backend no seu computador, abra um Cloudflare Tunnel para a porta `8001` e depois cole aqui a URL HTTPS completa.
            </p>

            <div className="mt-8 rounded-[1.5rem] border-2 border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Conexao atual</p>
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
                <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">URL do tunnel</label>
                <input
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
                <p className="text-base font-bold uppercase tracking-[0.16em] text-sky-700">No seu computador</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-7 text-sky-900">
cloudflared tunnel --url http://127.0.0.1:8001
                </pre>
                <p className="mt-3 text-base leading-7">
                  Copie a URL HTTPS que o Cloudflare mostrar. Nao use o ID do tunnel nem o seu IP publico.
                </p>
              </div>

              {error ? <p className="text-center text-sm font-bold text-kid-pink">{error}</p> : null}
              {message ? <p className="text-center text-sm font-bold text-emerald-600">{message}</p> : null}

              <div className="flex flex-col gap-4 sm:flex-row">
                <button type="submit" disabled={saving || !draft.trim()} className="kid-button bg-primary hover:bg-primary-dark">
                  {saving ? 'Verificando...' : 'Salvar conexao'}
                  <CheckCircle2 className="ml-2" size={18} />
                </button>
                <Link
                  href="/"
                  className="rounded-full border-2 border-slate-200 px-6 py-4 text-center text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                >
                  Abrir inicio
                </Link>
                {connection.source === 'saved' ? (
                  <button
                    type="button"
                    onClick={handleClearOverride}
                    className="rounded-full border-2 border-slate-200 px-6 py-4 text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                  >
                    Limpar URL salva
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="kid-surface border-secondary/40 p-5 md:p-10">
            <div className="inline-flex rounded-[1.5rem] bg-secondary-light p-4">
              <ShieldCheck className="text-secondary-dark" size={34} />
            </div>
            <h2 className="mt-4 text-2xl font-black text-slate-800 md:mt-5 md:text-3xl">Como isso funciona</h2>
            <div className="mt-5 space-y-4 text-base leading-7 text-slate-600 md:mt-6 md:text-lg md:leading-8">
              <p>A URL salva do backend continua funcionando como override manual neste navegador. Se a crianca usar outro celular, tablet ou computador, voce ainda pode salvar uma URL diferente so naquele aparelho.</p>
              <p>Se existir uma configuracao global publicada pela Vercel, ela aparece automaticamente aqui como padrao e vale no proximo acesso ao site.</p>
              <p>Quando a URL do tunnel mudar em outro dia, abra esta pagina de novo, cole a nova URL HTTPS e salve. Nao precisa fazer novo deploy na Vercel.</p>
              <p>Se depois voce mover o backend para uma VPS, pode continuar usando esta pagina como override de emergencia ou limpar e voltar para a URL padrao.</p>
            </div>

            <div className="mt-8 rounded-[1.5rem] border-2 border-amber-100 bg-amber-50 p-5">
              <div className="flex items-center gap-3 text-amber-700">
                <RefreshCw size={24} />
                <p className="text-lg font-black">Checagem do dia</p>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Antes de a crianca abrir o site de outra casa, confirme que o seu computador esta ligado, o backend FastAPI esta rodando e o tunnel esta ativo.
              </p>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Se preferir, envie o link pronto do terminal. Quando ele abrir este `/connect`, o app tenta salvar a URL automaticamente neste aparelho.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
