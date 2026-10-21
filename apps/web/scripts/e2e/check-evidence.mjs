import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test',
  '--config=playwright.evidence.config.ts'], { stdio: 'inherit' });
assert.equal(result.status, 1, 'A prova deve produzir exatamente a falha deliberada.');
const report = JSON.parse(readFileSync('evidence-results/results.json', 'utf8'));
assert.equal(report.stats.unexpected, 1);
assert.equal(report.errors.length, 0);
const files = readdirSync('evidence-results', { recursive: true }).map(file => join('evidence-results', file));
for (const suffix of ['test-failed-1.png', 'video.webm', 'trace.zip']) {
  const artifact = files.find(file => file.endsWith(suffix));
  assert.ok(artifact && statSync(artifact).size > 100, `Artefato obrigatório ausente: ${suffix}`);
}
assert.ok(JSON.stringify(report).includes('falha deliberada para verificar artefatos'));
console.log('Screenshot, vídeo, trace e relatório verificados com uma falha deliberada. A regressão normal exclui esse diagnóstico.');
