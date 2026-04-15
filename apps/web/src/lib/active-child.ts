const ACTIVE_CHILD_ID_STORAGE_KEY = 'english-kids-tutor.active-child-id';
const ACTIVE_CHILD_CHANGE_EVENT = 'english-kids-tutor:active-child-id';

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
