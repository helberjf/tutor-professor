/**
 * Age band from a date of birth — the client half of the same rule.
 *
 * The band used to be picked from a dropdown, which was a guess that went stale
 * the day after a birthday. The date is the fact; the band is the conclusion,
 * and it follows the birthday on its own.
 *
 * This mirrors `apps/api/services/audience.py`. The API is the authority — it
 * recomputes the band on every write — but the forms need the same answer while
 * somebody is still typing, to show what the date means before it is saved.
 */

/** Under this many years, the terms' adult-supervision clause applies. */
export const MINOR_AGE = 18;
export const MAX_SUPPORTED_AGE = 120;

const BAND_LABELS: Record<string, string> = {
  '4-6': '4 a 6 anos',
  '7-9': '7 a 9 anos',
  '10-12': '10 a 12 anos',
  '13-17': '13 a 17 anos',
  '18+': '18 anos ou mais',
};

/** Parses `YYYY-MM-DD` as a local calendar date, not as UTC midnight. */
export function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  // Rejects 2026-02-31 and friends, which Date happily rolls over.
  if (
    parsed.getFullYear() !== Number(year)
    || parsed.getMonth() !== Number(month) - 1
    || parsed.getDate() !== Number(day)
  ) {
    return null;
  }
  return parsed;
}

/** Whole years old, or null when the date is missing, unreadable or ahead of today. */
export function ageFromIsoDate(iso: string | null | undefined, today = new Date()): number | null {
  const birth = parseIsoDate(iso);
  if (!birth) return null;
  if (birth.getTime() > today.getTime()) return null;
  let years = today.getFullYear() - birth.getFullYear();
  const hadBirthday =
    today.getMonth() > birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) years -= 1;
  return Math.max(0, years);
}

export function bandFromAge(age: number | null): string | null {
  if (age === null) return null;
  if (age <= 6) return '4-6';
  if (age <= 9) return '7-9';
  if (age <= 12) return '10-12';
  if (age <= 17) return '13-17';
  return '18+';
}

export function bandFromIsoDate(iso: string | null | undefined, today = new Date()): string | null {
  return bandFromAge(ageFromIsoDate(iso, today));
}

export function bandLabel(band: string | null | undefined): string {
  if (!band) return '';
  return BAND_LABELS[band] ?? band;
}

/** True when the date belongs to somebody under 18 — the supervision case. */
export function isMinorIsoDate(iso: string | null | undefined, today = new Date()): boolean {
  const age = ageFromIsoDate(iso, today);
  return age !== null && age < MINOR_AGE;
}

/** The reason this date cannot be used, or an empty string when it is fine. */
export function birthDateError(iso: string, today = new Date()): string {
  if (!iso.trim()) return 'Informe a data de nascimento.';
  const parsed = parseIsoDate(iso);
  if (!parsed) return 'Data inválida.';
  if (parsed.getTime() > today.getTime()) return 'A data não pode estar no futuro.';
  const age = ageFromIsoDate(iso, today) ?? 0;
  if (age > MAX_SUPPORTED_AGE) return 'Confira o ano de nascimento.';
  return '';
}
