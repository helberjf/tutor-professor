import type { StudyDiscipline, StudyResume } from '@/lib/api';

/** Only select the discipline; opening its subject or lesson stays explicit. */
export function getLastStudyDiscipline(
  resume: Pick<StudyResume, 'has_resume' | 'href'>,
  disciplines: Pick<StudyDiscipline, 'id'>[],
  codingEnabled: boolean,
): {tab: 'diverse' | 'coding'; disciplineId: number | null} | null {
  if (!resume.has_resume) return null;
  const url = new URL(resume.href, 'https://study.invalid');
  if (url.origin !== 'https://study.invalid' || url.pathname !== '/study') return null;
  if (url.searchParams.get('tab') === 'coding') {
    return codingEnabled ? {tab: 'coding', disciplineId: null} : null;
  }
  const disciplineId = Number(url.searchParams.get('discipline_id'));
  if (url.searchParams.get('tab') === 'diverse' && disciplines.some((item) => item.id === disciplineId)) {
    return {tab: 'diverse', disciplineId};
  }
  return null;
}
