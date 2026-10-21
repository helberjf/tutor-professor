// Verify the production build in a copy without .env files or inherited secrets.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_URL, assertWorkspace, cleanEnvironment } from './safety.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = mkdtempSync(join(tmpdir(), 'tutor-e2e-'));
const runId = randomUUID();
writeFileSync(join(root, '.e2e-owner'), runId);
let status = 1;
try {
  const staged = join(root, 'web');
  mkdirSync(staged);
  for (const name of ['src', 'public', 'package.json', 'next.config.mjs', 'tsconfig.json',
    'next-env.d.ts', 'postcss.config.js', 'tailwind.config.ts', '.eslintrc.json']) {
    cpSync(join(web, name), join(staged, name), { recursive: true });
  }
  symlinkSync(join(web, 'node_modules'), join(staged, 'node_modules'), 'junction');
  const child = spawn(process.execPath, [join(web, 'node_modules/next/dist/bin/next'), 'build', staged], {
    cwd: staged, windowsHide: true, stdio: 'inherit',
    env: { ...cleanEnvironment(), NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: API_URL,
      NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--require=${JSON.stringify(join(web, 'scripts/e2e/network-guard.cjs'))}` },
  });
  status = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit(code ?? 1));
  });
} finally {
  assertWorkspace(root, runId);
  const modules = join(root, 'web/node_modules');
  if (existsSync(modules)) rmSync(modules, { recursive: false, force: true });
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
process.exitCode = status;
