export function appendGeneratedFlashcards<T>(existing: readonly T[], generated: readonly T[]): T[] {
  return [...existing, ...generated];
}

export function syncTopicFlashcardCount<T extends { flashcard_count: number }>(topic: T, count: number): T {
  if (topic.flashcard_count === count) return topic;
  return { ...topic, flashcard_count: count };
}
