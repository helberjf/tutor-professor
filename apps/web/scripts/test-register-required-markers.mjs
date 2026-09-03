import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registerPage = readFileSync(new URL('../src/app/register/page.tsx', import.meta.url), 'utf8');

/**
 * Devolve a tag de abertura inteira do <Field> com aquele id, em uma linha ou
 * em varias. O que o teste garante e a marcacao de obrigatorio, entao ele nao
 * pode quebrar so porque o JSX foi reformatado.
 */
function fieldLine(id) {
  const idIndex = registerPage.indexOf(`id="${id}"`);
  assert.notEqual(idIndex, -1, `${id} field should exist`);
  const start = registerPage.lastIndexOf('<Field', idIndex);
  assert.notEqual(start, -1, `${id} should belong to a Field`);

  let depth = 0;
  for (let i = start; i < registerPage.length; i += 1) {
    const character = registerPage[i];
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === '>' && depth === 0) return registerPage.slice(start, i + 1);
  }
  return assert.fail(`${id} field tag should close`);
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
