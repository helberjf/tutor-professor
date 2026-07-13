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

const { chooseFreshestRuntimeBackendConfig } = module.exports;

assert.equal(typeof chooseFreshestRuntimeBackendConfig, 'function');

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

console.log('Runtime backend state checks passed.');
