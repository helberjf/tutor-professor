/**
 * Objectives on the client: the deadline wording, and the wiring that makes the
 * screen reachable.
 *
 * The percentage itself is the backend's answer (scripts/test_objectives_progress.py
 * pins it), so what is checked here is what only lives in the frontend: how a
 * deadline reads once it has passed, which colour a bar takes, and the fact that
 * the page is routed, guarded and linked instead of being an orphan file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, require);
  return module.exports;
}

const { deadlineLabel, progressToneClass, areaLabel, areaChipClass } = loadModule(
  '../src/components/objectives/objective-areas.ts',
);

// ── The deadline in words ───────────────────────────────────────────────────
assert.equal(deadlineLabel(null, null), null, 'no date means no countdown');
assert.equal(deadlineLabel(5, null), null, 'a countdown without a date is not shown');
assert.match(deadlineLabel(1, '2026-10-01'), /faltam 1 dia$/, 'one day is singular');
assert.match(deadlineLabel(12, '2026-10-01'), /faltam 12 dias$/, 'many days are plural');
assert.match(deadlineLabel(0, '2026-10-01'), /é hoje$/, 'the last day says so');
// A missed deadline must stay visible: the objective is late, not cancelled.
assert.match(deadlineLabel(-3, '2026-10-01'), /atrasado 3 dias$/, 'a passed date reads as late');
assert.match(deadlineLabel(-1, '2026-10-01'), /atrasado 1 dia$/, 'one late day is singular');

// ── The bar's colour tracks the three states ────────────────────────────────
assert.equal(progressToneClass(0), 'bg-slate-300', 'nothing studied yet is neutral');
assert.equal(progressToneClass(40), 'bg-amber-500', 'work in progress is amber');
assert.equal(progressToneClass(100), 'bg-emerald-500', 'a finished objective is green');

// ── Areas fall back instead of rendering an empty chip ──────────────────────
assert.equal(areaLabel('coding'), 'Programação');
assert.equal(areaLabel('desconhecido'), 'Livre', 'an unknown area still reads as something');
assert.match(areaChipClass('desconhecido'), /bg-slate-100/, 'an unknown area still gets a chip');

// ── The screen is reachable, guarded and served by the API client ───────────
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const apiClient = read('../src/lib/api.ts');
for (const method of [
  'getObjectives:',
  'getObjectivesSummary:',
  'createObjective:',
  'updateObjective:',
  'deleteObjective:',
  'addObjectiveItem:',
  'updateObjectiveItem:',
  'deleteObjectiveItem:',
]) {
  assert.ok(apiClient.includes(method), `the API client should expose ${method}`);
}
// Every DELETE here answers 204, so the client must not treat an empty body as
// a failure — that would report an error for a call that worked.
assert.match(apiClient, /response\.status === 204/, 'a 204 must not be parsed as JSON');

assert.match(
  read('../src/lib/private-routes.ts'),
  /'\/objectives'/,
  'the objectives page holds personal data and must be private',
);
assert.match(
  read('../src/components/navbar.tsx'),
  /href: '\/objectives', label: 'Objetivos'/,
  'the menu should reach the objectives page',
);
assert.match(
  read('../src/app/dashboard/page.tsx'),
  /<ObjectivesProgressCard \/>/,
  'the dashboard should show how close the objectives are',
);
assert.match(
  read('../src/app/page.tsx'),
  /href=\{cardHref\('\/objectives'\)\}/,
  'the home screen should offer the objectives card',
);

const page = read('../src/app/objectives/page.tsx');
assert.match(page, /useRequireAuth/, 'the page must require an account');
assert.match(page, /px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10/, 'the page follows the mobile-first padding');

const card = read('../src/components/objectives/ObjectiveCard.tsx');
assert.match(card, /aria-checked=\{item\.done\}/, 'an item checkbox must announce its state');
assert.match(
  read('../src/components/objectives/ObjectiveProgressBar.tsx'),
  /role="progressbar"/,
  'the percentage must be readable by a screen reader',
);

console.log('objectives UI checks passed.');
