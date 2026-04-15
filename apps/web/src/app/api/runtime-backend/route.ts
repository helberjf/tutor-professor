import { NextResponse } from 'next/server';

import {
  buildMissingRuntimeBackendConfig,
  buildRuntimeBackendConfig,
  normalizeRuntimeBackendBaseUrl,
  type RuntimeBackendConfig,
  type RuntimeBackendSyncPayload,
} from '@/lib/runtime-backend';

const RUNTIME_BACKEND_KV_KEY = 'english-kids-tutor:runtime-backend';

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

  await runKVCommand(['set', RUNTIME_BACKEND_KV_KEY, JSON.stringify(record)], 'POST');
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
    const storedConfig = await getStoredRuntimeBackendConfig();
    return NextResponse.json(storedConfig || buildMissingRuntimeBackendConfig());
  } catch (error) {
    console.error('Runtime backend GET failed:', error);
    return NextResponse.json(buildMissingRuntimeBackendConfig());
  }
}

export async function POST(request: Request) {
  const syncToken = getSyncToken();
  if (!syncToken || !getKVConfig()) {
    return NextResponse.json(
      { detail: 'A sincronizacao global do backend nao esta configurada na Vercel.' },
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
