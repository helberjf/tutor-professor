/**
 * The app has to read in the language of whoever opened it.
 *
 * Three things have to hold for that, and each has bitten before in the theme
 * work that this mirrors: the system's own language decides when nobody has
 * chosen; a choice, once made, survives; and <html lang> is right before the
 * first paint rather than after hydration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const SRC_ROOT = new URL('../src/', import.meta.url);

function resolveSpecifier(specifier, fromUrl) {
  const base = specifier.startsWith('@/')
    ? new URL(specifier.slice(2), SRC_ROOT)
    : new URL(specifier, fromUrl);
  for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
    const candidate = new URL(base.href + suffix);
    try {
      return { url: candidate, source: readFileSync(candidate, 'utf8') };
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') throw error;
    }
  }
  return null;
}

function loadModule(specifier, fromUrl = import.meta.url) {
  const resolved = resolveSpecifier(specifier, fromUrl);
  if (!resolved) throw new Error(`could not resolve ${specifier}`);
  const compiled = ts.transpileModule(resolved.source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const scopedRequire = (spec) =>
    spec.startsWith('@/') || spec.startsWith('.')
      ? loadModule(spec, resolved.url)
      : require(spec);
  new Function('exports', 'module', 'require', compiled)(module.exports, module, scopedRequire);
  return module.exports;
}

const i18n = loadModule('../src/lib/i18n.ts');
const {
  normalizeLocalePreference,
  resolveSystemLocale,
  resolveLocalePreference,
  setActiveLocale,
  getActiveLocale,
  t,
  tf,
} = i18n;

// ── The system decides when nobody has ────────────────────────────────────────
assert.equal(resolveSystemLocale(['pt-BR', 'en-US']), 'pt-BR');
assert.equal(resolveSystemLocale(['pt']), 'pt-BR');
assert.equal(resolveSystemLocale(['en-GB']), 'en');
assert.equal(resolveSystemLocale(['fr-FR']), 'en', 'a system in neither language reads English');
assert.equal(resolveSystemLocale([]), 'pt-BR', 'no signal at all keeps the default');
assert.equal(resolveSystemLocale(undefined), 'pt-BR');

// ── A choice outranks the system ──────────────────────────────────────────────
assert.equal(resolveLocalePreference('system', 'en'), 'en');
assert.equal(resolveLocalePreference('pt-BR', 'en'), 'pt-BR', 'a chosen language wins');
assert.equal(resolveLocalePreference('en', 'pt-BR'), 'en');

assert.equal(normalizeLocalePreference('en'), 'en');
assert.equal(normalizeLocalePreference('PT-BR'), 'pt-BR');
assert.equal(normalizeLocalePreference('klingon'), 'system', 'anything unknown falls back');
assert.equal(normalizeLocalePreference(null), 'system');
assert.equal(normalizeLocalePreference(undefined), 'system');

// ── Translation, and what happens without one ─────────────────────────────────
assert.equal(getActiveLocale(), 'pt-BR', 'the default locale is Portuguese');
assert.equal(t('Entrar'), 'Entrar', 'Portuguese renders the source untouched');

setActiveLocale('en');
assert.equal(t('Entrar'), 'Sign in');
assert.equal(t('Voltar ao início'), 'Back to home');
assert.equal(
  t('Uma frase que ninguém traduziu ainda'),
  'Uma frase que ninguém traduziu ainda',
  'a missing entry must fall back to the source, never to a blank or a key',
);
assert.equal(t(t('Entrar')), 'Sign in', 'translating twice must not lose the text');
assert.equal(tf('Olá, {name}', { name: 'Ana' }), 'Olá, Ana', 'tf fills placeholders');
setActiveLocale('pt-BR');
assert.equal(t('Entrar'), 'Entrar', 'switching back restores Portuguese');

// ── Nothing may ship a half-built dictionary ──────────────────────────────────
const { EN_DICTIONARY } = loadModule('../src/lib/locales/en/index.ts');
const entries = Object.entries(EN_DICTIONARY);
assert.ok(entries.length > 900, `the dictionary looks truncated: ${entries.length} entries`);
for (const [pt, en] of entries) {
  assert.ok(pt.trim().length > 0, 'a dictionary key must not be blank');
  assert.ok(typeof en === 'string' && en.trim().length > 0, `"${pt}" has no translation`);
}

// ── <html lang> is set before the first paint, not after hydration ────────────
const script = readFileSync(new URL('../src/components/locale-script.tsx', import.meta.url), 'utf8');
assert.match(script, /root\.lang = locale/, 'the blocking script must set <html lang>');
assert.match(script, /navigator\.languages/, 'it must fall back to the system language');
assert.match(script, /localStorage\.getItem/, 'it must honour a stored choice first');

const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
assert.match(layout, /<LocaleScript \/>/, 'the layout must run the blocking locale script');
assert.match(layout, /<LocaleProvider>/, 'the tree must sit inside the locale provider');

const provider = readFileSync(new URL('../src/components/locale-provider.tsx', import.meta.url), 'utf8');
assert.match(
  provider,
  /useIsomorphicLayoutEffect/,
  'adoption must run before paint, or the reader sees the other language first',
);
assert.match(provider, /key=\{locale\}/, 'a language change must re-render the tree');

// ── No translation may be frozen at module load ───────────────────────────────
// A t() call in the body of a module runs once, when the module is imported —
// before anyone has resolved which language to read in, and on the server once
// per process for every request that follows. The text it produces is stuck in
// whatever language happened to be active. Labels therefore live in constants
// as plain source text, and the screen translates them as it draws them.
{
  // Walked with fs rather than shelled out to `find`: a URL pathname is
  // "/C:/..." on Windows and "/home/..." elsewhere, and every trick for turning
  // one into a path breaks the other. This needs no path string at all.
  const { readdirSync } = require('node:fs');
  const collect = (dir, found = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
      if (entry.isDirectory()) collect(child, found);
      else if (/\.tsx?$/.test(entry.name)) found.push(child);
    }
    return found;
  };
  const files = collect(new URL('../src/', import.meta.url))
    .filter((url) => !url.href.includes('/lib/locales/') && !url.href.endsWith('/lib/i18n.ts'));

  const offenders = [];
  for (const file of files) {
    const name = file.href.split('/src/')[1];
    const text = readFileSync(file, 'utf8');
    const src = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true,
      name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node, insideFunction) => {
      const entersFunction = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
        || ts.isGetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
      if (!insideFunction && ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && ['t', 'tf', 'translate'].includes(node.expression.text)) {
        const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
        offenders.push(`${name}:${line}  ${node.getText(src).slice(0, 60)}`);
      }
      ts.forEachChild(node, (child) => visit(child, insideFunction || entersFunction));
    };
    visit(src, false);
  }
  assert.deepEqual(
    offenders,
    [],
    `these translations are evaluated at import time and freeze in one language:\n  ${offenders.join('\n  ')}`,
  );
}

// ── The request carries the locale, without importing the UI layer ────────────
const apiClient = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
assert.match(apiClient, /'X-App-Locale'/, 'every request must say which language is on screen');
assert.doesNotMatch(
  apiClient,
  /from '@\/lib\/i18n'/,
  'lib/api.ts is loaded in isolation by these scripts and must not depend on the UI layer',
);

console.log('locale switching checks passed.');
