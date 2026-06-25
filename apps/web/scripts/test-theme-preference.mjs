import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modulePath = resolve(scriptDir, '../src/lib/theme.ts');

assert.equal(existsSync(modulePath), true, 'theme module should exist');

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

const {
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  resolveThemePreference,
  THEME_OPTIONS,
} = module.exports;

assert.equal(THEME_STORAGE_KEY, 'english-kids-tutor.theme-preference');
assert.deepEqual(THEME_OPTIONS.map((option) => option.value), ['system', 'light', 'dark']);

assert.equal(normalizeThemePreference(), 'system');
assert.equal(normalizeThemePreference(''), 'system');
assert.equal(normalizeThemePreference('banana'), 'system');
assert.equal(normalizeThemePreference('LIGHT'), 'light');
assert.equal(normalizeThemePreference('dark'), 'dark');
assert.equal(normalizeThemePreference('system'), 'system');

assert.equal(resolveThemePreference('system', false), 'light');
assert.equal(resolveThemePreference('system', true), 'dark');
assert.equal(resolveThemePreference('light', true), 'light');
assert.equal(resolveThemePreference('dark', false), 'dark');

console.log('theme preference tests passed');
