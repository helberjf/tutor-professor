import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('servidor bloqueia fetch, HTTP e sockets externos antes de abrir conexão', () => {
  const guard = fileURLToPath(new URL('./network-guard.cjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--require', guard, '-e', `
    const assert = require('node:assert/strict');
    const net = require('node:net');
    const http = require('node:http');
    (async () => {
      await assert.rejects(fetch('https://production.invalid'), /E2E/);
      await assert.rejects(fetch('http://127.0.0.1:8001/api/account/delete'), /E2E/);
      assert.throws(() => net.connect({host:'production.invalid', port:443}), /E2E/);
      assert.throws(() => http.get('http://production.invalid'), /E2E/);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
