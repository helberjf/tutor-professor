'use client';

import { useEffect, useState } from 'react';
import { api, type LevelAnalysis } from '@/lib/api';
import { DEFAULT_STUDY_LANGUAGE } from '@/lib/study-language';

// Same cache the lesson page keeps its level in, so a child who has opened a
// lesson on this device sees the right language before the request answers.
const LEVEL_CACHE_KEY = 'child_level_cache';

function readCachedLanguage(): string | null {
  try {
    const cached = localStorage.getItem(LEVEL_CACHE_KEY);
    return cached ? (JSON.parse(cached) as Partial<LevelAnalysis>).target_language || null : null;
  } catch {
    return null;
  }
}

/**
 * The language the active child studies ("English", "French"...).
 *
 * Starts at the default so server and client markup agree, then takes the
 * cached value and finally the answer from /api/child/level, which follows the
 * active child.
 */
export function useStudyLanguage(): string {
  const [language, setLanguage] = useState(DEFAULT_STUDY_LANGUAGE);

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedLanguage();
    if (cached) setLanguage(cached);

    api.getChildLevel()
      .then((level) => {
        if (cancelled || !level.target_language) return;
        setLanguage(level.target_language);
        try { localStorage.setItem(LEVEL_CACHE_KEY, JSON.stringify(level)); } catch { /* ignore */ }
      })
      .catch(() => {
        // Offline or signed out: keep whatever is showing rather than blanking it.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return language;
}
