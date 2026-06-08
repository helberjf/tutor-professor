'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Bot, CheckCircle2, Chrome, Eye, EyeOff, Globe, KeyRound, Lock, Mail, User } from 'lucide-react';

import { ApiError, api } from '@/lib/api';

// ── Supported languages ──────────────────────────────────────────────────────────────────────────────
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

const AI_PROVIDERS = [
  { id: 'gemini', label: 'Gemini', defaultModel: 'gemini-2.5-flash' },
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', defaultModel: 'claude-3-5-haiku-latest' },
  { id: 'openrouter', label: 'OpenRouter', defaultModel: 'openrouter/auto' },
  { id: 'groq', label: 'Groq', defaultModel: 'llama-3.1-8b-instant' },
  { id: 'mistral', label: 'Mistral', defaultModel: 'mistral-small-latest' },
];

// ── CPF validation ────────────────────────────────────────────────────────────
function validateCPF(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calc = (n: number) => {
    const total = digits
      .slice(0, n)
      .split('')
      .reduce((acc, d, i) => acc + parseInt(d) * (n + 1 - i), 0);
    const r = total % 11;
    return r < 2 ? 0 : 11 - r;
  };

  return calc(9) === parseInt(digits[9]) && calc(10) === parseInt(digits[10]);
}

function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// ── Field component ───────────────────────────────────────────────────────────
interface FieldProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}

function Field({ id, label, icon, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          {icon}
        </div>
        {children}
      </div>
      {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    child_name: '',
    email: '',
    cpf: '',
    password: '',
    confirm: '',
    ai_provider: 'gemini',
    ai_api_key: '',
    ai_model: 'gemini-2.5-flash',
    ai_base_url: '',
  });
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form & { submit: string }>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function setAIProvider(providerId: string) {
    const provider = AI_PROVIDERS.find((item) => item.id === providerId) ?? AI_PROVIDERS[0];
    setForm((prev) => ({
      ...prev,
      ai_provider: provider.id,
      ai_model: provider.defaultModel,
    }));
    setErrors((prev) => ({ ...prev, ai_provider: '', ai_model: '' }));
  }

  function validate(): boolean {
    const next: typeof errors = {};

    if (!form.first_name.trim()) next.first_name = 'Informe o nome.';
    if (!form.last_name.trim()) next.last_name = 'Informe o sobrenome.';
    if (!form.child_name.trim()) next.child_name = 'Informe o nome da crianca.';

    const email = form.email.trim();
    if (!email) {
      next.email = 'Informe o e-mail.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'E-mail inválido.';
    }

    const cpfDigits = form.cpf.replace(/\D/g, '');
    if (!cpfDigits) {
      next.cpf = 'Informe o CPF.';
    } else if (cpfDigits.length !== 11) {
      next.cpf = 'CPF incompleto.';
    } else if (!validateCPF(form.cpf)) {
      next.cpf = 'CPF inválido.';
    }

    if (!form.password) {
      next.password = 'Informe a senha.';
    } else if (form.password.length < 6) {
      next.password = 'A senha deve ter no mínimo 6 caracteres.';
    }

    if (!form.confirm) {
      next.confirm = 'Confirme a senha.';
    } else if (form.password !== form.confirm) {
      next.confirm = 'As senhas não coincidem.';
    }

    if (!form.ai_provider) next.ai_provider = 'Escolha o provedor.';
    if (!form.ai_model.trim()) next.ai_model = 'Informe o modelo.';
    if (!form.ai_api_key.trim()) next.ai_api_key = 'Informe sua chave de API.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      await api.userRegister({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        cpf: form.cpf.replace(/\D/g, ''),
        password: form.password,
        child_name: form.child_name.trim(),
        target_language: targetLanguage,
        ai_provider: form.ai_provider,
        ai_api_key: form.ai_api_key.trim(),
        ai_model: form.ai_model.trim(),
        ai_base_url: form.ai_base_url.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? (err.detail ?? 'Não foi possível criar a conta.')
          : 'Não foi possível criar a conta.';
      setErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleRegister() {
    setGoogleLoading(true);
    setErrors({});
    try {
      window.location.href = await api.getGoogleLoginUrl('/parents');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? (err.detail ?? err.message)
          : 'Nao foi possivel iniciar o Google.';
      setErrors({ submit: msg });
      setGoogleLoading(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border-2 border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 placeholder:text-slate-300 transition focus:border-primary focus:outline-none';

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="kid-surface w-full max-w-md p-10 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-500" />
          <h2 className="text-2xl font-black text-slate-800">Conta criada!</h2>
          <p className="mt-2 text-slate-500">Redirecionando para o login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
      {/* Back */}
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-primary-dark"
        >
          <ArrowLeft size={16} />
          Voltar ao início
        </Link>
      </div>

      {/* Card */}
      <div className="mx-auto mt-8 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-sky-100 via-amber-50 to-emerald-100 shadow-[0_16px_40px_rgba(14,165,233,0.15)]">
            <User className="text-primary-dark" size={32} />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Área dos pais</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800 md:text-4xl">Criar conta</h1>
          <p className="mt-2 text-sm text-slate-500">
            Já tem conta?{' '}
            <Link href="/login" className="font-bold text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>

        <div className="kid-surface border-slate-200/60 p-7 md:p-9">
          <button
            type="button"
            onClick={() => void handleGoogleRegister()}
            disabled={loading || googleLoading}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            <Chrome size={18} />
            {googleLoading ? 'Abrindo Google...' : 'Continuar com Google'}
          </button>

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">ou</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <Field id="first_name" label="Nome" icon={<User size={16} className="text-slate-400" />} error={errors.first_name}>
                <input
                  id="first_name"
                  type="text"
                  autoComplete="given-name"
                  placeholder="João"
                  value={form.first_name}
                  onChange={(e) => set('first_name', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field id="last_name" label="Sobrenome" icon={<User size={16} className="text-slate-400" />} error={errors.last_name}>
                <input
                  id="last_name"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Silva"
                  value={form.last_name}
                  onChange={(e) => set('last_name', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field id="child_name" label="Seu nome / Nome do aluno" icon={<User size={16} className="text-slate-400" />} error={errors.child_name}>
              <input
                id="child_name"
                type="text"
                autoComplete="off"
                placeholder="Ana"
                value={form.child_name}
                onChange={(e) => set('child_name', e.target.value)}
                className={inputCls}
              />
            </Field>

            {/* Language picker */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold uppercase tracking-[0.14em] text-slate-400">
                <span className="flex items-center gap-1.5"><Globe size={14} /> Idioma para aprender</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => setTargetLanguage(lang.value)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-xs font-black transition ${
                      targetLanguage === lang.value
                        ? 'border-primary bg-sky-50 text-primary-dark'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xl">{lang.flag}</span>
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Email */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="ai_provider" label="IA" icon={<Bot size={16} className="text-slate-400" />} error={errors.ai_provider}>
                <select
                  id="ai_provider"
                  value={form.ai_provider}
                  onChange={(e) => setAIProvider(e.target.value)}
                  className={inputCls}
                >
                  {AI_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="ai_model" label="Modelo" icon={<Bot size={16} className="text-slate-400" />} error={errors.ai_model}>
                <input
                  id="ai_model"
                  type="text"
                  autoComplete="off"
                  placeholder="gemini-2.5-flash"
                  value={form.ai_model}
                  onChange={(e) => set('ai_model', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field id="ai_api_key" label="Chave API da IA" icon={<KeyRound size={16} className="text-slate-400" />} error={errors.ai_api_key}>
              <input
                id="ai_api_key"
                type="password"
                autoComplete="off"
                placeholder="Cole sua chave"
                value={form.ai_api_key}
                onChange={(e) => set('ai_api_key', e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field id="ai_base_url" label="URL base opcional" icon={<Globe size={16} className="text-slate-400" />} error={errors.ai_base_url}>
              <input
                id="ai_base_url"
                type="url"
                autoComplete="off"
                placeholder="https://api.exemplo.com/v1"
                value={form.ai_base_url}
                onChange={(e) => set('ai_base_url', e.target.value)}
                className={inputCls}
              />
            </Field>

            {/* Email */}
            <Field id="email" label="E-mail" icon={<Mail size={16} className="text-slate-400" />} error={errors.email}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="joao@email.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={inputCls}
              />
            </Field>

            {/* CPF */}
            <Field id="cpf" label="CPF" icon={<span className="text-xs font-black text-slate-400">CPF</span>} error={errors.cpf}>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => set('cpf', maskCPF(e.target.value))}
                maxLength={14}
                className={inputCls}
              />
            </Field>

            {/* Password */}
            <Field id="password" label="Senha" icon={<Lock size={16} className="text-slate-400" />} error={errors.password}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                className={`${inputCls} pr-11`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-primary"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </Field>

            {/* Confirm */}
            <Field id="confirm" label="Confirmar senha" icon={<Lock size={16} className="text-slate-400" />} error={errors.confirm}>
              <input
                id="confirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                className={`${inputCls} pr-11`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-primary"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </Field>

            {errors.submit && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                {errors.submit}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
