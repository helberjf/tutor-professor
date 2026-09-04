import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * When the backend moves from a laptop behind a rotating Cloudflare tunnel to a
 * VPS with a permanent domain, that domain is baked in as NEXT_PUBLIC_API_BASE_URL.
 * It has to outrank the tunnel URL still published in the shared runtime config,
 * otherwise the deployed app keeps calling a tunnel that no longer exists and
 * nothing in the UI explains why.
 *
 * Order asserted here: saved (manual, per device) > env (VPS) > runtime tunnel.
 */

const require = createRequire(import.meta.url);
const ts = require('typescript');

function compileTs(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

const runtimeModule = { exports: {} };
new Function('exports', 'module', compileTs('../src/lib/runtime-backend.ts'))(
  runtimeModule.exports,
  runtimeModule,
);

function createLocalStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const VPS_URL = 'https://api.tutorprofessor.com';
const TUNNEL_URL = 'https://stale-tunnel.trycloudflare.com';
const MANUAL_URL = 'https://manual-override.example.com';

const RUNTIME_BACKEND_KEY = 'english-kids-tutor.runtime-backend';
const SAVED_URL_KEY = 'english-kids-tutor.api-base-url.v2';
const SAVED_AT_KEY = 'english-kids-tutor.api-base-url-saved-at.v2';

/** Loads api-config with a given env and localStorage seed. */
function load({ env = {}, storage = {} } = {}) {
  globalThis.window = {
    localStorage: createLocalStorage(storage),
    dispatchEvent: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  const apiConfigModule = { exports: {} };
  new Function('exports', 'module', 'require', 'process', compileTs('../src/lib/api-config.ts'))(
    apiConfigModule.exports,
    apiConfigModule,
    (id) => (id === '@/lib/runtime-backend' ? runtimeModule.exports : {}),
    { env: { NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: '', ...env } },
  );
  return apiConfigModule.exports;
}

const publishedTunnel = JSON.stringify({
  baseUrl: TUNNEL_URL,
  host: 'stale-tunnel.trycloudflare.com',
  updatedAt: '2026-07-14T08:26:23.954Z',
  activatedAt: '2026-07-14T08:26:23.954Z',
  machineName: 'HELBER',
});

// 1. VPS domain configured, stale tunnel still published → the VPS wins.
{
  const { getApiBaseUrl, getApiConnectionDetails } = load({
    env: { NEXT_PUBLIC_API_BASE_URL: VPS_URL },
    storage: { [RUNTIME_BACKEND_KEY]: publishedTunnel },
  });
  assert.equal(
    getApiBaseUrl(),
    VPS_URL,
    'a configured backend domain must beat the tunnel URL left over from the laptop setup',
  );
  assert.equal(getApiConnectionDetails().source, 'default', 'the source should report the configured domain');
}

// 2. No VPS domain configured → the published tunnel still works as before.
{
  const { getApiBaseUrl, getApiConnectionDetails } = load({
    storage: { [RUNTIME_BACKEND_KEY]: publishedTunnel },
  });
  assert.equal(getApiBaseUrl(), TUNNEL_URL, 'the tunnel setup must keep working when no domain is configured');
  assert.equal(getApiConnectionDetails().source, 'global');
}

// 3. A manual per-device override still wins over everything.
{
  const { getApiBaseUrl, getApiConnectionDetails } = load({
    env: { NEXT_PUBLIC_API_BASE_URL: VPS_URL },
    storage: {
      [RUNTIME_BACKEND_KEY]: publishedTunnel,
      [SAVED_URL_KEY]: MANUAL_URL,
      [SAVED_AT_KEY]: '2026-07-14T09:00:00.000Z',
    },
  });
  assert.equal(getApiBaseUrl(), MANUAL_URL, 'a manually saved URL is an escape hatch and must stay on top');
  assert.equal(getApiConnectionDetails().source, 'saved');
}

// 4. Nothing configured anywhere → still reported as missing, not guessed.
{
  const { getApiBaseUrl, getApiConnectionDetails } = load();
  assert.equal(getApiBaseUrl(), null, 'production with nothing configured must not invent a backend');
  assert.equal(getApiConnectionDetails().source, 'missing');
}

console.log('API base URL precedence checks passed.');
