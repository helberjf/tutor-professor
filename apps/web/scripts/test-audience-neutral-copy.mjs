/**
 * The app teaches anyone, so nothing a person reads may say it is for children.
 *
 * This started as a kids' app, and the copy is where that shows first: a label
 * here, an "área dos pais" there, and the product quietly tells an adult they
 * are in the wrong place. This scan fails on the words themselves, so it also
 * catches them coming back in a screen written next year.
 *
 * What it does NOT ban: the API field names (`child_name`, `ChildProfile`) and
 * the storage keys, which no user reads and whose renaming would be a migration
 * and 130 route changes for no visible gain.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Every .ts/.tsx file under src, so a new screen is covered the day it lands. */
function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

// Case-insensitive: these are words, not identifiers.
const BANNED = [
  { pattern: /crian[çc]a/i, why: 'call them "estudante", not "criança"' },
  { pattern: /área d[oe]s? pais|area d[oe]s? pais/i, why: 'the settings belong to the account, not to a parent' },
  { pattern: /historinha/i, why: 'the library is stories, not "historinhas"' },
  { pattern: /amigo tutor/i, why: 'it is a tutor, not an imaginary friend' },
  { pattern: /\bkid-(surface|button|tag|pink|orange|blue|purple)\b/, why: 'the design tokens were renamed' },
  { pattern: /nome do aluno\b/i, why: 'use "nome do estudante" for one consistent word' },
];

// Comments explaining the rename are allowed to name the old thing.
const ALLOWED_LINE = /(^\s*[/*]|\bchild_name\b|ChildProfile|english-kids-tutor|ParentsAreaRedirect)/;

const offenders = [];
for (const file of sourceFiles(srcRoot)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (ALLOWED_LINE.test(line)) return;
    for (const { pattern, why } of BANNED) {
      if (pattern.test(line)) {
        offenders.push(`${file.replace(srcRoot, 'src')}:${index + 1} — ${why}\n    ${line.trim()}`);
      }
    }
  });
}

assert.deepEqual(offenders, [], `copy that still says this app is for children:\n${offenders.join('\n')}`);

// The age band tunes the content, and it is derived from the date of birth
// rather than picked from a list — a dropdown went stale the day after a
// birthday, and it never told the product whether a minor was studying.
const onboarding = readFileSync(resolve(srcRoot, 'app/onboarding/page.tsx'), 'utf8');
const account = readFileSync(resolve(srcRoot, 'app/account/page.tsx'), 'utf8');
const register = readFileSync(resolve(srcRoot, 'app/register/page.tsx'), 'utf8');
for (const [source, name] of [[onboarding, 'onboarding'], [account, 'account'], [register, 'register']]) {
  assert.match(source, /type="date"/, `${name} should ask for the date of birth`);
  assert.match(source, /age-band/, `${name} should derive the band from that date`);
}
assert.match(
  register,
  /acompanhado por um adulto responsável/,
  'signing a minor up must state the supervision clause from the terms',
);

// The account area is reachable under its own name, and the old link still works.
const parentsRedirect = readFileSync(resolve(srcRoot, 'app/parents/page.tsx'), 'utf8');
assert.match(parentsRedirect, /redirect\('\/account'\)/, '/parents must keep working as a redirect');

const navbar = readFileSync(resolve(srcRoot, 'components/navbar.tsx'), 'utf8');
assert.match(navbar, /href: '\/account', label: 'Área da conta'/, 'the navbar should name the account area');

console.log('audience-neutral copy tests passed');
