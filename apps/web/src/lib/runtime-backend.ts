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

export interface GitHubRuntimeBackendConfigOptions {
  owner: string;
  repo: string;
  branch: string;
  branchFilePath: string;
  branchRawUrl: string;
  tagRawUrl: string;
  explicitRawUrl?: string | null;
  token?: string | null;
  fetchImpl?: typeof fetch;
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

export function buildRuntimeBackendHealthCheckWarning(isHealthy: boolean) {
  if (isHealthy) {
    return null;
  }

  return 'Server-side health check failed; backend URL was saved because Cloudflare quick tunnels can be reachable from browsers before Vercel can reach them.';
}

function runtimeBackendConfigFromUnknown(value: unknown): RuntimeBackendConfig | null {
  const parsed = value as Partial<RuntimeBackendConfig> | null;
  const baseUrl = normalizeRuntimeBackendBaseUrl(parsed?.baseUrl || '', { requireHttps: true });
  if (!baseUrl) {
    return null;
  }

  return buildRuntimeBackendConfig(baseUrl, {
    updatedAt: parsed?.updatedAt || null,
    activatedAt: parsed?.activatedAt || null,
    machineName: parsed?.machineName || null,
  });
}

function decodeBase64Json(content: string) {
  const normalized = content.replace(/\s/g, '');
  const decoded = globalThis.atob
    ? globalThis.atob(normalized)
    : Buffer.from(normalized, 'base64').toString('utf8');
  return JSON.parse(decoded) as unknown;
}

async function fetchRuntimeBackendConfigFromJsonUrl(
  rawUrl: string,
  fetchImpl: typeof fetch,
): Promise<RuntimeBackendConfig | null> {
  try {
    const response = await fetchImpl(`${rawUrl}?ts=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }

    return runtimeBackendConfigFromUnknown(await response.json());
  } catch {
    return null;
  }
}

async function fetchRuntimeBackendConfigFromGitHubContentsApi(
  options: GitHubRuntimeBackendConfigOptions,
  fetchImpl: typeof fetch,
): Promise<RuntimeBackendConfig | null> {
  const token = options.token?.trim();

  try {
    const filePath = options.branchFilePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/contents/${filePath}?ref=${encodeURIComponent(options.branch)}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'english-kids-tutor-vercel',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { content?: string; encoding?: string };
    if (data.encoding !== 'base64' || !data.content) {
      return null;
    }

    return runtimeBackendConfigFromUnknown(decodeBase64Json(data.content));
  } catch {
    return null;
  }
}

export async function fetchGitHubRuntimeBackendConfig(
  options: GitHubRuntimeBackendConfigOptions,
): Promise<RuntimeBackendConfig | null> {
  const fetchImpl = options.fetchImpl || fetch;
  const apiConfig = await fetchRuntimeBackendConfigFromGitHubContentsApi(options, fetchImpl);
  if (apiConfig) {
    return apiConfig;
  }

  const branchConfig = await fetchRuntimeBackendConfigFromJsonUrl(options.branchRawUrl, fetchImpl);
  const explicitConfig = options.explicitRawUrl
    ? await fetchRuntimeBackendConfigFromJsonUrl(options.explicitRawUrl, fetchImpl)
    : null;
  const tagConfig = await fetchRuntimeBackendConfigFromJsonUrl(options.tagRawUrl, fetchImpl);
  return chooseFreshestRuntimeBackendConfig(branchConfig, explicitConfig, tagConfig);
}
