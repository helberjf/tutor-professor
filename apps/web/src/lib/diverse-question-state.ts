export function resolveItemsByIds<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return ids
    .map((id) => itemsById.get(id))
    .filter((item): item is T => item !== undefined);
}

export function findItemIndexById<T extends { id: string }>(items: readonly T[], itemId: string): number {
  return items.findIndex((item) => item.id === itemId);
}

export function resolveDiverseGenerationTarget<
  TLesson extends { id: string },
  TSubject extends { id: string; lessons?: readonly TLesson[] },
>(
  day: { custom_subjects: readonly TSubject[] },
  subjectId: string,
  lessonId: string,
): { subjectIndex: number; subject: TSubject; lesson: TLesson } | null {
  const subjectIndex = findItemIndexById(day.custom_subjects, subjectId);
  if (subjectIndex < 0) return null;
  const subject = day.custom_subjects[subjectIndex];
  const lesson = subject.lessons?.find((candidate) => candidate.id === lessonId);
  return lesson ? { subjectIndex, subject, lesson } : null;
}

export interface StudyQueueState<TResult> {
  order: number[];
  position: number;
  userAnswer: string;
  revealed: boolean;
  results: TResult[];
  done: boolean;
}

export function reconcileStudyQueueByTopicIds<TResult>(
  state: StudyQueueState<TResult>,
  previousTopicIds: readonly string[],
  nextTopicIds: readonly string[],
): StudyQueueState<TResult> {
  const queuedIds: string[] = [];
  const queuedIdSet = new Set<string>();
  const completedById = new Map<string, TResult>();

  state.order.forEach((topicIndex, queueIndex) => {
    const topicId = previousTopicIds[topicIndex];
    if (!topicId || queuedIdSet.has(topicId)) return;
    queuedIds.push(topicId);
    queuedIdSet.add(topicId);
    if (queueIndex < state.results.length) completedById.set(topicId, state.results[queueIndex]);
  });

  const nextIndexById = new Map<string, number>();
  nextTopicIds.forEach((topicId, index) => {
    if (topicId && !nextIndexById.has(topicId)) nextIndexById.set(topicId, index);
  });

  const survivingQueuedIds = queuedIds.filter((topicId) => nextIndexById.has(topicId));
  const nextQueuedIdSet = new Set(survivingQueuedIds);
  const newIds: string[] = [];
  nextIndexById.forEach((_index, topicId) => {
    if (!nextQueuedIdSet.has(topicId)) {
      nextQueuedIdSet.add(topicId);
      newIds.push(topicId);
    }
  });

  const queueIds = [...survivingQueuedIds, ...newIds];
  const order = queueIds.map((topicId) => nextIndexById.get(topicId)!);
  const results: TResult[] = [];
  for (const topicId of queueIds) {
    if (!completedById.has(topicId)) break;
    results.push(completedById.get(topicId)!);
  }

  if (order.length === 0) {
    return { ...state, order, position: 0, results, userAnswer: '', revealed: false };
  }

  if (state.done && newIds.length > 0) {
    return {
      ...state,
      order,
      position: queueIds.indexOf(newIds[0]),
      results,
      userAnswer: '',
      revealed: false,
      done: false,
    };
  }

  if (state.done) {
    return { ...state, order, position: Math.min(state.position, order.length - 1), results };
  }

  const previousCurrentId = previousTopicIds[state.order[state.position]];
  const currentPosition = previousCurrentId ? queueIds.indexOf(previousCurrentId) : -1;
  if (currentPosition >= 0) {
    return { ...state, order, position: currentPosition, results };
  }

  const done = results.length >= order.length;
  return {
    ...state,
    order,
    position: done ? order.length - 1 : results.length,
    results,
    userAnswer: '',
    revealed: false,
    done,
  };
}

export function updateItemById<T extends { id: string }>(
  items: T[],
  itemId: string,
  updater: (item: T) => T,
): T[] {
  if (!items.some((item) => item.id === itemId)) return items;
  return items.map((item) => item.id === itemId ? updater(item) : item);
}

export function updateSubjectById<T extends { id: string }>(
  subjects: T[],
  subjectId: string,
  updater: (subject: T) => T,
): T[] {
  if (!subjects.some((subject) => subject.id === subjectId)) return subjects;
  return subjects.map((subject) => subject.id === subjectId ? updater(subject) : subject);
}

export function appendTopicToSubjectById<
  TTopic,
  TSubject extends { id: string; topics: TTopic[] },
>(subjects: TSubject[], subjectId: string, topic: TTopic): TSubject[] {
  return updateSubjectById(subjects, subjectId, (subject) => ({
    ...subject,
    topics: [...subject.topics, topic],
  }));
}

export function clearDraftForRemovedSubject<T extends { subjectId: string }>(
  draft: T | null,
  removedSubjectId: string,
): T | null {
  return draft?.subjectId === removedSubjectId ? null : draft;
}
