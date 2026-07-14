import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registerPage = readFileSync(new URL('../src/app/register/page.tsx', import.meta.url), 'utf8');

function fieldLine(id) {
  const start = registerPage.indexOf(`<Field id="${id}"`);
  assert.notEqual(start, -1, `${id} field should exist`);
  const end = registerPage.indexOf('\n', start);
  assert.notEqual(end, -1, `${id} field line should end`);
  return registerPage.slice(start, end);
}

assert.match(registerPage, /required\?: boolean;/);
assert.match(registerPage, /function Field\(\{ id, label, icon, error, required = false, children \}: FieldProps\)/);
assert.match(registerPage, /aria-hidden="true"[\s\S]*\*/);

for (const id of ['first_name', 'last_name', 'child_name', 'email', 'cpf', 'password', 'confirm']) {
  assert.match(
    fieldLine(id),
    /\srequired(?:\s|>)/,
    `${id} should be visibly marked required`,
  );
}

assert.match(registerPage, /Idioma para aprender[\s\S]*aria-hidden="true"[\s\S]*\*/);
assert.doesNotMatch(fieldLine('ai_api_key'), /\srequired(?:\s|>)/);
assert.doesNotMatch(registerPage, /next\.ai_api_key = 'Informe sua chave de API\.'/);
assert.match(registerPage, /const aiApiKey = form\.ai_api_key\.trim\(\);/);
assert.match(registerPage, /ai_api_key: aiApiKey \|\| undefined,/);

console.log('register required marker checks passed.');
