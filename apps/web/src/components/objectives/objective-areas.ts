import type { ObjectiveArea } from '@/lib/api';

/**
 * The study areas an objective item can belong to.
 *
 * They mirror the modes the app already has, so an item reads as "isto é da
 * lição de idiomas" instead of being one more taxonomy to learn. `free` is the
 * default because most of what someone writes down is not any mode in
 * particular — it is a book, a video, an exercise list.
 */
export const OBJECTIVE_AREAS: Array<{ id: ObjectiveArea; label: string; chip: string }> = [
  { id: 'free', label: 'Livre', chip: 'bg-slate-100 text-slate-600' },
  { id: 'language', label: 'Idiomas', chip: 'bg-sky-50 text-sky-700' },
  { id: 'coding', label: 'Programação', chip: 'bg-orange-50 text-orange-700' },
  { id: 'diverse', label: 'Gerais', chip: 'bg-indigo-50 text-indigo-700' },
  { id: 'exam', label: 'Simulado', chip: 'bg-violet-50 text-violet-700' },
];

const AREAS_BY_ID = new Map(OBJECTIVE_AREAS.map((area) => [area.id, area]));

export function areaLabel(area: string) {
  return AREAS_BY_ID.get(area as ObjectiveArea)?.label ?? 'Livre';
}

export function areaChipClass(area: string) {
  return AREAS_BY_ID.get(area as ObjectiveArea)?.chip ?? 'bg-slate-100 text-slate-600';
}

/** Green once it is done, amber while it is moving, slate while it is still zero. */
export function progressToneClass(percent: number) {
  if (percent >= 100) return 'bg-emerald-500';
  if (percent > 0) return 'bg-amber-500';
  return 'bg-slate-300';
}

export function formatTargetDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The deadline in words. Negative days are the interesting case: the objective
 * is not cancelled by a missed date, it is just late, and saying so is more
 * useful than hiding it.
 */
export function deadlineLabel(daysRemaining: number | null, targetDate: string | null) {
  if (targetDate === null || daysRemaining === null) return null;
  const formatted = formatTargetDate(targetDate);
  if (daysRemaining < 0) {
    const late = Math.abs(daysRemaining);
    return `${formatted} · atrasado ${late} ${late === 1 ? 'dia' : 'dias'}`;
  }
  if (daysRemaining === 0) return `${formatted} · é hoje`;
  return `${formatted} · faltam ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}`;
}
