'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Link2, RefreshCw, ShieldCheck } from 'lucide-react';

import {
  clearSavedApiBaseUrl,
  getApiConnectionDetails,
  saveApiBaseUrl,
  subscribeToApiBaseUrlChange,
  verifySavedApiBaseUrl,
} from '@/lib/api-config';

function describeConnection() {
  const connection = getApiConnectionDetails();

  if (!connection.baseUrl) {
    return {
      ...connection,
      title: 'No backend connected on this device yet.',
      detail: 'Paste the current HTTPS URL from your Cloudflare Tunnel to connect the app.',
    };
  }

  if (connection.source === 'saved') {
    return {
      ...connection,
      title: `Connected to ${connection.host}`,
      detail: 'This saved URL overrides any default API URL on this device.',
    };
  }

  if (connection.source === 'development') {
    return {
      ...connection,
      title: `Using local backend at ${connection.host}`,
      detail: 'This comes from local development mode on this machine.',
    };
  }

  return {
    ...connection,
    title: `Using default backend at ${connection.host}`,
    detail: 'This default URL came from NEXT_PUBLIC_API_BASE_URL.',
  };
}

export default function ConnectPage() {
  const [connection, setConnection] = useState(describeConnection);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const sync = () => {
      const nextConnection = describeConnection();
      setConnection(nextConnection);
      setDraft(nextConnection.source === 'saved' ? nextConnection.baseUrl || '' : '');
    };
    sync();
    return subscribeToApiBaseUrlChange(sync);
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
    setMessage('Backend connected on this device. You can go back home now.');
    setSaving(false);
  }

  function handleClearOverride() {
    clearSavedApiBaseUrl();
    setDraft('');
    setMessage('Saved connection cleared. The app will use the default URL, if one exists.');
    setError('');
    setConnection(describeConnection());
  }

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Back
          </Link>
          <p className="kid-tag">Backend Connection</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <section className="kid-surface border-primary/40 p-8 md:p-10">
            <div className="inline-flex rounded-[1.5rem] bg-primary-light p-4">
              <Link2 className="text-primary-dark" size={34} />
            </div>
            <h1 className="mt-5 text-4xl font-black text-slate-800">Connect this device to your backend</h1>
            <p className="mt-4 text-xl leading-9 text-slate-600">
              Run the backend on your computer, start a Cloudflare Tunnel to port `8001`, then paste the full HTTPS URL here.
            </p>

            <div className="mt-8 rounded-[1.5rem] border-2 border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Current Connection</p>
              <p className="mt-3 text-2xl font-black text-slate-800">{connection.title}</p>
              <p className="mt-3 text-lg leading-8 text-slate-600">{connection.detail}</p>
              {connection.baseUrl ? (
                <p className="mt-4 break-all rounded-[1.25rem] bg-white px-4 py-3 text-base font-bold text-slate-700">
                  {connection.baseUrl}
                </p>
              ) : null}
            </div>

            <form onSubmit={handleSave} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Tunnel URL</label>
                <input
                  type="url"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-4 text-lg outline-none transition focus:border-primary"
                  placeholder="https://random-name.trycloudflare.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50 p-5 text-slate-700">
                <p className="text-base font-bold uppercase tracking-[0.16em] text-sky-700">On your computer</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-7 text-sky-900">
cloudflared tunnel --url http://localhost:8001
                </pre>
                <p className="mt-3 text-base leading-7">
                  Copy the HTTPS URL that Cloudflare prints. Do not use the tunnel ID or your public IP.
                </p>
              </div>

              {error ? <p className="text-center text-sm font-bold text-kid-pink">{error}</p> : null}
              {message ? <p className="text-center text-sm font-bold text-emerald-600">{message}</p> : null}

              <div className="flex flex-col gap-4 sm:flex-row">
                <button type="submit" disabled={saving || !draft.trim()} className="kid-button bg-primary hover:bg-primary-dark">
                  {saving ? 'Checking...' : 'Save Connection'}
                  <CheckCircle2 className="ml-2" size={18} />
                </button>
                <Link
                  href="/"
                  className="rounded-full border-2 border-slate-200 px-6 py-4 text-center text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                >
                  Open Home
                </Link>
                {connection.source === 'saved' ? (
                  <button
                    type="button"
                    onClick={handleClearOverride}
                    className="rounded-full border-2 border-slate-200 px-6 py-4 text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                  >
                    Clear Saved URL
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="kid-surface border-secondary/40 p-8 md:p-10">
            <div className="inline-flex rounded-[1.5rem] bg-secondary-light p-4">
              <ShieldCheck className="text-secondary-dark" size={34} />
            </div>
            <h2 className="mt-5 text-3xl font-black text-slate-800">How this works</h2>
            <div className="mt-6 space-y-4 text-lg leading-8 text-slate-600">
              <p>The saved backend URL stays in this browser on this device. If your child uses another phone, tablet, or computer, set it there too.</p>
              <p>When your tunnel URL changes on another day, open this page again, paste the new HTTPS URL, and save it. No Vercel redeploy is needed.</p>
              <p>If you later move the backend to a VPS, you can keep using this page as an emergency override or clear it and fall back to the default URL.</p>
            </div>

            <div className="mt-8 rounded-[1.5rem] border-2 border-amber-100 bg-amber-50 p-5">
              <div className="flex items-center gap-3 text-amber-700">
                <RefreshCw size={24} />
                <p className="text-lg font-black">Daily check</p>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Before your child opens the site from another house, make sure your computer is on, the FastAPI backend is running, and the tunnel is active.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
