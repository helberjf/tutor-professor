/**
 * Validação de força de senha.
 *
 * Espelha apps/api/services/password_policy.py regra por regra. O servidor é
 * quem de fato barra a senha fraca; isto aqui existe para a pessoa ver o que
 * falta enquanto digita, em vez de descobrir no envio.
 *
 * Requisitos:
 * - Mínimo 8 caracteres
 * - Pelo menos 1 letra maiúscula
 * - Pelo menos 1 letra minúscula
 * - Pelo menos 1 número
 * - Pelo menos 1 caractere especial (!@#$%^&*)
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_SPECIAL_PATTERN = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrengthResult {
  isValid: boolean;
  strength: PasswordStrength;
  /** 0-100, usado só para a largura da barra. */
  score: number;
  feedback: string[];
}

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < PASSWORD_MIN_LENGTH) {
    feedback.push(`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`);
  } else {
    score += 20;
    // Comprimento extra só move o medidor; nunca substitui uma regra faltando.
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
  }

  if (!/[A-Z]/.test(password)) {
    feedback.push('Adicione pelo menos uma letra maiúscula');
  } else {
    score += 20;
  }

  if (!/[a-z]/.test(password)) {
    feedback.push('Adicione pelo menos uma letra minúscula');
  } else {
    score += 20;
  }

  if (!/[0-9]/.test(password)) {
    feedback.push('Adicione pelo menos um número');
  } else {
    score += 20;
  }

  if (!PASSWORD_SPECIAL_PATTERN.test(password)) {
    feedback.push('Adicione pelo menos um caractere especial (!@#$%^&*)');
  } else {
    score += 20;
  }

  let strength: PasswordStrength = 'weak';
  if (score >= 80) strength = 'strong';
  else if (score >= 60) strength = 'good';
  else if (score >= 40) strength = 'fair';

  return {
    isValid: feedback.length === 0,
    strength,
    score: Math.min(score, 100),
    feedback,
  };
}

/** A checklist mostrada abaixo do campo, na mesma ordem das regras. */
export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'Uma letra maiúscula', met: /[A-Z]/.test(password) },
    { label: 'Uma letra minúscula', met: /[a-z]/.test(password) },
    { label: 'Um número', met: /[0-9]/.test(password) },
    { label: 'Um caractere especial', met: PASSWORD_SPECIAL_PATTERN.test(password) },
  ];
}

/**
 * Rótulo mostrado no medidor.
 *
 * Enquanto alguma regra falta, a senha é recusada pelo servidor — então dizer
 * "Forte" só porque o score subiu seria mentir sobre o que vai acontecer no
 * envio. O rótulo de força só aparece depois que a senha passa.
 */
export function getPasswordMeterLabel(result: PasswordStrengthResult): string {
  if (!result.isValid) return 'Ainda não atende';
  return getPasswordStrengthLabel(result.strength);
}

export function getPasswordMeterColor(result: PasswordStrengthResult): string {
  if (!result.isValid) return 'text-amber-600';
  return getPasswordStrengthColor(result.strength);
}

export function getPasswordMeterBarColor(result: PasswordStrengthResult): string {
  if (!result.isValid) return 'bg-amber-500';
  return getPasswordStrengthBarColor(result.strength);
}

export function getPasswordStrengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case 'strong':
      return 'Muito forte';
    case 'good':
      return 'Forte';
    case 'fair':
      return 'Moderada';
    default:
      return 'Fraca';
  }
}

/** Cor do texto do rótulo de força. */
export function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'strong':
      return 'text-emerald-600';
    case 'good':
      return 'text-sky-600';
    case 'fair':
      return 'text-amber-600';
    default:
      return 'text-rose-600';
  }
}

/** Cor da barra de progresso. */
export function getPasswordStrengthBarColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'strong':
      return 'bg-emerald-500';
    case 'good':
      return 'bg-sky-500';
    case 'fair':
      return 'bg-amber-500';
    default:
      return 'bg-rose-500';
  }
}
