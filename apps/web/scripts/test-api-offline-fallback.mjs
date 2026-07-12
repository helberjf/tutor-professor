import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const apiUrl = new URL('../src/lib/api.ts', import.meta.url);
const apiSource = readFileSync(apiUrl, 'utf8');

const compiledApi = ts.transpileModule(apiSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

function loadApiModule(apiConfig) {
  const apiModule = { exports: {} };
  new Function('exports', 'module', 'require', compiledApi)(
    apiModule.exports,
    apiModule,
    (id) => {
      if (id === '@/lib/api-config') return apiConfig;
      if (id === '@/lib/active-child') return { getStoredActiveChildId: () => null };
      return {};
    },
  );
  return apiModule.exports;
}

{
  const calls = [];
  let clearedSavedUrl = false;
  const { fetchAPI } = loadApiModule({
    clearSavedApiBaseUrl: () => { clearedSavedUrl = true; },
    getApiBaseUrl: () => 'https://fresh.example',
    resolveApiBaseUrl: async () => 'https://stale.example',
    resolveApiBaseUrlAfterOfflineFailure: async (failedBaseUrl) => {
      assert.equal(failedBaseUrl, 'https://stale.example');
      return 'https://fresh.example';
    },
  });

  globalThis.fetch = async (url) => {
    calls.push(url);
    if (calls.length === 1) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await fetchAPI('/health');
  assert.deepEqual(result, { status: 'ok' });
  assert.deepEqual(
    calls,
    ['https://stale.example/health', 'https://fresh.example/health'],
    'safe requests retry once with the refreshed global backend URL',
  );
  assert.equal(clearedSavedUrl, true, 'a successful fallback clears the stale saved backend URL');
}

{
  const calls = [];
  const { fetchAPI, ApiError } = loadApiModule({
    clearSavedApiBaseUrl: () => {},
    getApiBaseUrl: () => 'https://fresh.example',
    resolveApiBaseUrl: async () => 'https://stale.example',
    resolveApiBaseUrlAfterOfflineFailure: async () => 'https://fresh.example',
  });

  globalThis.fetch = async (url) => {
    calls.push(url);
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    () => fetchAPI('/api/review/attempt', { method: 'POST', body: '{}' }),
    (error) => error instanceof ApiError && error.isOffline,
    'unsafe requests should still surface the offline error without retrying',
  );
  assert.deepEqual(calls, ['https://stale.example/api/review/attempt']);
}

console.log('API offline fallback checks passed.');
