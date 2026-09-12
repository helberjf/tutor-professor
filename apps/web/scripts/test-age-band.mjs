/**
 * The forms read the age band off the date while somebody is still typing.
 *
 * The API is the authority — it recomputes the band on every write — but the
 * screens have to agree with it, or the register form would promise one thing
 * and the saved profile would say another. This runs the real helper and mirrors
 * the cases pinned in scripts/test_birth_date_audience.py.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const source = readFileSync(resolve(root, 'src/lib/age-band.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const { ageFromIsoDate, bandFromIsoDate, bandLabel, isMinorIsoDate, birthDateError, parseIsoDate } =
  module.exports;

const today = new Date(2026, 8, 12); // 12 September 2026, local time

// ── the band, including the day it changes ─────────────────────────────────
const cases = [
  ['2020-09-13', '4-6', 5],
  ['2019-09-12', '7-9', 7],
  ['2016-09-12', '10-12', 10],
  ['2013-09-13', '10-12', 12],
  ['2013-09-12', '13-17', 13],
  ['2008-09-13', '13-17', 17],
  ['2008-09-12', '18+', 18],
  ['1980-05-04', '18+', 46],
];
for (const [iso, band, age] of cases) {
  assert.equal(ageFromIsoDate(iso, today), age, `${iso} should be ${age} years old`);
  assert.equal(bandFromIsoDate(iso, today), band, `${iso} should land in ${band}`);
}

// ── the supervision case ───────────────────────────────────────────────────
assert.equal(isMinorIsoDate('2008-09-13', today), true, 'seventeen is a minor');
assert.equal(isMinorIsoDate('2008-09-12', today), false, 'eighteen is not');
assert.equal(isMinorIsoDate('', today), false, 'an empty field is not a minor');
assert.equal(isMinorIsoDate(null, today), false, 'a missing date is not a minor');

// ── dates that are not dates ───────────────────────────────────────────────
assert.equal(parseIsoDate('2026-02-31'), null, '31 February must not roll over into March');
assert.equal(parseIsoDate('12/09/2026'), null, 'only ISO dates are accepted');
assert.equal(ageFromIsoDate('2027-01-01', today), null, 'a date in the future is not an age');

// A date is read as a local calendar day, not as UTC midnight, or somebody west
// of Greenwich would see their birthday a day late.
assert.equal(parseIsoDate('2000-01-01').getDate(), 1, 'the day must survive the parse');
assert.equal(parseIsoDate('2000-01-01').getMonth(), 0, 'the month must survive the parse');

// ── what the form tells the person ─────────────────────────────────────────
assert.equal(birthDateError('', today), 'Informe a data de nascimento.');
assert.equal(birthDateError('2027-01-01', today), 'A data não pode estar no futuro.');
assert.equal(birthDateError('nonsense', today), 'Data inválida.');
assert.equal(birthDateError('1700-01-01', today), 'Confira o ano de nascimento.');
assert.equal(birthDateError('2014-03-02', today), '', 'a workable date has nothing to say');

assert.equal(bandLabel('10-12'), '10 a 12 anos');
assert.equal(bandLabel('18+'), '18 anos ou mais');
assert.equal(bandLabel(null), '', 'no band, no label');

// ── the screens that have to ask ───────────────────────────────────────────
const registerPage = readFileSync(resolve(root, 'src/app/register/page.tsx'), 'utf8');
assert.match(registerPage, /type="date"/, 'signup must ask for the date of birth');
assert.match(registerPage, /birth_date: form\.birth_date/, 'signup must send it');
assert.match(
  registerPage,
  /acompanhado por um adulto responsável/,
  'a minor at signup must be told the supervision clause',
);
assert.match(
  registerPage,
  /supervisionAccepted/,
  'the supervision clause must be acknowledged, not just displayed',
);

const accountPage = readFileSync(resolve(root, 'src/app/account/page.tsx'), 'utf8');
assert.match(accountPage, /Data de nascimento/, 'the account area must ask for the date');
assert.match(accountPage, /formIsMinor/, 'the account area must know when it is a minor profile');
assert.doesNotMatch(
  accountPage,
  /<option value="4-6">/,
  'the band is derived from the date now, not picked from a dropdown',
);

const onboardingPage = readFileSync(resolve(root, 'src/app/onboarding/page.tsx'), 'utf8');
assert.match(onboardingPage, /type="date"/, 'the guided first run must ask for the date');
assert.doesNotMatch(onboardingPage, /AGE_GROUPS/, 'no band buttons left to pick from');

console.log('age band tests passed');
