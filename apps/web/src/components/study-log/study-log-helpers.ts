/**
 * Pure helpers of the "Controle de estudos": how entries are grouped, counted
 * and named. Kept apart from the components so the numbers the page shows can
 * be checked without rendering it (scripts/test-study-log-helpers.mjs).
 */

import type { StudyLogEntryItem } from '@/lib/api';

/** Combining accents (U+0300 to U+036F) dropped after NFKD splits them off. */
function stripAccents(value: string): string {
  let result = '';
  for (const character of value.normalize('NFKD')) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x300 || code > 0x36f) result += character;
  }
  return result;
}

// Spaces and punctuation separate words; letters of any alphabet stay, so a
// name in Cyrillic keeps its own key instead of folding to nothing.
const SEPARATORS = /[\s!-\/:-@[-`{-~–—«»“”‘’]+/g;

function fold(value: string | null | undefined): string {
  return stripAccents(String(value ?? ''))
    .toLowerCase()
    .replace(SEPARATORS, ' ')
    .trim();
}

/**
 * The labels the app writes in either of its languages name the same group —
 * the same folding as name_key() in apps/api/services/study_log_service.py.
 */
const NAME_ALIASES: Record<string, string> = Object.fromEntries(
  (
    [
      ['Programming', 'Programação'],
      ['Daily notes', 'Anotações do dia'],
      ['English', 'Inglês'],
      ['French', 'Francês'],
      ['Spanish', 'Espanhol'],
      ['German', 'Alemão'],
      ['Italian', 'Italiano'],
      ['Russian', 'Russo'],
    ] as const
  ).map(([alias, canonical]) => [fold(alias), fold(canonical)]),
);

/** Case, accents, spacing and punctuation do not make another group. */
export function nameKey(value: string | null | undefined): string {
  const folded = fold(value);
  return NAME_ALIASES[folded] ?? folded;
}

/** "45 min", "1h", "1h 20min" — 0 or nothing reads as "—". */
export function formatMinutes(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(minutes ?? 0));
  if (!total) return '—';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function addDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export interface StudyLogTotals {
  todayMinutes: number;
  todayCount: number;
  weekMinutes: number;
  weekCount: number;
  previousWeekMinutes: number;
  /** Days with at least one entry in the last 7, today included. */
  weekStudyDays: number;
}

/** Today, the last 7 days and the 7 before them, counted from the entries. */
export function studyLogTotals(entries: StudyLogEntryItem[], today: string): StudyLogTotals {
  const weekStart = addDays(today, -6);
  const previousStart = addDays(today, -13);
  const previousEnd = addDays(today, -7);
  const days = new Set<string>();
  const totals: StudyLogTotals = {
    todayMinutes: 0,
    todayCount: 0,
    weekMinutes: 0,
    weekCount: 0,
    previousWeekMinutes: 0,
    weekStudyDays: 0,
  };
  for (const entry of entries) {
    const minutes = entry.duration_minutes ?? 0;
    const day = entry.studied_on;
    if (day === today) {
      totals.todayMinutes += minutes;
      totals.todayCount += 1;
    }
    if (day >= weekStart && day <= today) {
      totals.weekMinutes += minutes;
      totals.weekCount += 1;
      days.add(day);
    } else if (day >= previousStart && day <= previousEnd) {
      totals.previousWeekMinutes += minutes;
    }
  }
  totals.weekStudyDays = days.size;
  return totals;
}

export interface DayGroup {
  day: string;
  entries: StudyLogEntryItem[];
  minutes: number;
}

/** Entries by the day they were studied, newest day first. */
export function groupByDay(entries: StudyLogEntryItem[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const entry of entries) {
    const group = groups.get(entry.studied_on) ?? { day: entry.studied_on, entries: [], minutes: 0 };
    group.entries.push(entry);
    group.minutes += entry.duration_minutes ?? 0;
    groups.set(entry.studied_on, group);
  }
  return [...groups.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

export interface SubjectGroup {
  /** null holds the entries without a subject yet. */
  subject: string | null;
  entries: StudyLogEntryItem[];
  minutes: number;
}

export interface DisciplineGroup {
  discipline: string;
  subjects: SubjectGroup[];
  count: number;
  minutes: number;
  lastStudied: string;
}

/**
 * Discipline › subject › entries. A group takes the spelling of its most recent
 * entry; disciplines studied most recently come first, subjects alphabetically
 * with "no subject" last.
 */
export function groupByDiscipline(entries: StudyLogEntryItem[]): DisciplineGroup[] {
  const sorted = [...entries].sort((a, b) => (a.studied_on < b.studied_on ? 1 : a.studied_on > b.studied_on ? -1 : b.id - a.id));
  const disciplines = new Map<string, DisciplineGroup & { subjectIndex: Map<string, SubjectGroup> }>();
  for (const entry of sorted) {
    const disciplineKey = nameKey(entry.discipline);
    let group = disciplines.get(disciplineKey);
    if (!group) {
      group = {
        discipline: entry.discipline,
        subjects: [],
        count: 0,
        minutes: 0,
        lastStudied: entry.studied_on,
        subjectIndex: new Map(),
      };
      disciplines.set(disciplineKey, group);
    }
    const subjectKey = entry.subject ? nameKey(entry.subject) : '';
    let subject = group.subjectIndex.get(subjectKey);
    if (!subject) {
      subject = { subject: entry.subject || null, entries: [], minutes: 0 };
      group.subjectIndex.set(subjectKey, subject);
      group.subjects.push(subject);
    }
    subject.entries.push(entry);
    subject.minutes += entry.duration_minutes ?? 0;
    group.count += 1;
    group.minutes += entry.duration_minutes ?? 0;
  }
  return [...disciplines.values()].map((group) => ({
    discipline: group.discipline,
    count: group.count,
    minutes: group.minutes,
    lastStudied: group.lastStudied,
    subjects: [...group.subjects].sort((a, b) => {
      if (a.subject === null) return 1;
      if (b.subject === null) return -1;
      return a.subject.localeCompare(b.subject, 'pt-BR', { sensitivity: 'base' });
    }),
  }));
}

/** Entries whose title, discipline or subject contain every word typed. */
export function filterEntries(entries: StudyLogEntryItem[], query: string): StudyLogEntryItem[] {
  const words = nameKey(query).split(' ').filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((entry) => {
    const haystack = nameKey(`${entry.title} ${entry.discipline} ${entry.subject ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
}
