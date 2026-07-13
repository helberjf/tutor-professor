export type RuntimeBackendSource = 'global' | 'missing';

export interface RuntimeBackendConfig {
  baseUrl: string | null;
  host: string | null;
  updatedAt: string | null;
  source: RuntimeBackendSource;
  activatedAt?: string | null;
  machineName?: string | null;
}

export interface RuntimeBackendSyncPayload {
  baseUrl: string;
  activatedAt?: string | null;
  machineName?: string | null;
}

export function normalizeRuntimeBackendBaseUrl(
  rawValue: string,
  options: { requireHttps?: boolean } = {},
) {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    if (options.requireHttps && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    url.search = '';

    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getRuntimeBackendHost(baseUrl: string | null) {
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function buildMissingRuntimeBackendConfig(): RuntimeBackendConfig {
  return {
    baseUrl: null,
    host: null,
    updatedAt: null,
    source: 'missing',
    activatedAt: null,
    machineName: null,
  };
}

export function buildRuntimeBackendConfig(
  baseUrl: string,
  options: {
    updatedAt?: string | null;
    activatedAt?: string | null;
    machineName?: string | null;
  } = {},
): RuntimeBackendConfig {
  return {
    baseUrl,
    host: getRuntimeBackendHost(baseUrl),
    updatedAt: options.updatedAt ?? null,
    source: 'global',
    activatedAt: options.activatedAt ?? null,
    machineName: options.machineName ?? null,
  };
}

function runtimeBackendUpdatedAtMs(config: RuntimeBackendConfig | null) {
  const timestamp = Date.parse(config?.updatedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function chooseFreshestRuntimeBackendConfig(
  ...configs: Array<RuntimeBackendConfig | null>
) {
  return configs.reduce<RuntimeBackendConfig | null>((freshest, config) => {
    if (!config?.baseUrl) {
      return freshest;
    }

    if (!freshest) {
      return config;
    }

    return runtimeBackendUpdatedAtMs(config) > runtimeBackendUpdatedAtMs(freshest)
      ? config
      : freshest;
  }, null);
}
