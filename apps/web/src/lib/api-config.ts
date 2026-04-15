import {
  buildMissingRuntimeBackendConfig,
  getRuntimeBackendHost,
  normalizeRuntimeBackendBaseUrl,
  type RuntimeBackendConfig,
} from '@/lib/runtime-backend';

const API_BASE_URL_STORAGE_KEY = 'english-kids-tutor.api-base-url';
const RUNTIME_BACKEND_STORAGE_KEY = 'english-kids-tutor.runtime-backend';
const API_BASE_URL_CHANGE_EVENT = 'english-kids-tutor:api-base-url-change';

export type ApiConnectionSource = 'saved' | 'global' | 'default' | 'development' | 'missing';

export interface ApiConnectionDetails {
  baseUrl: string | null;
  host: string | null;
  source: ApiConnectionSource;
}

let runtimeBackendRequest: Promise<RuntimeBackendConfig> | null = null;
let runtimeBackendHasBeenRefreshed = false;

function isBrowser() {
  return typeof window !== 'undefined';
}

function dispatchApiConnectionChange() {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(API_BASE_URL_CHANGE_EVENT));
}

export function normalizeSavedApiBaseUrl(rawValue: string) {
  return normalizeRuntimeBackendBaseUrl(rawValue, { requireHttps: true });
}

function readStoredRuntimeBackendConfig() {
  if (!isBrowser()) {
    return buildMissingRuntimeBackendConfig();
  }

  try {
    const rawValue = window.localStorage.getItem(RUNTIME_BACKEND_STORAGE_KEY) || '';
    if (!rawValue) {
      return buildMissingRuntimeBackendConfig();
    }

    const parsed = JSON.parse(rawValue) as RuntimeBackendConfig;
    const baseUrl = normalizeRuntimeBackendBaseUrl(parsed.baseUrl || '', { requireHttps: true });
    if (!baseUrl) {
      return buildMissingRuntimeBackendConfig();
    }

    return {
      baseUrl,
      host: getRuntimeBackendHost(baseUrl),
      updatedAt: parsed.updatedAt || null,
      source: 'global' as const,
      activatedAt: parsed.activatedAt || null,
      machineName: parsed.machineName || null,
    };
  } catch {
    return buildMissingRuntimeBackendConfig();
  }
}

function writeStoredRuntimeBackendConfig(config: RuntimeBackendConfig) {
  if (!isBrowser()) {
    return;
  }

  if (!config.baseUrl) {
    window.localStorage.removeItem(RUNTIME_BACKEND_STORAGE_KEY);
    dispatchApiConnectionChange();
    return;
  }

  window.localStorage.setItem(RUNTIME_BACKEND_STORAGE_KEY, JSON.stringify(config));
  dispatchApiConnectionChange();
}

export function getStoredApiBaseUrl() {
  if (!isBrowser()) {
    return null;
  }

  return normalizeSavedApiBaseUrl(window.localStorage.getItem(API_BASE_URL_STORAGE_KEY) || '');
}

export function getDefaultApiBaseUrl() {
  const envUrl = normalizeRuntimeBackendBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL || '', {
    requireHttps: false,
  });
  if (envUrl) {
    return envUrl;
  }

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8001';
  }

  return null;
}

export function getApiBaseUrl() {
  return getStoredApiBaseUrl() || readStoredRuntimeBackendConfig().baseUrl || getDefaultApiBaseUrl();
}

async function requestRuntimeBackendConfig() {
  if (!isBrowser()) {
    return buildMissingRuntimeBackendConfig();
  }

  if (runtimeBackendRequest) {
    return runtimeBackendRequest;
  }

  runtimeBackendRequest = fetch('/api/runtime-backend', {
    method: 'GET',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Runtime backend config request failed with ${response.status}.`);
      }

      const payload = (await response.json()) as RuntimeBackendConfig;
      const baseUrl = normalizeRuntimeBackendBaseUrl(payload.baseUrl || '', { requireHttps: true });
      if (!baseUrl) {
        return buildMissingRuntimeBackendConfig();
      }

      return {
        baseUrl,
        host: getRuntimeBackendHost(baseUrl),
        updatedAt: payload.updatedAt || null,
        source: 'global' as const,
        activatedAt: payload.activatedAt || null,
        machineName: payload.machineName || null,
      };
    })
    .catch((error) => {
      console.error('Runtime backend config fetch failed:', error);
      return readStoredRuntimeBackendConfig();
    })
    .finally(() => {
      runtimeBackendRequest = null;
    });

  return runtimeBackendRequest;
}

export async function refreshRuntimeBackendConfig() {
  const config = await requestRuntimeBackendConfig();
  runtimeBackendHasBeenRefreshed = true;
  writeStoredRuntimeBackendConfig(config);
  return config;
}

export async function resolveApiBaseUrl() {
  const savedUrl = getStoredApiBaseUrl();
  if (savedUrl) {
    return savedUrl;
  }

  if (isBrowser()) {
    const storedRuntimeConfig = readStoredRuntimeBackendConfig();
    if (runtimeBackendHasBeenRefreshed) {
      return storedRuntimeConfig.baseUrl || getDefaultApiBaseUrl();
    }

    const runtimeConfig = await refreshRuntimeBackendConfig();
    if (runtimeConfig.baseUrl) {
      return runtimeConfig.baseUrl;
    }
  }

  return getDefaultApiBaseUrl();
}

export function getApiConnectionDetails(): ApiConnectionDetails {
  const savedUrl = getStoredApiBaseUrl();
  if (savedUrl) {
    return {
      baseUrl: savedUrl,
      host: getRuntimeBackendHost(savedUrl),
      source: 'saved',
    };
  }

  const runtimeConfig = readStoredRuntimeBackendConfig();
  if (runtimeConfig.baseUrl) {
    return {
      baseUrl: runtimeConfig.baseUrl,
      host: runtimeConfig.host,
      source: 'global',
    };
  }

  const defaultUrl = getDefaultApiBaseUrl();
  if (defaultUrl) {
    return {
      baseUrl: defaultUrl,
      host: getRuntimeBackendHost(defaultUrl),
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
      message: 'Use a URL HTTPS completa do comando `cloudflared tunnel --url http://127.0.0.1:8001`.',
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
        message: `O backend respondeu com ${response.status}. Verifique se o tunnel aponta para http://127.0.0.1:8001.`,
      };
    }

    return {
      ok: true as const,
      baseUrl,
    };
  } catch {
    return {
      ok: false as const,
      message: 'Nao conseguimos acessar /health nessa URL. Inicie o backend, rode o tunnel de novo e cole a nova URL HTTPS.',
    };
  }
}

export function saveApiBaseUrl(baseUrl: string) {
  const normalized = normalizeSavedApiBaseUrl(baseUrl);
  if (!normalized || !isBrowser()) {
    return;
  }

  window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
  dispatchApiConnectionChange();
}

export function clearSavedApiBaseUrl() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  dispatchApiConnectionChange();
}

export function subscribeToApiBaseUrlChange(callback: () => void) {
  if (!isBrowser()) {
    return () => undefined;
  }

  const notify = () => callback();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === API_BASE_URL_STORAGE_KEY || event.key === RUNTIME_BACKEND_STORAGE_KEY) {
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
