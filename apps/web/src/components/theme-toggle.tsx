'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { THEME_OPTIONS, type ThemePreference } from '@/lib/theme';
import { useTheme } from './theme-provider';

const ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} satisfies Record<ThemePreference, typeof Monitor>;

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className = '' }: ThemeToggleProps) {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <div
      className={`theme-toggle inline-grid grid-cols-3 gap-1 rounded-full border-2 border-slate-200 bg-white/85 p-1 shadow-sm backdrop-blur ${className}`}
      role="radiogroup"
      aria-label="Tema do app"
      data-resolved-theme={resolvedTheme}
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = ICONS[option.value];
        const active = preference === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Tema ${option.label}`}
            title={`Tema ${option.label}`}
            onClick={() => setPreference(option.value)}
            className={`theme-toggle-option inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-primary/35 ${
              active
                ? 'bg-primary text-white shadow-[0_10px_20px_rgba(14,165,233,0.25)]'
                : 'text-slate-500 hover:bg-slate-100 hover:text-primary-dark'
            } ${compact ? 'w-9 px-0' : 'sm:min-w-[5.25rem]'}`}
          >
            <Icon size={15} strokeWidth={2.4} />
            {!compact && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
