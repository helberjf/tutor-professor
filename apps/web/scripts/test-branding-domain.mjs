import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const files = [
  'README.md',
  'apps/api/.env.example',
  'scripts/activate-backend.ps1',
  'scripts/ativar-tudo.ps1',
  'scripts/publish-runtime-backend-state.ps1',
  'scripts/run-api.ps1',
  'scripts/run-tunnel.ps1',
  'scripts/start-project.ps1',
  'apps/web/src/app/layout.tsx',
  'apps/web/src/components/navbar.tsx',
];

for (const file of files) {
  const source = readFileSync(resolve(repoRoot, file), 'utf8');
  assert.match(source, /tuturprofessor\.vercel\.app|Tutor and Professor/, `${file} should reference the new brand or Vercel domain`);
}

const apiEnvExample = readFileSync(resolve(repoRoot, 'apps/api/.env.example'), 'utf8');
assert.match(apiEnvExample, /https:\/\/tuturprofessor\.vercel\.app/, 'API CORS example should include the new Vercel domain');
assert.match(apiEnvExample, /https:\/\/english-tutor-kid\.vercel\.app/, 'API CORS example should keep the old Vercel domain during transition');

console.log('branding and domain checks passed');
