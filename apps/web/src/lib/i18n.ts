import { EN_DICTIONARY } from '@/lib/locales/en';

export type LocalePreference = 'system' | 'pt-BR' | 'en';
export type ResolvedLocale = 'pt-BR' | 'en';

export const LOCALE_STORAGE_KEY = 'english-kids-tutor.locale-preference';
export const DEFAULT_LOCALE: ResolvedLocale = 'pt-BR';

export const LOCALE_OPTIONS: Array<{ value: LocalePreference; label: string }> = [
  // Deliberately not translated: somebody looking for their own language should
  // find it written the way they write it, even while the app is in the other one.
  { value: 'system', label: 'Sistema · System' },
  { value: 'pt-BR', label: 'Português' },
  { value: 'en', label: 'English' },
];

export function normalizeLocalePreference(value?: unknown): LocalePreference {
  if (typeof value !== 'string') return 'system';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'en' || normalized === 'pt-br' || normalized === 'system') {
    return normalized === 'pt-br' ? 'pt-BR' : (normalized as LocalePreference);
  }
  return 'system';
}

/**
 * The locale for a system that announces `tags`, e.g. `navigator.languages`.
 *
 * Anything that is not Portuguese gets English rather than a third fallback:
 * between an app the reader cannot use and one in their second language,
 * English is the useful answer. Portuguese stays the default when the system
 * says nothing at all, because that is who the app has today.
 */
export function resolveSystemLocale(tags: readonly string[] | undefined): ResolvedLocale {
  for (const tag of tags ?? []) {
    const normalized = String(tag || '').trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR';
    return 'en';
  }
  return DEFAULT_LOCALE;
}

export function resolveLocalePreference(
  preference: LocalePreference,
  systemLocale: ResolvedLocale,
): ResolvedLocale {
  if (preference === 'system') return systemLocale;
  return preference;
}

// The locale every t() call reads. It is module state on purpose: it lets text
// be translated at the moment it is rendered rather than at the moment it is
// written, which is what makes a label stored in a plain constant — and there
// are many — translatable without turning that constant into a hook call.
//
// On the server this is never assigned, so it stays at the default and every
// request renders the same HTML. Only the browser moves it, from an effect.
let activeLocale: ResolvedLocale = DEFAULT_LOCALE;

export function setActiveLocale(locale: ResolvedLocale) {
  activeLocale = locale;
}

export function getActiveLocale(): ResolvedLocale {
  return activeLocale;
}

const DICTIONARIES: Record<ResolvedLocale, Record<string, string> | null> = {
  'pt-BR': null,
  en: EN_DICTIONARY,
};

/**
 * The given Portuguese text in the active locale.
 *
 * Keyed by the source text rather than by an invented id, so a string with no
 * translation yet renders in Portuguese instead of showing a raw key to the
 * reader. A missing entry is a gap, never a broken screen.
 */
export function t(text: string): string {
  const dictionary = DICTIONARIES[activeLocale];
  if (!dictionary) return text;
  return dictionary[text] ?? text;
}

/** Same as `t`, for text built at runtime: `tf('Olá, {name}', { name })`. */
export function tf(text: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    t(text),
  );
}
