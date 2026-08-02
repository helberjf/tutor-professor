import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The study page was split into modules; read the whole feature.
const studyDir = new URL('../src/app/study/', import.meta.url);
const studyFiles = ['page.tsx', '_components/CodingTab.tsx', '_components/DiverseTab.tsx', '_components/EnglishTab.tsx', '_components/shared.tsx', '_lib/study-helpers.ts'];
const studyPage = (
  await Promise.all(studyFiles.map((file) => readFile(new URL(file, studyDir), 'utf8')))
).join('\n');
const deck = await readFile(new URL('../src/components/coding/FlashcardDeck.tsx', import.meta.url), 'utf8');

assert.match(
  studyPage,
  /className="order-2 min-w-0 lg:order-1"/,
  'the coding column must be allowed to shrink inside the responsive grid',
);
assert.match(
  deck,
  /className="min-w-0 space-y-6"/,
  'the flashcard deck must not impose its intrinsic width on mobile layouts',
);

console.log('coding flashcard mobile layout checks passed');
