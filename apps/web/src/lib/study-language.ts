import { getActiveLocale, t } from '@/lib/i18n';

// The language a child studies, chosen at signup. The value is what the API
// stores; `label` is the Portuguese name, translated by t() like any other
// text; `nativeName` is how the language writes its own name.
const STUDY_LANGUAGE_NAMES: Record<string, { label: string; nativeName: string }> = {
  English: { label: 'Inglês', nativeName: 'English' },
  French: { label: 'Francês', nativeName: 'Français' },
  Spanish: { label: 'Espanhol', nativeName: 'Español' },
  German: { label: 'Alemão', nativeName: 'Deutsch' },
  Italian: { label: 'Italiano', nativeName: 'Italiano' },
  Russian: { label: 'Russo', nativeName: 'Русский' },
};

export const DEFAULT_STUDY_LANGUAGE = 'English';

function namesFor(language: string | null | undefined) {
  return STUDY_LANGUAGE_NAMES[language ?? ''] ?? null;
}

/** "Francês" in Portuguese, "French" in English. Unknown values show as stored. */
export function studyLanguageName(language: string | null | undefined): string {
  const names = namesFor(language);
  if (names) return t(names.label);
  return language?.trim() || t(STUDY_LANGUAGE_NAMES[DEFAULT_STUDY_LANGUAGE].label);
}

/**
 * The name as it sits inside a sentence: Portuguese writes language names in
 * lower case ("lição de francês"), English capitalises them ("French lesson").
 */
export function studyLanguageInSentence(language: string | null | undefined): string {
  const name = studyLanguageName(language);
  return getActiveLocale() === 'pt-BR' ? name.toLocaleLowerCase('pt-BR') : name;
}

/** "Français" whatever the app's language, like the "English" the tab always showed. */
export function studyLanguageNativeName(language: string | null | undefined): string {
  return namesFor(language)?.nativeName ?? (language?.trim() || STUDY_LANGUAGE_NAMES[DEFAULT_STUDY_LANGUAGE].nativeName);
}
