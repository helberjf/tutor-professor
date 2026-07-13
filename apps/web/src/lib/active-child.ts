const ACTIVE_CHILD_ID_STORAGE_KEY = 'english-kids-tutor.active-child-id';
const ACTIVE_CHILD_CHANGE_EVENT = 'english-kids-tutor:active-child-id';

interface ActiveChildOption {
  id: number;
}

interface ActiveChildProgressSummary {
  child: ActiveChildOption;
  progress: {
    themes_completed?: number;
    vocabulary_learned?: number;
    streak_count?: number;
    last_activity?: string | null;
    difficult_words?: string[];
  };
}

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getStoredActiveChildId() {
  if (!isBrowser()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(ACTIVE_CHILD_ID_STORAGE_KEY) || '';
  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

export function saveActiveChildId(childId: number) {
  if (!isBrowser() || !Number.isFinite(childId) || childId <= 0) {
    return;
  }

  window.localStorage.setItem(ACTIVE_CHILD_ID_STORAGE_KEY, String(childId));
  window.dispatchEvent(new Event(ACTIVE_CHILD_CHANGE_EVENT));
}

export function clearActiveChildId() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(ACTIVE_CHILD_ID_STORAGE_KEY);
  window.dispatchEvent(new Event(ACTIVE_CHILD_CHANGE_EVENT));
}

export function subscribeToActiveChildIdChange(callback: () => void) {
  if (!isBrowser()) {
    return () => undefined;
  }

  const notify = () => callback();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_CHILD_ID_STORAGE_KEY) {
      notify();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(ACTIVE_CHILD_CHANGE_EVENT, notify);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(ACTIVE_CHILD_CHANGE_EVENT, notify);
  };
}

function childProgressScore(summary: ActiveChildProgressSummary | undefined) {
  if (!summary) {
    return 0;
  }

  const progress = summary.progress;
  return (
    (progress.themes_completed ?? 0) * 100 +
    (progress.vocabulary_learned ?? 0) * 10 +
    (progress.streak_count ?? 0) +
    (progress.difficult_words?.length ?? 0) +
    (progress.last_activity ? 1 : 0)
  );
}

export function choosePreferredActiveChildId({
  storedActiveChildId,
  children,
  progressSummaries,
  fallbackChildId,
}: {
  storedActiveChildId: number | null;
  children: ActiveChildOption[];
  progressSummaries: ActiveChildProgressSummary[];
  fallbackChildId: number | null;
}) {
  const childIds = new Set(children.map((child) => child.id));
  const storedId = storedActiveChildId && childIds.has(storedActiveChildId) ? storedActiveChildId : null;
  const fallbackId = fallbackChildId && childIds.has(fallbackChildId) ? fallbackChildId : null;
  const progressByChildId = new Map(progressSummaries.map((summary) => [summary.child.id, summary]));
  const bestProgressChild = progressSummaries
    .filter((summary) => childIds.has(summary.child.id))
    .reduce<ActiveChildProgressSummary | null>((best, summary) => {
      if (!best) {
        return summary;
      }
      return childProgressScore(summary) > childProgressScore(best) ? summary : best;
    }, null);

  const bestProgressScore = childProgressScore(bestProgressChild ?? undefined);
  if (bestProgressChild && bestProgressScore > childProgressScore(progressByChildId.get(storedId ?? 0))) {
    return bestProgressChild.child.id;
  }

  return storedId ?? fallbackId ?? children[0]?.id ?? null;
}
