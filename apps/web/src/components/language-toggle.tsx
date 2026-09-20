'use client';

import { Languages } from 'lucide-react';
import { LOCALE_OPTIONS, t, type LocalePreference } from '@/lib/i18n';
import { useLocale } from './locale-provider';

// The short form on the button, so the control fits a phone's navbar. The long
// names live in LOCALE_OPTIONS and are never translated.
const SHORT_LABELS: Record<LocalePreference, string> = {
  system: 'Auto',
  'pt-BR': 'PT',
  en: 'EN',
};

interface LanguageToggleProps {
  compact?: boolean;
  className?: string;
}

export function LanguageToggle({ compact = false, className = '' }: LanguageToggleProps) {
  const { preference, locale, setPreference } = useLocale();

  return (
    <div
      className={`language-toggle inline-grid grid-cols-3 gap-1 rounded-full border-2 border-slate-200 bg-white/85 p-1 shadow-sm backdrop-blur ${className}`}
      role="radiogroup"
      aria-label={t('Idioma do app')}
      data-resolved-locale={locale}
    >
      {LOCALE_OPTIONS.map((option) => {
        const active = preference === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${t('Idioma')}: ${option.label}`}
            title={`${t('Idioma')}: ${option.label}`}
            onClick={() => setPreference(option.value)}
            className={`language-toggle-option inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-primary/35 ${
              active
                ? 'bg-primary-dark text-white shadow-[0_10px_20px_rgba(14,165,233,0.25)]'
                : 'text-slate-500 hover:bg-slate-100 hover:text-primary-dark'
            } ${compact ? 'w-9 px-0' : 'sm:min-w-[5.25rem]'}`}
          >
            {option.value === 'system' ? <Languages size={15} strokeWidth={2.4} /> : null}
            <span>{compact ? SHORT_LABELS[option.value] : option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
