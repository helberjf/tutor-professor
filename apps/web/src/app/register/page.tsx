'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';

import { ApiError, api } from '@/lib/api';

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
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form & { submit: string }>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
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

            <Field id="child_name" label="Nome da crianca" icon={<User size={16} className="text-slate-400" />} error={errors.child_name}>
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
