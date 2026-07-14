'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Baby, BarChart3, BookOpen, Bot, CheckCircle2, KeyRound, Link2, Save, ShieldCheck, Sparkles, UserPlus, Users, Volume2 } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { choosePreferredActiveChildId, clearActiveChildId, getStoredActiveChildId, saveActiveChildId } from '@/lib/active-child';
import { getApiConnectionDetails, saveApiBaseUrl, verifySavedApiBaseUrl } from '@/lib/api-config';
import { ApiError, api, type AIProvider, type ChildProfile, type ChildProgressSummary, type Lesson, type UserAISettings } from '@/lib/api';

const LANGUAGES = [
  { value: 'English',  flag: '🇺🇸', label: 'Inglês' },
  { value: 'French',   flag: '🇫🇷', label: 'Francês' },
  { value: 'Spanish',  flag: '🇪🇸', label: 'Espanhol' },
  { value: 'German',   flag: '🇩🇪', label: 'Alemão' },
  { value: 'Italian',  flag: '🇮🇹', label: 'Italiano' },
  { value: 'Japanese', flag: '🇯🇵', label: 'Japonês' },
];

const LANGUAGE_META: Record<string, { flag: string; label: string }> = Object.fromEntries(
  LANGUAGES.map(({ value, flag, label }) => [value, { flag, label }]),
);

interface ParentFormState {
  child_name: string;
  age_group: string;
  voice_preference: string;
  auto_audio: boolean;
  target_language: string;
}

const DEFAULT_FORM: ParentFormState = {
  child_name: '',
  age_group: '7-9',
  voice_preference: 'af_bella',
  auto_audio: true,
  target_language: 'English',
};

export default function ParentsPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeChildId, setActiveChildId] = useState<number | null>(getStoredActiveChildId());
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [progressSummaries, setProgressSummaries] = useState<ChildProgressSummary[]>([]);
  const [form, setForm] = useState<ParentFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [newChildName, setNewChildName] = useState('');
  const [newChildAgeGroup, setNewChildAgeGroup] = useState('7-9');
  const [newChildTargetLanguage, setNewChildTargetLanguage] = useState('English');
  const [creatingChild, setCreatingChild] = useState(false);
  const [generatorTopic, setGeneratorTopic] = useState('');
  const [generatorMessage, setGeneratorMessage] = useState('');
  const [generatorTone, setGeneratorTone] = useState<'idle' | 'success' | 'error'>('idle');
  const [generatedLesson, setGeneratedLesson] = useState<Lesson | null>(null);
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [showTokenWarning, setShowTokenWarning] = useState(false);
  const [aiProviders, setAiProviders] = useState<AIProvider[]>([]);
  const [aiSettings, setAiSettings] = useState<UserAISettings | null>(null);
  const [aiForm, setAiForm] = useState({
    provider: 'gemini',
    api_key: '',
    model: 'gemini-3.1-flash-lite',
    base_url: '',
  });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  // Tunnel URL state
  const [tunnelDraft, setTunnelDraft] = useState(() => getApiConnectionDetails().baseUrl ?? '');
  const [tunnelSaving, setTunnelSaving] = useState(false);
  const [tunnelMessage, setTunnelMessage] = useState('');
  const [tunnelError, setTunnelError] = useState('');
  const tunnelConnection = getApiConnectionDetails();

  async function loadSettings() {
    try {
      const [settings, childList, progressList, providers, userAiSettings] = await Promise.all([
        api.getParentSettings(),
        api.listParentChildren(),
        api.getParentProgress(),
        api.getAIProviders(),
        api.getUserAISettings(),
      ]);
      setChildren(childList);
      setProgressSummaries(progressList);
      setAiProviders(providers);
      setAiSettings(userAiSettings);
      setAiForm({
        provider: userAiSettings.provider || 'gemini',
        api_key: '',
        model: userAiSettings.model || 'gemini-3.1-flash-lite',
        base_url: userAiSettings.base_url ?? '',
      });
      const preferredActiveChildId = choosePreferredActiveChildId({
        storedActiveChildId: getStoredActiveChildId(),
        children: childList,
        progressSummaries: progressList,
        fallbackChildId: settings.id,
      });
      const activeSettings = childList.find((child) => child.id === preferredActiveChildId) ?? settings;
      if (preferredActiveChildId) {
        saveActiveChildId(preferredActiveChildId);
      } else {
        clearActiveChildId();
      }
      setActiveChildId(preferredActiveChildId);
      setForm({
        child_name: activeSettings.name,
        age_group: activeSettings.age_group,
        voice_preference: activeSettings.voice_preference,
        auto_audio: activeSettings.auto_audio,
        target_language: activeSettings.target_language ?? 'English',
      });
      setIsLoggedIn(true);
      setError(null);
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar as configuracoes da area de pais.');
      if (nextError.status === 401) {
        router.replace('/login?next=/parents');
        return;
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
        target_language: settings.target_language ?? 'English',
      });
      setMessage('Configuracoes salvas.');
      setError(null);
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Nao foi possivel salvar as configuracoes.');
      setMessage(nextError.message);
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  function handleAIProviderChange(providerId: string) {
    const provider = aiProviders.find((item) => item.id === providerId) ?? aiProviders.find((item) => item.id === 'gemini');
    setAiForm((current) => ({
      ...current,
      provider: provider?.id ?? 'gemini',
      model: provider?.default_model ?? current.model,
    }));
    setAiMessage('');
  }

  async function handleSaveAISettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAiSaving(true);
    setAiMessage('');

    if (!aiForm.api_key.trim() && !aiSettings?.has_api_key) {
      setAiMessage('Informe a chave de API.');
      setAiSaving(false);
      return;
    }

    try {
      const saved = await api.saveUserAISettings({
        provider: aiForm.provider,
        model: aiForm.model.trim(),
        base_url: aiForm.base_url.trim() || undefined,
        api_key: aiForm.api_key.trim() || undefined,
      });
      setAiSettings(saved);
      setAiForm({
        provider: saved.provider,
        api_key: '',
        model: saved.model,
        base_url: saved.base_url ?? '',
      });
      setAiMessage('Configuracao de IA salva.');
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Nao foi possivel salvar a IA.');
      setAiMessage(nextError.message);
      setError(nextError);
    } finally {
      setAiSaving(false);
    }
  }

  async function handleLogout() {
    setSaving(true);
    let logoutError: ApiError | null = null;
    try {
      await api.userLogout();
    } catch (err) {
      logoutError = err instanceof ApiError ? err : new ApiError('Nao foi possivel sair.');
    } finally {
      setIsLoggedIn(false);
      clearActiveChildId();
      setActiveChildId(null);
      setChildren([]);
      setProgressSummaries([]);
      setForm(DEFAULT_FORM);
      setMessage(logoutError ? 'Sessao local encerrada. Entre novamente para continuar.' : 'Voce saiu da area de pais.');
      setGeneratorMessage('');
      setGeneratedLesson(null);
      setGeneratorTone('idle');
      setAiSettings(null);
      setAiForm({ provider: 'gemini', api_key: '', model: 'gemini-3.1-flash-lite', base_url: '' });
      setAiMessage('');
      setError(logoutError);
      setSaving(false);
      router.replace('/login?next=/parents');
      router.refresh();
    }
  }

  async function handleSelectChild(childId: number) {
    saveActiveChildId(childId);
    setActiveChildId(childId);
    setMessage('Aluno ativo trocado.');
    setGeneratorMessage('');
    setGeneratedLesson(null);
    await loadSettings();
  }

  async function handleCreateChild(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingChild(true);
    setMessage('');
    try {
      const child = await api.createParentChild({
        name: newChildName.trim(),
        age_group: newChildAgeGroup,
        voice_preference: form.voice_preference,
        auto_audio: form.auto_audio,
        target_language: newChildTargetLanguage,
      });
      saveActiveChildId(child.id);
      setActiveChildId(child.id);
      setNewChildName('');
      setNewChildAgeGroup('7-9');
      setNewChildTargetLanguage('English');
      setMessage(`Novo aluno criado: ${child.name}.`);
      await loadSettings();
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Nao foi possivel criar o novo aluno.');
      setMessage(nextError.message);
      setError(nextError);
    } finally {
      setCreatingChild(false);
    }
  }

  async function handleSaveTunnel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTunnelSaving(true);
    setTunnelMessage('');
    setTunnelError('');
    const result = await verifySavedApiBaseUrl(tunnelDraft.trim());
    if (!result.ok) {
      setTunnelError(result.message);
      setTunnelSaving(false);
      return;
    }
    saveApiBaseUrl(result.baseUrl);
    setTunnelDraft(result.baseUrl);
    setTunnelMessage('URL salva! O app ja esta usando este backend.');
    setTunnelSaving(false);
  }

  async function handleGenerateLesson() {
    setGeneratingLesson(true);
    setGeneratorMessage('');
    setGeneratorTone('idle');
    try {
      const response = await api.generateMorePhrases(
        generatorTopic.trim() ? { topic: generatorTopic.trim() } : {},
      );
      setGeneratedLesson(response.lesson);
      setGeneratorMessage(response.message);
      setGeneratorTone('success');
      setGeneratorTopic('');
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Nao foi possivel gerar novas frases.');
      if (nextError.status === 401) {
        router.replace('/login?next=/parents');
        return;
      } else {
        setGeneratorMessage(nextError.message);
        setGeneratorTone('error');
      }
    } finally {
      setGeneratingLesson(false);
    }
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Abrindo configuracoes da area de pais"
        message="Verificando sua sessao e carregando o perfil da crianca."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title="Conecte a area de pais primeiro"
        message="Este aparelho precisa da URL atual do backend antes de carregar a area de pais. Abra a pagina de conexao e salve a URL HTTPS do tunnel do seu computador."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Abrir configuracao de conexao
          </Link>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="A area de pais esta offline"
        message="O backend nao esta respondendo agora. Inicie a API e o Cloudflare Tunnel no seu computador e tente de novo."
        primaryAction={
          <button onClick={() => void loadSettings()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Tentar de novo
          </button>
        }
        secondaryHref="/connect"
        secondaryLabel="Trocar conexao"
      />
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  const availableAIProviders =
    aiProviders.length > 0
      ? aiProviders
      : [{ id: 'gemini', label: 'Gemini', default_model: 'gemini-3.1-flash-lite', requires_base_url: false, is_default: true }];

  return (
    <main className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-base font-bold text-primary-dark hover:text-primary md:text-lg">
            <ArrowLeft size={22} /> Voltar
          </Link>
          <button onClick={() => void handleLogout()} className="rounded-full border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-primary hover:text-primary md:px-5 md:py-3 md:text-base">
            Sair
          </button>
        </div>

        {/* CTA — Começar Lição */}
        <section className="kid-surface mb-6 flex flex-col items-start justify-between gap-5 border-primary/40 p-6 sm:flex-row sm:items-center md:p-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary-dark">Pronto para estudar?</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800 md:text-3xl">Comece a licao de hoje</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Aluno ativo: <span className="font-black text-slate-700">{children.find((c) => c.id === activeChildId)?.name ?? '—'}</span></p>
          </div>
          <div className="relative w-full shrink-0 sm:w-auto">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />
            <Link
              href="/lesson"
              className="relative inline-flex w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-4 text-base font-black text-white shadow-[0_12px_30px_rgba(14,165,233,0.40)] transition hover:scale-105 hover:bg-primary-dark sm:w-auto md:px-10 md:py-5 md:text-xl"
            >
              <BookOpen size={22} />
              Comecar licao
            </Link>
          </div>
        </section>

        <section className="kid-surface mb-6 border-emerald-200 p-5 md:p-8">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-emerald-700" size={28} />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Acompanhamento</p>
              <h1 className="text-2xl font-black text-slate-800 md:text-3xl">Progresso por aluno</h1>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {progressSummaries.map(({ child, progress }) => (
              <article key={child.id} className="rounded-[1.25rem] bg-white p-4 shadow-sm ring-1 ring-emerald-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-slate-800">{child.name}</h2>
                    <p className="text-sm font-bold text-slate-400">Nivel {progress.current_level} - {child.age_group}</p>
                  </div>
                  {child.id === activeChildId ? (
                    <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-black text-primary-dark">Ativo</span>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <ProgressMetric label="Dias" value={progress.streak_count} />
                  <ProgressMetric label="Temas" value={progress.themes_completed} />
                  <ProgressMetric label="Frases" value={progress.vocabulary_learned} />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  Ultima atividade: {formatLastActivity(progress.last_activity)}
                </p>
                <Link
                  href="/lesson"
                  onClick={() => { if (child.id !== activeChildId) { saveActiveChildId(child.id); setActiveChildId(child.id); } }}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-black text-white transition hover:bg-primary-dark"
                >
                  <BookOpen size={16} />
                  Comecar licao
                </Link>
                {progress.difficult_words.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {progress.difficult_words.map((word) => (
                      <span key={`${child.id}-${word}`} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                        {word}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <form onSubmit={handleSave} className="kid-surface border-primary/40 p-5 md:p-10">
            <h1 className="text-2xl font-black text-slate-800 sm:text-3xl md:text-4xl">Configuracoes da area de pais</h1>
            <p className="mt-3 text-base leading-7 text-slate-600 md:mt-4 md:text-lg md:leading-8">
              Escolha o nome da crianca, a faixa etaria e o comportamento do audio para um aprendizado mais tranquilo.
            </p>

            <div className="mt-8 grid gap-8">
              <section>
                <div className="flex items-center gap-3">
                  <Baby className="text-primary-dark" size={28} />
                  <h2 className="text-xl font-black text-slate-800 md:text-2xl">Perfil da crianca</h2>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Nome da crianca</label>
                    <input
                      type="text"
                      value={form.child_name}
                      onChange={(event) => setForm((current) => ({ ...current, child_name: event.target.value }))}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary md:py-4 md:text-lg"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Faixa etaria</label>
                    <select
                      value={form.age_group}
                      onChange={(event) => setForm((current) => ({ ...current, age_group: event.target.value }))}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary md:py-4 md:text-lg"
                    >
                      <option value="4-6">4 a 6 anos</option>
                      <option value="7-9">7 a 9 anos</option>
                      <option value="10-12">10 a 12 anos</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Idioma alvo</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.value}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, target_language: lang.value }))}
                          className={`flex flex-col items-center gap-1 rounded-[1.25rem] border-2 px-3 py-2.5 text-xs font-black transition ${
                            form.target_language === lang.value
                              ? 'border-primary bg-primary-light text-primary-dark'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-primary'
                          }`}
                        >
                          <span className="text-xl">{lang.flag}</span>
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3">
                  <Volume2 className="text-kid-pink" size={28} />
                  <h2 className="text-xl font-black text-slate-800 md:text-2xl">Voz e audio</h2>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Voz do tutor</label>
                    <select
                      value={form.voice_preference}
                      onChange={(event) => setForm((current) => ({ ...current, voice_preference: event.target.value }))}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary md:py-4 md:text-lg"
                    >
                      <option value="af_bella">Bella amigavel</option>
                      <option value="af_sky">Sky suave</option>
                      <option value="am_adam">Adam</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-4 rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base font-bold text-slate-700 md:py-4 md:text-lg">
                    <input
                      type="checkbox"
                      checked={form.auto_audio}
                      onChange={(event) => setForm((current) => ({ ...current, auto_audio: event.target.checked }))}
                      className="h-6 w-6 accent-sky-500"
                    />
                    Tocar audio do tutor automaticamente
                  </label>
                </div>
              </section>
            </div>

            {message ? <p className="mt-6 text-sm font-bold text-primary-dark">{message}</p> : null}
            <button type="submit" disabled={saving} className="kid-button mt-8 bg-primary hover:bg-primary-dark">
              <Save className="mr-2" size={18} />
              {saving ? 'Salvando...' : 'Salvar configuracoes'}
            </button>
          </form>

          <aside className="space-y-6">
            <div className="kid-surface border-sky-200 p-5 md:p-8">
              <div className="flex items-center gap-3">
                <Users className="text-sky-700" size={28} />
                <h2 className="text-xl font-black text-slate-800 md:text-2xl">Alunos</h2>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-600 md:text-lg md:leading-8">
                Crie novos alunos e escolha qual aluno fica ativo neste aparelho agora.
              </p>

              <div className="mt-5 space-y-3">
                {children.map((child) => {
                  const isActive = child.id === activeChildId;
                  return (
                    <div key={child.id} className="rounded-[1.25rem] bg-white px-4 py-4 shadow-sm ring-1 ring-slate-100">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-lg font-black text-slate-800">{child.name}</p>
                          <p className="text-sm text-slate-500">
                            {LANGUAGE_META[child.target_language]?.flag ?? '🇺🇸'}{' '}
                            {LANGUAGE_META[child.target_language]?.label ?? child.target_language} &middot; {child.age_group}
                          </p>
                        </div>
                        {isActive ? (
                          <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-primary-dark">
                            Ativo
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleSelectChild(child.id)}
                            className="rounded-full border-2 border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                          >
                            Ativar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleCreateChild} className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Nome do novo aluno</label>
                  <input
                    type="text"
                    value={newChildName}
                    onChange={(event) => setNewChildName(event.target.value)}
                    className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary md:py-4 md:text-lg"
                    placeholder="Ex.: Ana"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Faixa etaria</label>
                  <select
                    value={newChildAgeGroup}
                    onChange={(event) => setNewChildAgeGroup(event.target.value)}
                    className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary md:py-4 md:text-lg"
                  >
                    <option value="4-6">4 a 6 anos</option>
                    <option value="7-9">7 a 9 anos</option>
                    <option value="10-12">10 a 12 anos</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Idioma alvo</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.value}
                        type="button"
                        onClick={() => setNewChildTargetLanguage(lang.value)}
                        className={`flex flex-col items-center gap-1 rounded-[1.25rem] border-2 px-3 py-2 text-xs font-black transition ${
                          newChildTargetLanguage === lang.value
                            ? 'border-primary bg-primary-light text-primary-dark'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-primary'
                        }`}
                      >
                        <span className="text-lg">{lang.flag}</span>
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={creatingChild || !newChildName.trim()}
                  className="kid-button bg-sky-600 hover:bg-sky-700"
                >
                  <UserPlus className="mr-2" size={18} />
                  {creatingChild ? 'Criando aluno...' : 'Criar novo aluno'}
                </button>
              </form>
            </div>

            <div className="kid-surface border-indigo-200 p-5 md:p-8">
              <div className="flex items-center gap-3">
                <Bot className="text-indigo-700" size={28} />
                <h2 className="text-xl font-black text-slate-800 md:text-2xl">IA da conta</h2>
              </div>

              <form onSubmit={handleSaveAISettings} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Provedor</label>
                    <select
                      value={aiForm.provider}
                      onChange={(event) => handleAIProviderChange(event.target.value)}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary"
                    >
                      {availableAIProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Modelo</label>
                    <input
                      type="text"
                      value={aiForm.model}
                      onChange={(event) => setAiForm((current) => ({ ...current, model: event.target.value }))}
                      className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary"
                      placeholder="gemini-3.1-flash-lite"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
                    <KeyRound size={14} />
                    Chave API
                  </label>
                  <input
                    type="password"
                    value={aiForm.api_key}
                    onChange={(event) => setAiForm((current) => ({ ...current, api_key: event.target.value }))}
                    className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary"
                    placeholder={aiSettings?.has_api_key ? 'Preencha para trocar a chave' : 'Cole sua chave'}
                    autoComplete="off"
                  />
                  {aiSettings?.has_api_key ? (
                    <p className="mt-2 text-xs font-bold text-slate-500">Chave salva: {aiSettings.api_key_preview ?? '****'}</p>
                  ) : (
                    <p className="mt-2 text-xs font-bold text-kid-pink">Chave obrigatoria para gerar conteudo.</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">URL base opcional</label>
                  <input
                    type="url"
                    value={aiForm.base_url}
                    onChange={(event) => setAiForm((current) => ({ ...current, base_url: event.target.value }))}
                    className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary"
                    placeholder="https://api.exemplo.com/v1"
                    autoComplete="off"
                  />
                </div>

                {aiMessage ? <p className="text-sm font-bold text-primary-dark">{aiMessage}</p> : null}
                <button
                  type="submit"
                  disabled={aiSaving || !aiForm.model.trim()}
                  className="kid-button bg-indigo-600 hover:bg-indigo-700"
                >
                  <Save className="mr-2" size={18} />
                  {aiSaving ? 'Salvando IA...' : 'Salvar IA'}
                </button>
              </form>
            </div>

            <div className="kid-surface border-primary/50 p-5 md:p-8">
              <div className="flex items-center gap-3">
                <Sparkles className="text-primary-dark" size={28} />
                <h2 className="text-xl font-black text-slate-800 md:text-2xl">Criar nova licao com IA</h2>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-600 md:mt-4 md:text-lg md:leading-8">
                Gere o proximo dia com 3 frases novas usando a IA configurada na sua conta.
              </p>
              <div className="mt-5">
                <label className="mb-2 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Tema opcional</label>
                <input
                  type="text"
                  value={generatorTopic}
                  onChange={(event) => setGeneratorTopic(event.target.value)}
                  className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3.5 text-base outline-none transition focus:border-primary md:py-4 md:text-lg"
                  placeholder="jogos, comida, escola..."
                />
              </div>
              {showTokenWarning && !generatingLesson ? (
                <div className="mt-5 rounded-[1.25rem] border-2 border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-black text-amber-800">Esta acao consome tokens da API de IA. Confirmar?</p>
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setShowTokenWarning(false); void handleGenerateLesson(); }}
                      className="rounded-2xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-amber-700"
                    >
                      Sim, gastar tokens
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTokenWarning(false)}
                      className="rounded-2xl border-2 border-amber-200 bg-white px-5 py-2.5 text-sm font-black text-amber-700 transition hover:border-amber-400"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTokenWarning(true)}
                  disabled={generatingLesson}
                  className="kid-button mt-6 bg-primary hover:bg-primary-dark"
                >
                  {generatingLesson ? 'Criando licao...' : 'Criar nova licao com IA'}
                </button>
              )}
              {generatorMessage ? (
                <p className={`mt-4 text-sm font-bold ${generatorTone === 'error' ? 'text-kid-pink' : 'text-primary-dark'}`}>
                  {generatorMessage}
                </p>
              ) : null}
              {generatedLesson ? (
                <div className="mt-6 rounded-[1.25rem] bg-slate-50 p-4 md:rounded-[1.5rem] md:p-5">
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Ultimo dia gerado</p>
                  <h3 className="mt-2 text-xl font-black text-slate-800 md:text-2xl">{generatedLesson.title}</h3>
                  <div className="mt-4 space-y-3">
                    {generatedLesson.items.map((item, index) => (
                      <div key={`${generatedLesson.id}-${index}`} className="rounded-[1.25rem] bg-white px-4 py-3">
                        <p className="text-base font-bold uppercase tracking-[0.15em] text-slate-400">Frase {index + 1}</p>
                        <p className="mt-1 text-base font-black text-slate-800 md:text-lg">{item.word_en}</p>
                        <p className="text-sm text-slate-600 md:text-base">{item.word_pt}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Link
                      href={`/lesson?lessonId=${generatedLesson.id}`}
                      className="rounded-full border-2 border-primary/20 bg-white px-5 py-3 text-center text-base font-bold text-primary-dark transition hover:border-primary hover:bg-primary-light"
                    >
                      Abrir licao criada
                    </Link>
                    <Link
                      href={`/quiz?lessonId=${generatedLesson.id}`}
                      className="rounded-full border-2 border-slate-200 bg-white px-5 py-3 text-center text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary"
                    >
                      Abrir quiz da licao
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Tunnel URL */}
            <div className="kid-surface border-slate-200 p-5 md:p-8">
              <div className="flex items-center gap-3">
                <Link2 className="text-primary-dark" size={28} />
                <h2 className="text-xl font-black text-slate-800 md:text-2xl">URL do Tunnel</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Cole aqui a URL HTTPS do Cloudflare Tunnel para conectar o app ao backend local.
              </p>

              {/* Status atual */}
              {tunnelConnection.baseUrl ? (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                  <p className="break-all text-xs font-bold text-emerald-700">{tunnelConnection.baseUrl}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-xs font-bold text-amber-700">Nenhum tunnel configurado neste aparelho.</p>
                </div>
              )}

              <form onSubmit={handleSaveTunnel} className="mt-5 space-y-3">
                <input
                  type="url"
                  value={tunnelDraft}
                  onChange={(e) => setTunnelDraft(e.target.value)}
                  placeholder="https://xxxx.trycloudflare.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full rounded-[1.25rem] border-2 border-slate-200 px-4 py-3 text-base outline-none transition focus:border-primary"
                />
                {tunnelError && <p className="text-xs font-bold text-kid-pink">{tunnelError}</p>}
                {tunnelMessage && <p className="text-xs font-bold text-emerald-600">{tunnelMessage}</p>}
                <button
                  type="submit"
                  disabled={tunnelSaving || !tunnelDraft.trim()}
                  className="kid-button bg-primary hover:bg-primary-dark"
                >
                  <Link2 className="mr-2" size={16} />
                  {tunnelSaving ? 'Verificando...' : 'Salvar URL do tunnel'}
                </button>
              </form>
            </div>

            <div className="kid-surface border-accent/50 p-5 md:p-8">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-accent-dark" size={28} />
                <h2 className="text-xl font-black text-slate-800 md:text-2xl">Nota de seguranca</h2>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-600 md:mt-4 md:text-lg md:leading-8">
                O tutor permanece focado em pratica de ingles segura para criancas, respostas curtas e redirecionamento amigavel.
              </p>
            </div>

            <div className="kid-surface border-secondary/50 p-5 md:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Configuracao util</p>
              <h2 className="mt-3 text-2xl font-black text-slate-800 md:text-3xl">Ambiente</h2>
              <p className="mt-3 text-base leading-7 text-slate-600 md:mt-4 md:text-lg md:leading-8">
                Login Google usa <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> e <code>GOOGLE_REDIRECT_URI</code>. Cada conta usa sua propria chave de IA salva acima.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-emerald-50 px-2 py-3">
      <p className="text-xl font-black text-emerald-700">{value}</p>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-900/60">{label}</p>
    </div>
  );
}

function formatLastActivity(value: string | null) {
  if (!value) {
    return 'sem atividade salva';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'sem atividade salva';
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
