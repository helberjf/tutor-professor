import { readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const WEB_URL = 'http://127.0.0.1:3100';
export const API_URL = 'http://127.0.0.1:8100';

export function assertLocalUrl(value) {
  const url = new URL(value);
  if (![WEB_URL, API_URL].includes(url.origin) || url.username || url.password) {
    throw new Error(`E2E: destino recusado: ${url.origin}`);
  }
  return url;
}

export function cleanEnvironment(source = process.env) {
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp',
    'userprofile', 'localappdata', 'appdata', 'home', 'lang', 'lc_all', 'ci', 'term']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toLowerCase())));
}

export function assertWorkspace(directory, runId) {
  const absolute = resolve(directory);
  try {
    if (dirname(realpathSync(absolute)) !== realpathSync(tmpdir()) ||
      !basename(absolute).startsWith('tutor-e2e-') || realpathSync(absolute) !== absolute ||
      !runId || readFileSync(join(absolute, '.e2e-owner'), 'utf8') !== runId) throw new Error('owner');
  } catch {
    throw new Error('E2E: workspace temporário ou marcador inválido; operação recusada.');
  }
  return absolute;
}
