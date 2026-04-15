import { NextResponse } from 'next/server';

import {
  buildMissingRuntimeBackendConfig,
  buildRuntimeBackendConfig,
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

function getGitHubRepoInfo() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim() || 'helberjf';
  const repo = process.env.VERCEL_GIT_REPO_SLUG?.trim() || 'english-tutor-kid';
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

async function fetchGitHubRawConfig(rawUrl: string): Promise<RuntimeBackendConfig | null> {
  try {
    const response = await fetch(`${rawUrl}?ts=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }

    const parsed = (await response.json()) as RuntimeBackendConfig;
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
  // Try the branch-based URL first (written by the Vercel POST endpoint)
  const branchConfig = await fetchGitHubRawConfig(getGitHubBranchStateUrl());
  if (branchConfig) {
    return branchConfig;
  }

  // Fall back to the tag-based URL (written by the git-push script)
  return fetchGitHubRawConfig(getGitHubRuntimeBackendStateUrl());
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

  // Try to get the current file SHA on the branch
  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
    { headers, cache: 'no-store' },
  );

  let sha: string | undefined;

  if (getRes.ok) {
    const data = (await getRes.json()) as { sha: string };
    sha = data.sha;
  } else if (getRes.status === 404) {
    // Branch or file might not exist — check if the branch exists
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      { headers, cache: 'no-store' },
    );

    if (!branchRes.ok) {
      // Branch does not exist: create it from the default branch HEAD
      const mainRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`,
        { headers, cache: 'no-store' },
      );

      if (!mainRes.ok) {
        throw new Error('Nao foi possivel obter o SHA do branch main para criar o runtime-state.');
      }

      const mainData = (await mainRes.json()) as { object: { sha: string } };
      const createBranchRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: mainData.object.sha,
          }),
        },
      );

      if (!createBranchRes.ok) {
        const errText = await createBranchRes.text();
        throw new Error(`Nao foi possivel criar o branch ${branch}: ${createBranchRes.status} ${errText}`);
      }
    }
    // File doesn't exist on the branch yet — no SHA needed for creation
  } else {
    throw new Error(`GitHub API GET falhou com status ${getRes.status}.`);
  }

  const content = Buffer.from(JSON.stringify(record, null, 2)).toString('base64');
  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Update runtime backend state',
        content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );

  if (!putRes.ok) {
    const errText = await putRes.text();
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
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const storedConfig = (await getStoredRuntimeBackendConfig()) || (await getGitHubRuntimeBackendConfig());
    return NextResponse.json(storedConfig || buildMissingRuntimeBackendConfig(), {
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

  const isHealthy = await verifyBackendHealth(baseUrl);
  if (!isHealthy) {
    return NextResponse.json(
      { detail: 'Nao foi possivel acessar /health nessa URL do backend.' },
      { status: 400 },
    );
  }

  try {
    const record = await saveRuntimeBackendConfig({
      ...payload,
      baseUrl,
    });
    return NextResponse.json(record);
  } catch (error) {
    console.error('Runtime backend POST failed:', error);
    return NextResponse.json(
      { detail: 'Nao foi possivel gravar a URL global do backend.' },
      { status: 500 },
    );
  }
}
