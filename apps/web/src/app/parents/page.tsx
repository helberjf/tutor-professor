'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Baby, Lock, Save, ShieldCheck, Volume2 } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api } from '@/lib/api';

interface ParentFormState {
  child_name: string;
  age_group: string;
  voice_preference: string;
  auto_audio: boolean;
}

const DEFAULT_FORM: ParentFormState = {
  child_name: '',
  age_group: '7-9',
  voice_preference: 'af_heart',
  auto_audio: true,
};

export default function ParentsPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [form, setForm] = useState<ParentFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  async function loadSettings() {
    try {
      const settings = await api.getParentSettings();
      setForm({
        child_name: settings.name,
        age_group: settings.age_group,
        voice_preference: settings.voice_preference,
        auto_audio: settings.auto_audio,
      });
      setIsLoggedIn(true);
      setError(null);
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Could not load parent settings.');
      if (nextError.status === 401) {
        setIsLoggedIn(false);
        setError(null);
      } else {
        setError(nextError);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.parentLogin(password);
      await loadSettings();
      setPassword('');
      setMessage('Welcome! Parent settings are ready.');
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Could not log in.');
      setMessage(nextError.status === 401 ? 'That password did not match.' : nextError.message);
      setError(nextError.status === 401 ? null : nextError);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const settings = await api.updateParentSettings(form);
      setForm({
        child_name: settings.name,
        age_group: settings.age_group,
        voice_preference: settings.voice_preference,
        auto_audio: settings.auto_audio,
      });
      setMessage('Settings saved.');
      setError(null);
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Could not save settings.');
      setMessage(nextError.message);
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setSaving(true);
    try {
      await api.parentLogout();
      setIsLoggedIn(false);
      setForm(DEFAULT_FORM);
      setMessage('You are logged out.');
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Could not log out.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Opening parent settings"
        message="Checking your parent session and loading the child profile."
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title="Connect the parent area first"
        message="This device needs the current backend URL before parent settings can load. Open the connection page and save the HTTPS tunnel URL from your computer."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Open Connection Setup
          </Link>
        }
        secondaryHref="/"
        secondaryLabel="Back Home"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="Parent area is offline"
        message="The backend is not answering right now. Start the API and Cloudflare Tunnel on your computer, then try again."
        primaryAction={
          <button onClick={() => void loadSettings()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Try Again
          </button>
        }
        secondaryHref="/connect"
        secondaryLabel="Change Connection"
      />
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
        <div className="mx-auto max-w-lg">
          <div className="kid-surface border-primary/40 p-10">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary-light">
              <Lock className="text-primary-dark" size={54} />
            </div>
            <h1 className="mt-6 text-center text-4xl font-black text-slate-800">Parent Login</h1>
            <p className="mt-4 text-center text-lg leading-8 text-slate-600">
              Use your parent password to update audio settings and the child profile.
            </p>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-4 text-lg outline-none transition focus:border-primary"
                  placeholder="Enter the parent password"
                />
              </div>
              {message ? <p className="text-center text-sm font-bold text-kid-pink">{message}</p> : null}
              <button type="submit" disabled={saving} className="kid-button w-full bg-primary hover:bg-primary-dark">
                {saving ? 'Logging in...' : 'Login'}
              </button>
              <Link href="/" className="block text-center text-lg font-bold text-slate-500 hover:text-primary">
                <ArrowLeft className="mr-2 inline" size={18} /> Back Home
              </Link>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Back
          </Link>
          <button onClick={() => void handleLogout()} className="rounded-full border-2 border-slate-200 px-5 py-3 text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary">
            Logout
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <form onSubmit={handleSave} className="kid-surface border-primary/40 p-8 md:p-10">
            <h1 className="text-4xl font-black text-slate-800">Parent Settings</h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Choose the child&apos;s name, age range, and audio behavior for a calm learning flow.
            </p>

            <div className="mt-8 grid gap-8">
              <section>
                <div className="flex items-center gap-3">
                  <Baby className="text-primary-dark" size={28} />
                  <h2 className="text-2xl font-black text-slate-800">Child Profile</h2>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Child Name</label>
                    <input
                      type="text"
                      value={form.child_name}
                      onChange={(event) => setForm((current) => ({ ...current, child_name: event.target.value }))}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-4 text-lg outline-none transition focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Age Group</label>
                    <select
                      value={form.age_group}
                      onChange={(event) => setForm((current) => ({ ...current, age_group: event.target.value }))}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-4 text-lg outline-none transition focus:border-primary"
                    >
                      <option value="4-6">4 - 6 years</option>
                      <option value="7-9">7 - 9 years</option>
                      <option value="10-12">10 - 12 years</option>
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3">
                  <Volume2 className="text-kid-pink" size={28} />
                  <h2 className="text-2xl font-black text-slate-800">Voice & Audio</h2>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Tutor Voice</label>
                    <select
                      value={form.voice_preference}
                      onChange={(event) => setForm((current) => ({ ...current, voice_preference: event.target.value }))}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-4 text-lg outline-none transition focus:border-primary"
                    >
                      <option value="af_heart">Friendly Heart</option>
                      <option value="af_bella">Bella</option>
                      <option value="am_adam">Adam</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-4 rounded-[1.25rem] border-2 border-slate-200 px-4 py-4 text-lg font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.auto_audio}
                      onChange={(event) => setForm((current) => ({ ...current, auto_audio: event.target.checked }))}
                      className="h-6 w-6 accent-sky-500"
                    />
                    Auto-play tutor audio
                  </label>
                </div>
              </section>
            </div>

            {message ? <p className="mt-6 text-sm font-bold text-primary-dark">{message}</p> : null}
            <button type="submit" disabled={saving} className="kid-button mt-8 bg-primary hover:bg-primary-dark">
              <Save className="mr-2" size={18} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>

          <aside className="space-y-6">
            <div className="kid-surface border-accent/50 p-8">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-accent-dark" size={28} />
                <h2 className="text-2xl font-black text-slate-800">Safety Note</h2>
              </div>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                The tutor stays focused on child-safe English practice, short replies, and friendly redirection.
              </p>
            </div>

            <div className="kid-surface border-secondary/50 p-8">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Helpful Setup</p>
              <h2 className="mt-3 text-3xl font-black text-slate-800">Environment</h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                The parent password comes from <code>PARENT_PASSWORD</code>. Audio uses <code>KOKORO_DEFAULT_VOICE</code>, <code>KOKORO_URL</code>, and <code>AUDIO_CACHE_DIR</code> on the backend.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
