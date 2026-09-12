/**
 * Which saved questions are still worth answering, and in what order.
 *
 * "Fazer simulado" used to replay every question of a topic from the first one,
 * every time, so a student who answered five questions yesterday met the same five
 * today before reaching anything new — with the metrics needed to do better
 * (`attempt_count`, `correct_count`, `error_count`, `last_selected_option`)
 * already sitting in each row, unused.
 *
 * This is the same rule the backend applies in
 * `apps/api/services/study_queue_service.py`. Keep them in step: the practice
 * screen and the study queue must not disagree about what the student still owes.
 */

/** The metrics every question row carries, whatever bank it came from. */
export interface PracticeCandidate {
  id: number;
  correct_option: string;
  attempt_count: number;
  correct_count: number;
  error_count: number;
  last_selected_option: string | null;
  last_answered_at: string | null;
}

/** Answered right this many times, last answer included, and it retires. */
export const MASTERY_CORRECT_COUNT = 2;

export function isMastered(question: PracticeCandidate): boolean {
  if (question.correct_count < MASTERY_CORRECT_COUNT) return false;
  // Right twice and then missed is not mastered: the last answer is the one
  // that says what the student knows today.
  if (question.last_selected_option === null) return true;
  return question.last_selected_option === question.correct_option;
}

/** 0 never seen · 1 missed last time · 2 seen but not mastered · 3 mastered. */
export function practiceRank(question: PracticeCandidate): number {
  if (question.attempt_count <= 0) return 0;
  if (question.last_selected_option !== null && question.last_selected_option !== question.correct_option) {
    return 1;
  }
  return isMastered(question) ? 3 : 2;
}

function answeredAt(question: PracticeCandidate): number {
  if (!question.last_answered_at) return 0;
  const parsed = Date.parse(question.last_answered_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Hardest-owed first: never seen, then missed, then merely seen. */
export function sortForPractice<T extends PracticeCandidate>(questions: readonly T[]): T[] {
  return [...questions].sort((left, right) => {
    const byRank = practiceRank(left) - practiceRank(right);
    if (byRank !== 0) return byRank;
    const byErrors = right.error_count - left.error_count;
    if (byErrors !== 0) return byErrors;
    const byAge = answeredAt(left) - answeredAt(right);
    if (byAge !== 0) return byAge;
    return left.id - right.id;
  });
}

export function pendingQuestions<T extends PracticeCandidate>(questions: readonly T[]): T[] {
  return questions.filter((question) => !isMastered(question));
}

/**
 * The list to practise now.
 *
 * With `includeMastered`, nothing is dropped — that is the "refazer todas"
 * escape hatch, for the student who wants the whole topic again.
 */
export function buildPracticeQueue<T extends PracticeCandidate>(
  questions: readonly T[],
  { includeMastered = false }: { includeMastered?: boolean } = {},
): T[] {
  const pool = includeMastered ? [...questions] : pendingQuestions(questions);
  return sortForPractice(pool);
}

/** How many of a topic's questions are still owed — what the panel counts. */
export function countPending(questions: readonly PracticeCandidate[]): number {
  return pendingQuestions(questions).length;
}
