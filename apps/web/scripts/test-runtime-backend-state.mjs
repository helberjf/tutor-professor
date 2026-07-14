import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/lib/runtime-backend.ts', import.meta.url);
const source = readFileSync(helperUrl, 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const {
  buildRuntimeBackendHealthCheckWarning,
  chooseFreshestRuntimeBackendConfig,
  fetchGitHubRuntimeBackendConfig,
} = module.exports;

assert.equal(typeof buildRuntimeBackendHealthCheckWarning, 'function');
assert.equal(typeof chooseFreshestRuntimeBackendConfig, 'function');
assert.equal(typeof fetchGitHubRuntimeBackendConfig, 'function');

const staleKv = {
  baseUrl: 'https://stale.trycloudflare.com',
  host: 'stale.trycloudflare.com',
  updatedAt: '2026-07-12T18:35:09.782Z',
  source: 'global',
  activatedAt: '2026-07-12T18:35:09.799Z',
  machineName: 'HELBER',
};
const freshGitHub = {
  baseUrl: 'https://fresh.trycloudflare.com',
  host: 'fresh.trycloudflare.com',
  updatedAt: '2026-07-13T01:35:56.908Z',
  source: 'global',
  activatedAt: '2026-07-13T01:35:54.076Z',
  machineName: 'HELBER',
};

assert.equal(
  chooseFreshestRuntimeBackendConfig(staleKv, freshGitHub),
  freshGitHub,
  'newer GitHub runtime state must override stale KV state',
);
assert.equal(
  chooseFreshestRuntimeBackendConfig(freshGitHub, staleKv),
  freshGitHub,
  'newest state wins regardless of source order',
);
assert.equal(
  chooseFreshestRuntimeBackendConfig(null, freshGitHub),
  freshGitHub,
  'missing sources are ignored',
);

const encodeBase64 = (value) => Buffer.from(value, 'utf8').toString('base64');
const staleRaw = {
  baseUrl: 'https://stale-raw.trycloudflare.com',
  host: 'stale-raw.trycloudflare.com',
  updatedAt: '2026-07-13T05:08:50.560Z',
  source: 'global',
  activatedAt: '2026-07-13T05:08:49.324Z',
  machineName: 'HELBER',
};
const freshContentsApi = {
  baseUrl: 'https://fresh-api.trycloudflare.com',
  host: 'fresh-api.trycloudflare.com',
  updatedAt: '2026-07-13T05:12:19.072Z',
  source: 'global',
  activatedAt: '2026-07-13T05:12:18.450Z',
  machineName: 'HELBER',
};
const calls = [];
const fakeFetch = async (url) => {
  calls.push(String(url));
  if (String(url).startsWith('https://api.github.com/repos/helberjf/tutor-professor/contents/runtime-backend.json')) {
    return {
      ok: true,
      json: async () => ({
        encoding: 'base64',
        content: encodeBase64(JSON.stringify(freshContentsApi)),
      }),
    };
  }
  return {
    ok: true,
    json: async () => staleRaw,
  };
};

assert.deepEqual(
  await fetchGitHubRuntimeBackendConfig({
    owner: 'helberjf',
    repo: 'tutor-professor',
    branch: 'runtime-state',
    branchFilePath: 'runtime-backend.json',
    branchRawUrl: 'https://raw.githubusercontent.com/helberjf/tutor-professor/runtime-state/runtime-backend.json',
    tagRawUrl: 'https://raw.githubusercontent.com/helberjf/tutor-professor/runtime-backend-state/runtime/runtime-backend.json',
    token: 'github-token',
    fetchImpl: fakeFetch,
  }),
  freshContentsApi,
  'GitHub Contents API state should win over stale raw.githubusercontent.com state',
);
assert.equal(calls.length, 1, 'fresh GitHub Contents API state should avoid raw fallback');

const publicCalls = [];
const fakePublicFetch = async (url, init = {}) => {
  publicCalls.push({ url: String(url), headers: init.headers || {} });
  if (String(url).startsWith('https://api.github.com/repos/helberjf/tutor-professor/contents/runtime-backend.json')) {
    return {
      ok: true,
      json: async () => ({
        encoding: 'base64',
        content: encodeBase64(JSON.stringify(freshContentsApi)),
      }),
    };
  }
  return {
    ok: true,
    json: async () => staleRaw,
  };
};

assert.deepEqual(
  await fetchGitHubRuntimeBackendConfig({
    owner: 'helberjf',
    repo: 'tutor-professor',
    branch: 'runtime-state',
    branchFilePath: 'runtime-backend.json',
    branchRawUrl: 'https://raw.githubusercontent.com/helberjf/tutor-professor/runtime-state/runtime-backend.json',
    tagRawUrl: 'https://raw.githubusercontent.com/helberjf/tutor-professor/runtime-backend-state/runtime/runtime-backend.json',
    token: null,
    fetchImpl: fakePublicFetch,
  }),
  freshContentsApi,
  'public GitHub Contents API state should be used even without a token',
);
assert.equal(publicCalls.length, 1, 'public Contents API state should avoid raw CDN fallback');
assert.equal(
  Object.hasOwn(publicCalls[0].headers, 'Authorization'),
  false,
  'public GitHub Contents API fetch must not send an Authorization header without a token',
);

const staleBranch = {
  baseUrl: 'https://stale-branch.trycloudflare.com',
  host: 'stale-branch.trycloudflare.com',
  updatedAt: '2026-07-14T04:24:56.267Z',
  source: 'global',
};
const freshExplicit = {
  baseUrl: 'https://fresh-explicit.trycloudflare.com',
  host: 'fresh-explicit.trycloudflare.com',
  updatedAt: '2026-07-14T04:51:17.288Z',
  source: 'global',
  activatedAt: null,
  machineName: null,
};
const explicitCalls = [];
const fakeExplicitFetch = async (url) => {
  explicitCalls.push(String(url));
  if (String(url).startsWith('https://raw.githubusercontent.com/explicit/runtime-backend.json')) {
    return { ok: true, json: async () => freshExplicit };
  }
  return { ok: true, json: async () => staleBranch };
};

assert.deepEqual(
  await fetchGitHubRuntimeBackendConfig({
    owner: 'wrong-owner',
    repo: 'wrong-repo',
    branch: 'runtime-state',
    branchFilePath: 'runtime-backend.json',
    branchRawUrl: 'https://raw.githubusercontent.com/wrong-owner/wrong-repo/runtime-state/runtime-backend.json',
    tagRawUrl: 'https://raw.githubusercontent.com/wrong-owner/wrong-repo/runtime-backend-state/runtime/runtime-backend.json',
    explicitRawUrl: 'https://raw.githubusercontent.com/explicit/runtime-backend.json',
    token: null,
    fetchImpl: fakeExplicitFetch,
  }),
  freshExplicit,
  'explicit runtime backend URL should override an older inferred branch state',
);
assert.ok(explicitCalls.some((url) => url.startsWith('https://raw.githubusercontent.com/explicit/runtime-backend.json')));

assert.equal(
  buildRuntimeBackendHealthCheckWarning(true),
  null,
  'healthy backend registrations should not include a warning',
);
assert.match(
  buildRuntimeBackendHealthCheckWarning(false) || '',
  /health check/i,
  'failed server-side health checks should warn instead of blocking registration',
);

console.log('Runtime backend state checks passed.');
