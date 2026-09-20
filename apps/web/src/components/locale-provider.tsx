'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeLocalePreference,
  resolveLocalePreference,
  resolveSystemLocale,
  setActiveLocale,
  type LocalePreference,
  type ResolvedLocale,
} from '@/lib/i18n';

interface LocaleContextValue {
  preference: LocalePreference;
  locale: ResolvedLocale;
  setPreference: (preference: LocalePreference) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// useLayoutEffect has no meaning during server rendering and React says so out
// loud. The distinction that matters here only exists in the browser anyway.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readSystemLocale(): ResolvedLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return resolveSystemLocale(tags);
}

function readStoredPreference(): LocalePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    return normalizeLocalePreference(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    // Private windows and blocked site data both throw here. The system's own
    // language is a perfectly good answer when we cannot remember a choice.
    return 'system';
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // The first client render has to match the HTML the server sent, exactly as
  // ThemeProvider does, so it starts from the default and adopts the real
  // locale one tick later. The adoption runs in a layout effect, before the
  // browser paints, so the reader does not see the other language first.
  const [preference, setPreferenceState] = useState<LocalePreference>('system');
  const [locale, setLocale] = useState<ResolvedLocale>(DEFAULT_LOCALE);

  // Keep the module-level locale in step with what this render is about to
  // draw. It has to happen here rather than in an effect: the children render
  // immediately after this line, and they read it through t() as they go.
  setActiveLocale(locale);

  useIsomorphicLayoutEffect(() => {
    const stored = readStoredPreference();
    const resolved = resolveLocalePreference(stored, readSystemLocale());
    setPreferenceState(stored);
    setLocale(resolved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    document.documentElement.dataset.localePreference = preference;
  }, [locale, preference]);

  const setPreference = useCallback((next: LocalePreference) => {
    const normalized = normalizeLocalePreference(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
    } catch {
      // Not being able to remember the choice is no reason to refuse it.
    }
    setPreferenceState(normalized);
    setLocale(resolveLocalePreference(normalized, readSystemLocale()));
  }, []);

  const value = useMemo(
    () => ({ preference, locale, setPreference }),
    [preference, locale, setPreference],
  );

  return (
    <LocaleContext.Provider value={value}>
      {/*
        Remounting on a language change is what makes every t() in the tree run
        again, including the ones in components that never subscribed to this
        context — and most of them have no reason to. Switching language is a
        rare, deliberate act, so paying a remount for it buys correctness
        everywhere at a cost nobody is in a position to notice.
      */}
      <div key={locale} className="contents">
        {children}
      </div>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return context;
}
