import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function compileTs(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

const runtimeModule = { exports: {} };
new Function('exports', 'module', compileTs('../src/lib/runtime-backend.ts'))(
  runtimeModule.exports,
  runtimeModule,
);

function createLocalStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function loadApiConfig() {
  const apiConfigModule = { exports: {} };
  new Function('exports', 'module', 'require', 'process', compileTs('../src/lib/api-config.ts'))(
    apiConfigModule.exports,
    apiConfigModule,
    (id) => {
      if (id === '@/lib/runtime-backend') return runtimeModule.exports;
      return {};
    },
    { env: { NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: '' } },
  );
  return apiConfigModule.exports;
}

const savedTunnel = 'https://saved-empty.trycloudflare.com';
const globalTunnel = 'https://global-data.trycloudflare.com';
globalThis.window = {
  localStorage: createLocalStorage(),
  dispatchEvent: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
globalThis.fetch = async (url) => {
  assert.equal(String(url), '/api/runtime-backend');
  return new Response(JSON.stringify({
    baseUrl: globalTunnel,
    host: 'global-data.trycloudflare.com',
    updatedAt: '2026-07-14T08:26:23.954Z',
    source: 'global',
    activatedAt: '2026-07-14T08:26:23.954Z',
    machineName: 'HELBER',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

window.localStorage.setItem('english-kids-tutor.api-base-url', savedTunnel);
window.localStorage.setItem('english-kids-tutor.api-base-url-saved-at', '2026-07-14T09:00:00.000Z');

const { getApiConnectionDetails, resolveApiBaseUrl } = loadApiConfig();

assert.equal(
  await resolveApiBaseUrl(),
  savedTunnel,
  'saved quick-tunnel URL should override the published global runtime backend on this device',
);
assert.deepEqual(
  getApiConnectionDetails(),
  {
    baseUrl: savedTunnel,
    host: 'saved-empty.trycloudflare.com',
    source: 'saved',
  },
  'connection details should report the saved backend when both global and saved URLs exist',
);

console.log('API connection choice checks passed.');
