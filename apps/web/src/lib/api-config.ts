const API_BASE_URL_STORAGE_KEY = 'english-kids-tutor.api-base-url';
const API_BASE_URL_CHANGE_EVENT = 'english-kids-tutor:api-base-url-change';

export type ApiConnectionSource = 'saved' | 'default' | 'development' | 'missing';

export interface ApiConnectionDetails {
  baseUrl: string | null;
  host: string | null;
  source: ApiConnectionSource;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function normalizeUrl(rawValue: string, options?: { requireHttps?: boolean }): string | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    if (options?.requireHttps && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    url.search = '';

    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getHost(baseUrl: string | null) {
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function normalizeSavedApiBaseUrl(rawValue: string) {
  return normalizeUrl(rawValue, { requireHttps: true });
}

export function getStoredApiBaseUrl() {
  if (!isBrowser()) {
    return null;
  }

  return normalizeSavedApiBaseUrl(window.localStorage.getItem(API_BASE_URL_STORAGE_KEY) || '');
}

export function getDefaultApiBaseUrl() {
  const envUrl = normalizeUrl(process.env.NEXT_PUBLIC_API_BASE_URL || '');
  if (envUrl) {
    return envUrl;
  }

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8001';
  }

  return null;
}

export function getApiBaseUrl() {
  return getStoredApiBaseUrl() || getDefaultApiBaseUrl();
}

export function getApiConnectionDetails(): ApiConnectionDetails {
  const savedUrl = getStoredApiBaseUrl();
  if (savedUrl) {
    return {
      baseUrl: savedUrl,
      host: getHost(savedUrl),
      source: 'saved',
    };
  }

  const defaultUrl = getDefaultApiBaseUrl();
  if (defaultUrl) {
    return {
      baseUrl: defaultUrl,
      host: getHost(defaultUrl),
      source: process.env.NEXT_PUBLIC_API_BASE_URL ? 'default' : 'development',
    };
  }

  return {
    baseUrl: null,
    host: null,
    source: 'missing',
  };
}

export async function verifySavedApiBaseUrl(rawValue: string) {
  const baseUrl = normalizeSavedApiBaseUrl(rawValue);
  if (!baseUrl) {
    return {
      ok: false as const,
      message: 'Use the full HTTPS URL from `cloudflared tunnel --url http://localhost:8001`.',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        ok: false as const,
        message: `The backend answered with ${response.status}. Check that the tunnel points to http://localhost:8001.`,
      };
    }

    return {
      ok: true as const,
      baseUrl,
    };
  } catch {
    return {
      ok: false as const,
      message: 'We could not reach /health at that URL. Start the backend, run the tunnel again, and paste the new HTTPS URL.',
    };
  }
}

export function saveApiBaseUrl(baseUrl: string) {
  const normalized = normalizeSavedApiBaseUrl(baseUrl);
  if (!normalized || !isBrowser()) {
    return;
  }

  window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
  window.dispatchEvent(new Event(API_BASE_URL_CHANGE_EVENT));
}

export function clearSavedApiBaseUrl() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  window.dispatchEvent(new Event(API_BASE_URL_CHANGE_EVENT));
}

export function subscribeToApiBaseUrlChange(callback: () => void) {
  if (!isBrowser()) {
    return () => undefined;
  }

  const notify = () => callback();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === API_BASE_URL_STORAGE_KEY) {
      notify();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(API_BASE_URL_CHANGE_EVENT, notify);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(API_BASE_URL_CHANGE_EVENT, notify);
  };
}
