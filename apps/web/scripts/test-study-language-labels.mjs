/**
 * The language tab and its texts follow the language chosen at signup.
 *
 * A child studying French used to see "English", "Começar lição de inglês" and
 * "Inglês · meta do dia" on the study page.
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

const cache = new Map();
function loadModule(specifier, fromUrl = import.meta.url) {
  const resolved = resolveSpecifier(specifier, fromUrl);
  if (!resolved) throw new Error(`could not resolve ${specifier}`);
  if (cache.has(resolved.url.href)) return cache.get(resolved.url.href).exports;
  const compiled = ts.transpileModule(resolved.source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  cache.set(resolved.url.href, module);
  const scopedRequire = (spec) =>
    spec.startsWith('@/') || spec.startsWith('.')
      ? loadModule(spec, resolved.url)
      : require(spec);
  new Function('exports', 'module', 'require', compiled)(module.exports, module, scopedRequire);
  return module.exports;
}

const { setActiveLocale, tf } = loadModule('../src/lib/i18n.ts');
const { EN_DICTIONARY } = loadModule('../src/lib/locales/en/index.ts');
const {
  studyLanguageName,
  studyLanguageInSentence,
  studyLanguageNativeName,
} = loadModule('../src/lib/study-language.ts');

setActiveLocale('pt-BR');
assert.equal(studyLanguageName('French'), 'Francês');
assert.equal(studyLanguageInSentence('French'), 'francês', 'Portuguese writes language names in lower case mid-sentence');
assert.equal(tf('Começar lição de {language}', { language: studyLanguageInSentence('French') }), 'Começar lição de francês');
assert.equal(tf('Começar lição de {language}', { language: studyLanguageInSentence('English') }), 'Começar lição de inglês', 'English learners keep the old text');
assert.equal(studyLanguageNativeName('French'), 'Français');
assert.equal(studyLanguageNativeName('English'), 'English', 'the tab keeps reading "English" for English learners');
assert.equal(studyLanguageName(null), 'Inglês', 'no answer yet falls back to English');
assert.equal(studyLanguageNativeName('Japanese'), 'Japanese', 'an unknown value shows as stored rather than as English');

setActiveLocale('en');
assert.equal(studyLanguageName('French'), 'French');
assert.equal(studyLanguageInSentence('French'), 'French', 'English capitalises language names');
assert.equal(tf('Começar lição de {language}', { language: studyLanguageInSentence('German') }), 'Start the German lesson');
assert.equal(tf('{language} · meta do dia', { language: studyLanguageName('Spanish') }), "Spanish · today's goal");
setActiveLocale('pt-BR');

// Every template the screens use has its English counterpart.
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const screens = [
  'app/study/page.tsx',
  'app/study/_components/EnglishTab.tsx',
  'app/study/_components/EnglishQuestionsSection.tsx',
  'components/study-start-section.tsx',
].map((path) => [path, read(path)]);

for (const [path, source] of screens) {
  for (const [, key] of source.matchAll(/"([^"\n]*\{language\}[^"\n]*)"/g)) {
    assert.ok(EN_DICTIONARY[key], `${path}: "${key}" has no English translation`);
  }
  // Only the database key may still name the language; nothing on screen may.
  const visible = source
    .replace(/const SUBJECT_NAME = "Inglês";/, '')
    .replace(/subject_name: 'Inglês - Gramática'/, '');
  assert.doesNotMatch(visible, /t\("[^"]*[Ii]nglês[^"]*"\)/, `${path}: a hard-coded "inglês" is back on screen`);
}

const studyPage = screens[0][1];
assert.doesNotMatch(studyPage, /label="English"/, 'the tab must not be hard-coded to English');
assert.match(studyPage, /label=\{studyLanguageNativeName\(studyLanguage\)\}/);

console.log('study language label checks passed');
