'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { createCurriculumApi, curriculumBase, type CurriculumApi, type CurriculumTrack } from '@/lib/api';

// Programming and the other disciplines share every screen of the curriculum —
// subject list, reading, flashcards, questions, review. What differs is which
// list the calls go to — programming, or one discipline such as Francês — so
// the screens read it from here instead of each one taking a prop to pass down.
interface CurriculumScope {
  track: CurriculumTrack;
  disciplineId: number | null;
  disciplineName: string;
}

const CurriculumScopeContext = createContext<CurriculumScope>({
  track: 'programming',
  disciplineId: null,
  disciplineName: '',
});

export function CurriculumTrackProvider({
  track, disciplineId = null, disciplineName = '', children,
}: {
  track: CurriculumTrack;
  disciplineId?: number | null;
  disciplineName?: string;
  children: ReactNode;
}) {
  const scope = useMemo(() => ({ track, disciplineId, disciplineName }), [track, disciplineId, disciplineName]);
  return <CurriculumScopeContext.Provider value={scope}>{children}</CurriculumScopeContext.Provider>;
}

export function useCurriculumTrack(): CurriculumTrack {
  return useContext(CurriculumScopeContext).track;
}

/** The discipline on screen ("Francês"), or an empty name for programming. */
export function useCurriculumDisciplineName(): string {
  return useContext(CurriculumScopeContext).disciplineName;
}

/** The curriculum calls bound to the list this screen belongs to. */
export function useCurriculumApi(): CurriculumApi {
  const { track, disciplineId } = useContext(CurriculumScopeContext);
  return useMemo(() => createCurriculumApi(curriculumBase(track), disciplineId), [track, disciplineId]);
}
