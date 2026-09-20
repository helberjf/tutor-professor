const ACTIVE_CHILD_ID_STORAGE_KEY = 'english-kids-tutor.active-child-id';
// Holds the id the person picked on screen, as opposed to one this device
// happens to have lying around. See choosePreferredActiveChildId.
const ACTIVE_CHILD_EXPLICIT_STORAGE_KEY = 'english-kids-tutor.active-child-id.explicit';
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

/**
 * Remember which student the app is acting as.
 *
 * Pass `{ explicit: true }` when this came from somebody choosing on screen —
 * picking a card, creating a student. That choice is then protected from the
 * "who has studied most" guess that runs on every request.
 */
export function saveActiveChildId(childId: number, options: { explicit?: boolean } = {}) {
  if (!isBrowser() || !Number.isFinite(childId) || childId <= 0) {
    return;
  }

  window.localStorage.setItem(ACTIVE_CHILD_ID_STORAGE_KEY, String(childId));
  if (options.explicit) {
    window.localStorage.setItem(ACTIVE_CHILD_EXPLICIT_STORAGE_KEY, String(childId));
  }
  window.dispatchEvent(new Event(ACTIVE_CHILD_CHANGE_EVENT));
}

/** Whether the stored student is the one somebody actually picked. */
export function isStoredActiveChildExplicit() {
  if (!isBrowser()) {
    return false;
  }

  const stored = window.localStorage.getItem(ACTIVE_CHILD_ID_STORAGE_KEY) || '';
  const explicit = window.localStorage.getItem(ACTIVE_CHILD_EXPLICIT_STORAGE_KEY) || '';
  return Boolean(stored) && stored === explicit;
}

export function clearActiveChildId() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(ACTIVE_CHILD_ID_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_CHILD_EXPLICIT_STORAGE_KEY);
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

/**
 * Which student the app should be acting as.
 *
 * Two different situations share this one slot, and telling them apart is the
 * whole job:
 *
 * * an id this device merely *has* — left by an older session, or restored
 *   data — which may well point at an empty profile while another one holds all
 *   the history. Preferring the profile that has actually been studying is the
 *   right recovery, and that is what this function was written for.
 * * an id somebody just *chose* — tapped a student's card, created a new
 *   student. A new profile scores zero by definition, so the same heuristic
 *   used to throw the choice away on the very next request, and the lesson,
 *   the answers and the day's log all landed on the other student's dashboard.
 *
 * `storedChoiceIsExplicit` separates the two. An explicit choice is final.
 */
export function choosePreferredActiveChildId({
  storedActiveChildId,
  storedChoiceIsExplicit = false,
  children,
  progressSummaries,
  fallbackChildId,
}: {
  storedActiveChildId: number | null;
  storedChoiceIsExplicit?: boolean;
  children: ActiveChildOption[];
  progressSummaries: ActiveChildProgressSummary[];
  fallbackChildId: number | null;
}) {
  const childIds = new Set(children.map((child) => child.id));
  const storedId = storedActiveChildId && childIds.has(storedActiveChildId) ? storedActiveChildId : null;
  if (storedId && storedChoiceIsExplicit) {
    return storedId;
  }

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
