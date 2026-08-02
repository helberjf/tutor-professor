import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Static guards for the mobile-first rules that were violated once and are easy
 * to reintroduce. A full layout audit needs a browser; these catch the specific
 * shapes that caused real breakage:
 *
 *  1. A flex item that cannot shrink (`flex-1` without `min-w-0`) forced the
 *     study page wider than a 320px screen and gave the whole document a
 *     horizontal scrollbar.
 *  2. `min-h-9 md:min-h-11` gives the *smaller* touch target to phones, which
 *     is the inverse of mobile-first.
 *  3. The three study tabs must share the row instead of overflowing it.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

// ── 1. Text inputs that flex must be allowed to shrink ───────────────────────
const inputFiles = [
  'src/app/study/page.tsx',
  'src/app/study/_components/DiverseTab.tsx',
  'src/app/study/_components/EnglishTab.tsx',
  'src/components/coding/CodingCurriculum.tsx',
  'src/components/coding/TopicView.tsx',
];

for (const file of inputFiles) {
  const source = read(file);
  const inputs = source.match(/<input\b[\s\S]{0,700}?\/>/g) ?? [];
  for (const tag of inputs) {
    const className = tag.match(/className="([^"]*)"/)?.[1] ?? '';
    if (!/\bflex-1\b/.test(className)) continue;
    assert.match(
      className,
      /\bmin-w-0\b/,
      `${file}: a flex-1 input needs min-w-0, otherwise min-width:auto keeps it from shrinking and the page scrolls sideways on small screens. Offending class: "${className}"`,
    );
  }
}

// ── 2. No inverted touch-target sizing ───────────────────────────────────────
for (const file of [...inputFiles, 'src/app/study/_components/shared.tsx']) {
  const source = read(file);
  assert.doesNotMatch(
    source,
    /min-h-(?:8|9|10)[^"]*\bmd:min-h-11\b/,
    `${file}: touch targets must not be smaller on phones than on desktop. Use min-h-11 as the base.`,
  );
}

// ── 3. Study tabs share the row instead of overflowing it ────────────────────
const shared = read('src/app/study/_components/shared.tsx');
const tabButton = shared.slice(shared.indexOf('export function TabButton'));
assert.match(tabButton, /\bflex-1\b/, 'study tabs should share the available row');
assert.match(tabButton, /\bmin-w-0\b/, 'study tabs need min-w-0 so long labels can truncate');
assert.match(tabButton, /\bmin-h-11\b/, 'study tabs need a 44px touch target');
assert.doesNotMatch(tabButton, /\bshrink-0\b[^"]*\bpx-4\b/, 'study tabs should not keep a fixed desktop width on phones');

console.log('mobile-first layout checks passed.');
