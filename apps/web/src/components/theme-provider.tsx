'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
}

function getSystemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(preference: ThemePreference, systemPrefersDark = getSystemPrefersDark()) {
  if (typeof document === 'undefined') return 'light';
  const resolvedTheme = resolveThemePreference(preference, systemPrefersDark);
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The first client render has to match the HTML the server sent, so it starts
  // from the server's own answer instead of reading localStorage here. Reading
  // it during the initial render is what made React report a hydration mismatch
  // on every page for anyone whose theme was not the default.
  //
  // Nothing flashes because of this: ThemeScript already wrote data-theme on
  // <html> before the first paint, so the page is painted in the right colours
  // while these two values catch up one tick later.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [adopted, setAdopted] = useState(false);

  useEffect(() => {
    const stored = readInitialPreference();
    setPreferenceState(stored);
    setResolvedTheme(resolveThemePreference(stored, getSystemPrefersDark()));
    setAdopted(true);
  }, []);

  useEffect(() => {
    // Until the stored preference is known, applying "system" here would undo
    // what ThemeScript did for someone who chose light or dark by hand.
    if (!adopted) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => setResolvedTheme(applyTheme(preference, media.matches));

    syncTheme();
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, [adopted, preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    const normalized = normalizeThemePreference(nextPreference);
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    setPreferenceState(normalized);
    setResolvedTheme(applyTheme(normalized));
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
