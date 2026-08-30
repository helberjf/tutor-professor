import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/components/coding/typed-answer.ts', import.meta.url);

let source;
try {
  source = readFileSync(helperUrl, 'utf8');
} catch {
  assert.fail('Expected typed-answer.ts to exist');
}

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const {
  normalizeAnswer,
  normalizeCode,
  similarity,
  diffWords,
  compareAnswer,
  suggestRating,
  CLOSE_THRESHOLD,
} = module.exports;

for (const [name, fn] of Object.entries({
  normalizeAnswer,
  normalizeCode,
  similarity,
  diffWords,
  compareAnswer,
  suggestRating,
})) {
  assert.equal(typeof fn, 'function', `Expected ${name} to be exported as a function`);
}

// ── normalização ─────────────────────────────────────────────────────────────
assert.equal(normalizeAnswer('  Função   RECURSIVA! '), 'funcao recursiva');
assert.equal(normalizeAnswer('É, não?'), 'e nao');
assert.equal(normalizeAnswer('---'), '');
assert.equal(normalizeCode('  const  a = 1;\n  return   a;  '), 'const a = 1; return a;');
assert.equal(normalizeCode('Const A'), 'Const A', 'code comparison keeps casing');

// ── similaridade ─────────────────────────────────────────────────────────────
assert.equal(similarity('abc', 'abc'), 1);
assert.equal(similarity('', ''), 1);
assert.equal(similarity('', 'abc'), 0);
assert.ok(similarity('recursao', 'recursaa') > 0.8);
assert.ok(similarity('gato', 'elefante azul') < 0.5);

// ── comparação ───────────────────────────────────────────────────────────────
const exact = compareAnswer('  função que chama a SI mesma! ', 'Função que chama a si mesma');
assert.equal(exact.verdict, 'exact', 'accents, casing and punctuation must not fail the answer');
assert.equal(exact.similarity, 1);
assert.deepEqual(
  exact.diff.map((part) => part.kind),
  ['ok'],
);

const close = compareAnswer('função que chama a si mesmo', 'função que chama a si mesma');
assert.equal(close.verdict, 'close');
assert.ok(close.similarity >= CLOSE_THRESHOLD);

const wrong = compareAnswer('um laço infinito', 'função que chama a si mesma');
assert.equal(wrong.verdict, 'wrong');
assert.ok(wrong.similarity < CLOSE_THRESHOLD);

const blank = compareAnswer('   ', 'função que chama a si mesma');
assert.equal(blank.verdict, 'wrong');
assert.equal(blank.similarity, 0);

const codeExact = compareAnswer('const a = 1;\n\nreturn a;', 'const a = 1; return a;', { code: true });
assert.equal(codeExact.verdict, 'exact', 'code mode ignores indentation and blank lines');
assert.equal(compareAnswer('CONST a', 'const a', { code: true }).verdict, 'wrong');
assert.equal(compareAnswer('CONST a', 'const a').verdict, 'exact');

// ── diff ─────────────────────────────────────────────────────────────────────
assert.deepEqual(diffWords('um laço que repete', 'um laço que repete até acabar'), [
  { text: 'um laço que repete', kind: 'ok' },
  { text: 'até acabar', kind: 'missing' },
]);
assert.deepEqual(diffWords('um laço azul que repete', 'um laço que repete'), [
  { text: 'um laço', kind: 'ok' },
  { text: 'azul', kind: 'extra' },
  { text: 'que repete', kind: 'ok' },
]);
assert.deepEqual(diffWords('', 'resposta'), [{ text: 'resposta', kind: 'missing' }]);
assert.deepEqual(diffWords('resposta', ''), [{ text: 'resposta', kind: 'extra' }]);

// ── nota sugerida ────────────────────────────────────────────────────────────
assert.equal(suggestRating('exact', 1), 'good');
assert.equal(suggestRating('close', 1), 'hard');
assert.equal(suggestRating('wrong', 1), 'again');
assert.equal(suggestRating('exact', 2), 'hard', 'acertar só na segunda tentativa vale menos');
assert.equal(suggestRating('close', 2), 'again');
assert.equal(suggestRating('wrong', 3), 'again');
assert.equal(suggestRating('exact', 0), 'good', 'attempts inválido cai para a primeira tentativa');

console.log('Typed answer checks passed.');
