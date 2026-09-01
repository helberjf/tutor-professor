/** Types, constants and pure helpers shared by the study page and its components.
 *
 * Extracted from page.tsx so the presentational components can live in their own
 * files without importing the page container (which would be a cycle).
 */
import type { CodingTopic, DiverseLessonBlock, DiverseSubject, StudyDay } from '@/lib/api';
import { resolveItemsByIds, updateItemById } from '@/lib/diverse-question-state';
import type { PomodoroMode } from '@/lib/pomodoro';

export const AI_FLASHCARD_COUNT = 5;

export type StudyTab = 'english' | 'coding' | 'diverse' | 'dashboard';
export type CodingMode = 'reading' | 'flashcards' | 'questions' | 'exam';

export interface InlineStudyState {
  order: number[];        // topic indices, sorted by review priority
  position: number;       // current position within `order`
  userAnswer: string;
  revealed: boolean;
  results: StudyRating[]; // indexed by position in `order`
  done: boolean;
}

export type StudyRating = 'knew' | 'partial' | 'unknown';
export type DiverseAIAction = 'create-subject' | 'suggest-subject' | 'topic' | 'lesson';
export type PendingLessonDraft = { subjectId: string; lesson: DiverseLessonBlock; topics: CodingTopic[] };

export const SUBJECT_META: Record<string, { label: string; badge: string; tone: string; iconColor: string; borderColor: string; bgColor: string }> = {
  react:      { label: 'React',      badge: '⚛',  tone: 'cyan',  iconColor: 'text-cyan-700',  borderColor: 'border-cyan-200',  bgColor: 'bg-cyan-50'  },
  leetcode:   { label: 'LeetCode',   badge: 'LC', tone: 'amber', iconColor: 'text-amber-700', borderColor: 'border-amber-200', bgColor: 'bg-amber-50' },
  typescript: { label: 'TypeScript', badge: '🔷', tone: 'blue',  iconColor: 'text-blue-700',  borderColor: 'border-blue-200',  bgColor: 'bg-blue-50'  },
  nextjs:     { label: 'Next.js',    badge: '▲',  tone: 'slate', iconColor: 'text-slate-700', borderColor: 'border-slate-200', bgColor: 'bg-slate-50' },
};

export const SUBJECT_ORDER = ['react', 'leetcode', 'typescript', 'nextjs'];

export function getLocalDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatDateLabel(value: string | null) {
  if (!value) return 'Nenhum registro';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

export function formatDateBadge(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

export function buildEmptyDay(studyDate: string): StudyDay {
  return { id: null, study_date: studyDate, plan_text: '', studied_text: '', distractions: [], is_study_day: false, pomodoro_count: 0, created_at: null, updated_at: null };
}

export function getPomodoroCompletionMessage(mode: PomodoroMode) {
  return mode === 'focus'
    ? 'Bloco de foco concluido. Hora de uma pausa.'
    : 'Pausa concluida. Hora de voltar ao foco.';
}

export function slugifySubjectName(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'materia';
}

export function getDiverseSubjectSlug(subject: DiverseSubject, index: number, subjects: DiverseSubject[]) {
  const baseSlug = slugifySubjectName(subject.name);
  const previousMatches = subjects
    .slice(0, index)
    .filter((candidate) => slugifySubjectName(candidate.name) === baseSlug).length;
  return previousMatches === 0 ? baseSlug : `${baseSlug}-${previousMatches + 1}`;
}

export function getDiverseSubjectLessons(subject: DiverseSubject) {
  return subject.lessons ?? [];
}

export function resolveDiverseLessonTopics(subject: DiverseSubject, lesson: DiverseLessonBlock) {
  return resolveItemsByIds(subject.topics, lesson.topic_ids);
}

export function getDiverseSubjectTopics(subject: DiverseSubject) {
  const seen = new Set<string>();
  return subject.topics.filter((topic) => {
    const key = normalizeDiverseTopicText(topic.topic);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeDiverseTopicText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getDiverseAvoidTopics(subject: DiverseSubject) {
  return getDiverseSubjectTopics(subject)
    .map((topic) => topic.topic.trim())
    .filter(Boolean)
    .slice(-100);
}

export const RATING_WEIGHT: Record<StudyRating, number> = { unknown: 100, partial: 60, knew: 12 };

// Higher score = should be reviewed sooner (spaced repetition priority).
export function getTopicReviewPriority(topic: CodingTopic, now = Date.now()): number {
  const rating = topic.last_rating ?? null;
  let score = rating ? RATING_WEIGHT[rating] : 45; // never studied sits between partial and knew
  const reviews = topic.review_count ?? 0;
  score -= Math.min(reviews, 6) * 4; // well-reviewed topics gradually sink
  if (topic.last_reviewed) {
    const ageHours = (now - Date.parse(topic.last_reviewed)) / 3_600_000;
    if (!Number.isNaN(ageHours)) score += Math.min(Math.max(ageHours, 0), 72) * 0.25; // older → higher
  } else {
    score += 8; // never reviewed gets a small nudge up
  }
  return score;
}

export function buildStudyOrder(topics: CodingTopic[]): number[] {
  return topics
    .map((topic, index) => ({ index, priority: getTopicReviewPriority(topic) }))
    .sort((a, b) => b.priority - a.priority)
    .map((entry) => entry.index);
}

export const RATING_META: Record<StudyRating, { label: string; dot: string; chip: string }> = {
  unknown: { label: 'Não sabia', dot: 'bg-rose-400', chip: 'bg-rose-100 text-rose-700' },
  partial: { label: 'Parcial', dot: 'bg-amber-400', chip: 'bg-amber-100 text-amber-700' },
  knew: { label: 'Sabia', dot: 'bg-emerald-400', chip: 'bg-emerald-100 text-emerald-700' },
};

export function filterFreshDiverseTopics(topics: CodingTopic[], existingTopics: string[]) {
  const seen = new Set(existingTopics.map(normalizeDiverseTopicText).filter(Boolean));
  return topics.filter((topic) => {
    const key = normalizeDiverseTopicText(topic.topic);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createLocalLessonId() {
  return `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createLocalQuestionId() {
  return `question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLocalSubjectId() {
  return `subject-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function updateDiverseQuestionById(
  subject: DiverseSubject,
  questionId: string,
  updater: (topic: CodingTopic) => CodingTopic,
) {
  return {
    ...subject,
    id: subject.id,
    topics: updateItemById(subject.topics, questionId, updater),
  };
}

export function buildLessonTitle(subject: DiverseSubject, topics: CodingTopic[]) {
  const lessonNumber = getDiverseSubjectLessons(subject).length + 1;
  const firstTopic = topics[0]?.topic?.trim();
  return firstTopic ? `Lição ${lessonNumber}: ${firstTopic.slice(0, 42)}` : `Lição ${lessonNumber}`;
}

export function parseJsonTopics(raw: string): CodingTopic[] {
  const parsed = JSON.parse(raw);
  const normalize = (item: Record<string, unknown>): CodingTopic | null => {
    const topic = (item.topic ?? item.question ?? item.front ?? item.pergunta ?? '') as string;
    const answer = (item.answer ?? item.back ?? item.resposta ?? '') as string;
    const codeExample = (item.code_example ?? item.code ?? null) as string | null;
    if (!topic.trim()) return null;
    return {
      id: createLocalQuestionId(),
      topic: topic.trim(),
      answer: (answer ?? '').trim(),
      code_example: codeExample?.trim() || null,
      done: false,
    };
  };
  if (Array.isArray(parsed)) return parsed.map(normalize).filter(Boolean) as CodingTopic[];
  const arr = parsed.flashcards ?? parsed.topics ?? parsed.items ?? parsed.cards;
  if (Array.isArray(arr)) return arr.map(normalize).filter(Boolean) as CodingTopic[];
  const single = normalize(parsed as Record<string, unknown>);
  return single ? [single] : [];
}
