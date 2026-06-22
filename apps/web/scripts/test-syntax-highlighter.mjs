import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modulePath = resolve(scriptDir, '../src/components/coding/syntax-highlighter.ts');

assert.equal(existsSync(modulePath), true, 'syntax highlighter module should exist');

const source = readFileSync(modulePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const module = { exports: {} };
const fn = new Function('exports', 'module', compiled);
fn(module.exports, module);

const { normalizeCodeLanguage, tokenizeCode } = module.exports;

assert.equal(normalizeCodeLanguage(), 'typescript');
assert.equal(normalizeCodeLanguage('TS'), 'typescript');
assert.equal(normalizeCodeLanguage('python'), 'python');

const tokens = tokenizeCode('const total: number = items.length + 1; // soma\nconsole.log(`total: ${total}`);', 'typescript');
const tokenSummary = tokens.map((token) => `${token.kind}:${token.value}`);

assert(tokenSummary.includes('keyword:const'), 'TypeScript keywords should be highlighted');
assert(tokenSummary.includes('type:number'), 'TypeScript primitive types should be highlighted');
assert(tokenSummary.includes('number:1'), 'numeric literals should be highlighted');
assert(tokenSummary.some((entry) => entry.startsWith('comment:// soma')), 'line comments should be highlighted');
assert(tokenSummary.some((entry) => entry.startsWith('string:`total: ${total}`')), 'template strings should be highlighted');

const pythonTokens = tokenizeCode('def solve(nums):\n    return len(nums)  # tamanho', 'python');
const pythonSummary = pythonTokens.map((token) => `${token.kind}:${token.value}`);

assert(pythonSummary.includes('keyword:def'), 'Python keywords should be highlighted');
assert(pythonSummary.some((entry) => entry.startsWith('comment:# tamanho')), 'Python comments should be highlighted');

console.log('syntax highlighter tests passed');
