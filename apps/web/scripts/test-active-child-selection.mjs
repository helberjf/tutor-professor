import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/lib/active-child.ts', import.meta.url);
const source = readFileSync(helperUrl, 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const { choosePreferredActiveChildId } = module.exports;

assert.equal(typeof choosePreferredActiveChildId, 'function');

const children = [
  { id: 1, name: 'Henrique' },
  { id: 2, name: 'Lucas' },
];

const progressSummaries = [
  {
    child: { id: 1, name: 'Henrique' },
    progress: {
      themes_completed: 3,
      vocabulary_learned: 9,
      streak_count: 0,
      last_activity: '2026-05-25T22:11:23.258324',
      difficult_words: ['Can you help me?'],
    },
  },
  {
    child: { id: 2, name: 'Lucas' },
    progress: {
      themes_completed: 0,
      vocabulary_learned: 0,
      streak_count: 0,
      last_activity: null,
      difficult_words: [],
    },
  },
];

assert.equal(
  choosePreferredActiveChildId({
    storedActiveChildId: 2,
    children,
    progressSummaries,
    fallbackChildId: 2,
  }),
  1,
  'stored empty child should give way to the child with restored history',
);

assert.equal(
  choosePreferredActiveChildId({
    storedActiveChildId: 1,
    children,
    progressSummaries,
    fallbackChildId: 2,
  }),
  1,
  'stored child with progress should remain active',
);

assert.equal(
  choosePreferredActiveChildId({
    storedActiveChildId: null,
    children,
    progressSummaries,
    fallbackChildId: 2,
  }),
  1,
  'missing stored child should prefer the child with history over an empty fallback',
);

console.log('active child selection checks passed.');
