import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expectedModel = 'gemini-3.1-flash-lite';
const productFiles = [
  '../../../README.md',
  '../../../local.secrets.example',
  '../../../apps/api/.env.example',
  '../../../apps/api/main.py',
  '../../../apps/api/models/database.py',
  '../../../apps/api/schemas/schemas.py',
  '../../../apps/api/services/book_service.py',
  '../../../apps/api/services/phrase_generator_service.py',
  '../src/app/admin/learn/page.tsx',
  '../src/app/parents/page.tsx',
  '../src/app/register/page.tsx',
];

for (const file of productFiles) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.match(source, new RegExp(expectedModel.replaceAll('.', '\\.')), `${file} should use ${expectedModel}`);
  assert.doesNotMatch(source, /gemini-2\.5-flash/, `${file} should not use the old Gemini model default`);
}

console.log('Gemini model default checks passed.');
