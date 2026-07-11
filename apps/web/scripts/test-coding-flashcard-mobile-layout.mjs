import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const studyPage = await readFile(new URL('../src/app/study/page.tsx', import.meta.url), 'utf8');
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
