'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// What the app shows before the profile answers, and what it falls back to when
// the backend is older than this build: everything except programming, which is
// the module that now ships off.
const FALLBACK_MODULES: Record<string, boolean> = {
  language: true,
  diverse: true,
  books: true,
  exams: true,
  coding: false,
};

export interface ModulesState {
  modules: Record<string, boolean>;
  loading: boolean;
}

/**
 * The optional modules this account switched on.
 *
 * Read from the cached /api/auth/me rather than its own endpoint, so a page
 * that already asks for the profile does not pay for a second request.
 */
export function useModules(): ModulesState {
  const [modules, setModules] = useState<Record<string, boolean>>(FALLBACK_MODULES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api.getUserMe()
      .then((profile) => {
        if (cancelled) return;
        setModules({ ...FALLBACK_MODULES, ...(profile.modules ?? {}) });
      })
      .catch(() => {
        // Signed out or offline: keep the defaults rather than blanking the menu.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { modules, loading };
}

export function useModuleEnabled(moduleId: string): boolean {
  const { modules } = useModules();
  return modules[moduleId] ?? false;
}
