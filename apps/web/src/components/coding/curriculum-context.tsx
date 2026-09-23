'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { createCurriculumApi, curriculumBase, type CurriculumApi, type CurriculumTrack } from '@/lib/api';

// Programming and "Outras matérias" share every screen of the curriculum —
// subject list, reading, flashcards, questions, review. What differs is which
// list the calls go to, so the screens read it from here instead of each one
// taking a prop it would only pass down.
const CurriculumTrackContext = createContext<CurriculumTrack>('programming');

export function CurriculumTrackProvider({ track, children }: { track: CurriculumTrack; children: ReactNode }) {
  return <CurriculumTrackContext.Provider value={track}>{children}</CurriculumTrackContext.Provider>;
}

export function useCurriculumTrack(): CurriculumTrack {
  return useContext(CurriculumTrackContext);
}

/** The curriculum calls bound to the list this screen belongs to. */
export function useCurriculumApi(): CurriculumApi {
  const track = useCurriculumTrack();
  return useMemo(() => createCurriculumApi(curriculumBase(track)), [track]);
}
