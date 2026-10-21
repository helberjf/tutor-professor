import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repo = resolve(web, '../..');
const local = join(repo, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.E2E_PYTHON || (existsSync(local) ? local : 'python');
for (const [command, args, cwd] of [
  [process.execPath, ['--test', 'scripts/e2e/safety.test.mjs', 'scripts/e2e/network-guard.test.mjs'], web],
  [python, ['scripts/e2e/test_safety.py'], repo],
]) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
