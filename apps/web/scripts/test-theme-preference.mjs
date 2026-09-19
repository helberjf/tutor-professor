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

// ── The first client render must match the server's HTML ────────────────────
// Reading localStorage or matchMedia in a useState initializer makes the first
// client render disagree with the server for anyone whose theme is not the
// default, and React reports a hydration mismatch on every page. The stored
// preference is adopted in an effect instead; ThemeScript keeps the paint
// correct in the meantime, so nothing flashes.
const provider = readFileSync(resolve(scriptDir, '../src/components/theme-provider.tsx'), 'utf8');
const initializers = provider.match(/useState<[^>]*>\([^;]*?\);/gs) ?? [];
assert.ok(initializers.length >= 2, 'the provider should still hold its theme state');
for (const initializer of initializers) {
  assert.doesNotMatch(
    initializer,
    /readInitialPreference|getSystemPrefersDark|localStorage|matchMedia/,
    `a useState initializer must not read the browser: ${initializer}`,
  );
}
assert.match(
  provider,
  /useEffect\(\(\) => \{\s*const stored = readInitialPreference\(\)/,
  'the stored preference should be adopted after hydration',
);

const script = readFileSync(resolve(scriptDir, '../src/components/theme-script.tsx'), 'utf8');
assert.match(script, /root\.dataset\.theme = theme/, 'the inline script still paints before hydration');

console.log('theme preference tests passed');
