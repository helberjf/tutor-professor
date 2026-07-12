export class IncompleteLessonQuestionBatchError extends Error {
  constructor(message = 'The lesson-question response was incomplete or did not match the active lesson.') {
    super(message);
    this.name = 'IncompleteLessonQuestionBatchError';
  }
}

export function isUncertainLessonQuestionGenerationError(error: unknown): boolean {
  if (error instanceof IncompleteLessonQuestionBatchError || error instanceof TypeError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const apiError = error as Error & { code?: unknown; status?: unknown };
  return apiError.code === 'offline'
    || apiError.code === 'parse'
    || (typeof apiError.status === 'number' && apiError.status >= 500);
}

export function validateConfirmedLessonQuestionBatch<
  TQuestion extends { id: number; lesson_id: number },
>(questions: readonly TQuestion[], lessonId: number): readonly TQuestion[] {
  if (questions.length !== 5) {
    throw new IncompleteLessonQuestionBatchError();
  }

  const ids = new Set<number>();
  for (const question of questions) {
    if (
      !Number.isInteger(question.id)
      || question.id <= 0
      || question.lesson_id !== lessonId
      || ids.has(question.id)
    ) {
      throw new IncompleteLessonQuestionBatchError();
    }
    ids.add(question.id);
  }

  return questions;
}

export function mergeLessonQuestionsById<TQuestion extends { id: number }>(
  existing: readonly TQuestion[],
  generated: readonly TQuestion[],
): TQuestion[] {
  const seenIds = new Set(existing.map((question) => question.id));
  const freshQuestions = generated.filter((question) => {
    if (seenIds.has(question.id)) return false;
    seenIds.add(question.id);
    return true;
  });
  return freshQuestions.length > 0 ? [...existing, ...freshQuestions] : [...existing];
}
