import { NextResponse } from 'next/server';

import {
  buildMissingRuntimeBackendConfig,
  buildRuntimeBackendConfig,
  buildRuntimeBackendHealthCheckWarning,
  chooseFreshestRuntimeBackendConfig,
  fetchGitHubRuntimeBackendConfig,
  normalizeRuntimeBackendBaseUrl,
  type RuntimeBackendConfig,
  type RuntimeBackendSyncPayload,
} from '@/lib/runtime-backend';

const RUNTIME_BACKEND_KV_KEY = 'english-kids-tutor:runtime-backend';
const RUNTIME_BACKEND_GITHUB_STATE_TAG = 'runtime-backend-state';
const RUNTIME_BACKEND_GITHUB_STATE_PATH = 'runtime/runtime-backend.json';
const RUNTIME_BACKEND_GITHUB_BRANCH = 'runtime-state';
const RUNTIME_BACKEND_GITHUB_BRANCH_FILE = 'runtime-backend.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getGitHubRepoInfo() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim() || 'helberjf';
  const repo = process.env.VERCEL_GIT_REPO_SLUG?.trim() || 'tutor-professor';
  return { owner, repo };
}

function getGitHubRuntimeBackendStateUrl() {
  const explicitUrl = process.env.RUNTIME_BACKEND_STATE_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const { owner, repo } = getGitHubRepoInfo();
  return `https://raw.githubusercontent.com/${owner}/${repo}/${RUNTIME_BACKEND_GITHUB_STATE_TAG}/${RUNTIME_BACKEND_GITHUB_STATE_PATH}`;
}

function getGitHubBranchStateUrl() {
  const { owner, repo } = getGitHubRepoInfo();
  return `https://raw.githubusercontent.com/${owner}/${repo}/${RUNTIME_BACKEND_GITHUB_BRANCH}/${RUNTIME_BACKEND_GITHUB_BRANCH_FILE}`;
}

function getKVConfig() {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ''),
    token,
  };
}

function getSyncToken() {
  return process.env.VERCEL_BACKEND_SYNC_TOKEN?.trim() || '';
}

function getGitHubToken() {
  return process.env.GITHUB_TOKEN?.trim() || '';
}

async function runKVCommand(command: string[], method: 'GET' | 'POST' = 'GET') {
  const kvConfig = getKVConfig();
  if (!kvConfig) {
    return null;
  }

  const endpoint = `${kvConfig.url}/${command.map((segment) => encodeURIComponent(segment)).join('/')}`;
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${kvConfig.token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`KV command failed with ${response.status}.`);
  }

  return (await response.json()) as { result?: unknown };
}

async function getStoredRuntimeBackendConfig(): Promise<RuntimeBackendConfig | null> {
  if (!getKVConfig()) {
    return null;
  }

  const response = await runKVCommand(['get', RUNTIME_BACKEND_KV_KEY], 'GET');
  const rawResult = typeof response?.result === 'string' ? response.result : '';
  if (!rawResult) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawResult) as RuntimeBackendConfig;
    const baseUrl = normalizeRuntimeBackendBaseUrl(parsed.baseUrl || '', { requireHttps: true });
    if (!baseUrl) {
      return null;
    }

    return buildRuntimeBackendConfig(baseUrl, {
      updatedAt: parsed.updatedAt || null,
      activatedAt: parsed.activatedAt || null,
      machineName: parsed.machineName || null,
    });
  } catch {
    return null;
  }
}

async function getGitHubRuntimeBackendConfig(): Promise<RuntimeBackendConfig | null> {
  const { owner, repo } = getGitHubRepoInfo();
  return fetchGitHubRuntimeBackendConfig({
    owner,
    repo,
    branch: RUNTIME_BACKEND_GITHUB_BRANCH,
    branchFilePath: RUNTIME_BACKEND_GITHUB_BRANCH_FILE,
    branchRawUrl: getGitHubBranchStateUrl(),
    tagRawUrl: getGitHubRuntimeBackendStateUrl(),
    explicitRawUrl: process.env.RUNTIME_BACKEND_STATE_URL?.trim() || null,
    token: getGitHubToken(),
  });
}

async function saveRuntimeBackendConfigViaKV(record: RuntimeBackendConfig) {
  await runKVCommand(['set', RUNTIME_BACKEND_KV_KEY, JSON.stringify(record)], 'POST');
}

async function saveRuntimeBackendConfigViaGitHub(record: RuntimeBackendConfig) {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('GITHUB_TOKEN nao configurado na Vercel.');
  }

  const { owner, repo } = getGitHubRepoInfo();
  const branch = RUNTIME_BACKEND_GITHUB_BRANCH;
  const filePath = RUNTIME_BACKEND_GITHUB_BRANCH_FILE;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'english-kids-tutor-vercel',
  };

  async function fetchCurrentFileSha() {
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, {
      headers,
      cache: 'no-store',
    });

    if (getRes.ok) {
      const data = (await getRes.json()) as { sha: string };
      return { sha: data.sha, branchExists: true };
    }

    if (getRes.status === 404) {
      const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`, {
        headers,
        cache: 'no-store',
      });

      if (!branchRes.ok) {
        const mainRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, {
          headers,
          cache: 'no-store',
        });

        if (!mainRes.ok) {
          throw new Error('Nao foi possivel obter o SHA do branch main para criar o runtime-state.');
        }

        const mainData = (await mainRes.json()) as { object: { sha: string } };
        const createBranchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: mainData.object.sha,
          }),
        });

        if (!createBranchRes.ok) {
          const errText = await createBranchRes.text();
          throw new Error(`Nao foi possivel criar o branch ${branch}: ${createBranchRes.status} ${errText}`);
        }
      }

      return { sha: undefined, branchExists: false };
    }

    throw new Error(`GitHub API GET falhou com status ${getRes.status}.`);
  }

  const content = Buffer.from(JSON.stringify(record, null, 2)).toString('base64');

  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha } = await fetchCurrentFileSha();
    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Update runtime backend state',
        content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (putRes.ok) {
      return;
    }

    const errText = await putRes.text();
    if (attempt === 0 && (putRes.status === 409 || putRes.status === 422)) {
      continue;
    }

    throw new Error(`GitHub API PUT falhou com status ${putRes.status}: ${errText}`);
  }
}

async function saveRuntimeBackendConfig(payload: RuntimeBackendSyncPayload) {
  const baseUrl = normalizeRuntimeBackendBaseUrl(payload.baseUrl, { requireHttps: true });
  if (!baseUrl) {
    throw new Error('Use uma URL HTTPS valida para o backend.');
  }

  const record = buildRuntimeBackendConfig(baseUrl, {
    updatedAt: new Date().toISOString(),
    activatedAt: payload.activatedAt || null,
    machineName: payload.machineName || null,
  });

  if (getKVConfig()) {
    await saveRuntimeBackendConfigViaKV(record);
  } else if (getGitHubToken()) {
    await saveRuntimeBackendConfigViaGitHub(record);
  } else {
    throw new Error('Nenhum metodo de armazenamento configurado (KV ou GITHUB_TOKEN).');
  }

  return record;
}

async function verifyBackendHealth(baseUrl: string) {
  // Orçamento total: ~45s (bem abaixo do limite de 60s do Vercel Hobby)
  // 5 tentativas × (5s timeout + 4s delay) - 4s final = 45s pior caso
  const maxAttempts = 5;
  const timeoutMs = 5000;
  const delayMs = 4000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return true;
    } catch {
      // DNS ainda propagando ou conexao recusada — tenta novamente
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return false;
}

export async function GET() {
  try {
    const [storedConfig, githubConfig] = await Promise.all([
      getStoredRuntimeBackendConfig(),
      getGitHubRuntimeBackendConfig(),
    ]);
    const runtimeConfig = chooseFreshestRuntimeBackendConfig(storedConfig, githubConfig);
    return NextResponse.json(runtimeConfig || buildMissingRuntimeBackendConfig(), {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Runtime backend GET failed:', error);
    return NextResponse.json(buildMissingRuntimeBackendConfig(), {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }
}

export async function POST(request: Request) {
  const syncToken = getSyncToken();
  if (!syncToken) {
    return NextResponse.json(
      { detail: 'VERCEL_BACKEND_SYNC_TOKEN nao esta configurado na Vercel.' },
      { status: 503 },
    );
  }

  const hasStorage = getKVConfig() || getGitHubToken();
  if (!hasStorage) {
    return NextResponse.json(
      { detail: 'Nenhum metodo de armazenamento configurado na Vercel (KV_REST_API_URL/TOKEN ou GITHUB_TOKEN).' },
      { status: 503 },
    );
  }

  const authorization = request.headers.get('authorization') || '';
  if (authorization !== `Bearer ${syncToken}`) {
    return NextResponse.json({ detail: 'Nao autorizado.' }, { status: 401 });
  }

  let payload: RuntimeBackendSyncPayload;
  try {
    payload = (await request.json()) as RuntimeBackendSyncPayload;
  } catch {
    return NextResponse.json({ detail: 'JSON invalido.' }, { status: 400 });
  }

  const baseUrl = normalizeRuntimeBackendBaseUrl(payload.baseUrl || '', { requireHttps: true });
  if (!baseUrl) {
    return NextResponse.json(
      { detail: 'Use uma URL HTTPS valida para o backend.' },
      { status: 400 },
    );
  }

  const healthWarning = buildRuntimeBackendHealthCheckWarning(await verifyBackendHealth(baseUrl));
  if (healthWarning) {
    console.warn(`Runtime backend health check warning for ${baseUrl}: ${healthWarning}`);
  }

  try {
    const record = await saveRuntimeBackendConfig({
      ...payload,
      baseUrl,
    });
    return NextResponse.json(healthWarning ? { ...record, warning: healthWarning } : record);
  } catch (error) {
    console.error('Runtime backend POST failed:', error);
    return NextResponse.json(
      { detail: 'Nao foi possivel gravar a URL global do backend.' },
      { status: 500 },
    );
  }
}
