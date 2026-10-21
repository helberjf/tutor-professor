import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { API_URL, WEB_URL, assertLocalUrl, assertWorkspace, cleanEnvironment } from './safety.mjs';

test('permite apenas as duas origens dedicadas, sem credenciais', () => {
  for (const url of [WEB_URL, `${API_URL}/api/objectives`]) assert.doesNotThrow(() => assertLocalUrl(url));
  for (const url of ['https://production.example', 'http://127.0.0.1:8001', 'http://localhost:3100',
    'http://127.0.0.1.evil.test:3100', 'http://user:pass@127.0.0.1:3100', 'file:///tmp/x']) {
    assert.throws(() => assertLocalUrl(url), /E2E/);
  }
});

test('ambiente dos servidores não herda credenciais nem configuração local', () => {
  const env = cleanEnvironment({ PATH: 'runtime', SystemRoot: 'windows', DATABASE_URL: 'production',
    GEMINI_API_KEY: 'secret', NODE_OPTIONS: '--require unsafe', PYTHONPATH: 'unsafe',
    NEXT_PUBLIC_API_BASE_URL: 'https://production.example', GITHUB_TOKEN: 'secret', CUSTOM_SECRET: 'secret' });
  assert.equal(env.PATH, 'runtime');
  assert.equal(env.SystemRoot, 'windows');
  for (const key of ['DATABASE_URL', 'GEMINI_API_KEY', 'NODE_OPTIONS', 'PYTHONPATH',
    'NEXT_PUBLIC_API_BASE_URL', 'GITHUB_TOKEN', 'CUSTOM_SECRET']) assert.equal(env[key], undefined);
});

test('seed/limpeza recusam workspace sem marcador e caminhos fora da pasta temporária', () => {
  const root = mkdtempSync(join(tmpdir(), 'tutor-e2e-'));
  try {
    assert.throws(() => assertWorkspace(root, 'run-1'), /E2E/);
    writeFileSync(join(root, '.e2e-owner'), 'run-1');
    assert.doesNotThrow(() => assertWorkspace(root, 'run-1'));
    assert.throws(() => assertWorkspace(root, 'other-run'), /E2E/);
    assert.throws(() => assertWorkspace(join(root, '..'), 'run-1'), /E2E/);
    assert.throws(() => assertWorkspace(process.cwd(), 'run-1'), /E2E/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
