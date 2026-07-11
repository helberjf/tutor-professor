export function resolveItemsByIds<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return ids
    .map((id) => itemsById.get(id))
    .filter((item): item is T => item !== undefined);
}

export function findItemIndexById<T extends { id: string }>(items: readonly T[], itemId: string): number {
  return items.findIndex((item) => item.id === itemId);
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

export function clearDraftForRemovedSubject<T extends { subjectId: string }>(
  draft: T | null,
  removedSubjectId: string,
): T | null {
  return draft?.subjectId === removedSubjectId ? null : draft;
}
