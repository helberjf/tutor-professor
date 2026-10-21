import { API_URL, WEB_URL } from '../../scripts/e2e/safety.mjs';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async function globalTeardown() {
  const expected = process.env.E2E_EXPECTED_RUN_ID;
  if (!expected) return;
  if (!/^[a-f0-9-]{36}$/.test(expected)) throw new Error('E2E: marcador inválido.');
  const ready = await fetch(`${API_URL}/__e2e__/ready`, { signal: AbortSignal.timeout(2000) });
  const marker = await ready.json();
  if (marker.run_id !== expected) throw new Error('E2E: teardown recusado; execução diferente.');
  const shutdown = await fetch(`${API_URL}/__e2e__/shutdown`, {
    method: 'POST', headers: { 'X-E2E-Run': expected }, signal: AbortSignal.timeout(3000),
  });
  if (shutdown.status !== 202) throw new Error('E2E: shutdown recusado.');
  const end = Date.now() + 20_000;
  const receipt = join(tmpdir(), `tutor-e2e-${expected}.stopped`);
  while (Date.now() < end) {
    const states = await Promise.all([API_URL, WEB_URL].map(async url => {
      try { await fetch(url, { signal: AbortSignal.timeout(500) }); return true; } catch { return false; }
    }));
    if (states.every(alive => !alive) && existsSync(receipt) && readFileSync(receipt, 'utf8') === expected) {
      unlinkSync(receipt);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('E2E: servidores não encerraram dentro do prazo.');
}
