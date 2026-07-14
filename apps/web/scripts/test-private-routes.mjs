import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/lib/private-routes.ts', import.meta.url);
const source = readFileSync(helperUrl, 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const { isPrivateAppPath } = module.exports;

assert.equal(typeof isPrivateAppPath, 'function');

const privatePaths = [
  '/activity-log',
  '/admin/learn',
  '/books',
  '/chat',
  '/dashboard',
  '/diverse',
  '/lesson',
  '/lesson/history',
  '/parents',
  '/quick-review',
  '/quiz',
  '/review',
  '/study',
  '/study?tab=diverse',
];

for (const path of privatePaths) {
  assert.equal(isPrivateAppPath(path), true, `${path} should require login`);
}

const publicPaths = [
  '/',
  '/connect',
  '/connect?apiUrl=https%3A%2F%2Fexample.com',
  '/login',
  '/login?next=%2Fstudy',
  '/offline',
  '/register',
];

for (const path of publicPaths) {
  assert.equal(isPrivateAppPath(path), false, `${path} should stay public`);
}

console.log('private route checks passed.');
