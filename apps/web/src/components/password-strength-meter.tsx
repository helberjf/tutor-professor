'use client';

import {
  getPasswordMeterBarColor,
  getPasswordMeterColor,
  getPasswordMeterLabel,
  passwordRequirements,
  validatePasswordStrength,
} from '@/lib/password-validation';

/**
 * Barra de força + checklist de requisitos, mostrados enquanto a pessoa digita.
 *
 * A mesma regra roda no backend (services/password_policy.py), que é quem de
 * fato recusa a senha fraca.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const result = validatePasswordStrength(password);
  const requirements = passwordRequirements(password);

  return (
    <div className="mt-3 space-y-3">
      {password ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Força da senha
            </span>
            <span className={`text-xs font-black ${getPasswordMeterColor(result)}`}>
              {getPasswordMeterLabel(result)}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Força da senha"
            aria-valuenow={result.score}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${getPasswordMeterBarColor(result)}`}
              style={{ width: `${result.score}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-slate-50 p-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
          Requisitos da senha
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {requirements.map((requirement) => (
            <li
              key={requirement.label}
              className={`flex items-center gap-2 text-xs font-bold ${
                requirement.met ? 'text-emerald-600' : 'text-slate-500'
              }`}
            >
              <span aria-hidden="true">{requirement.met ? '✓' : '○'}</span>
              {requirement.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
