import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The study page was split into modules; read the whole feature.
const studyDir = new URL('../src/app/study/', import.meta.url);
const studyFiles = ['page.tsx', '_components/CodingTab.tsx', '_components/DiverseTab.tsx', '_components/EnglishTab.tsx', '_components/shared.tsx', '_lib/study-helpers.ts'];
const studyPage = (
  await Promise.all(studyFiles.map((file) => readFile(new URL(file, studyDir), 'utf8')))
).join('\n');
const deck = await readFile(new URL('../src/components/coding/FlashcardDeck.tsx', import.meta.url), 'utf8');
const syntaxCodeBlock = await readFile(new URL('../src/components/coding/SyntaxCodeBlock.tsx', import.meta.url), 'utf8');

assert.match(
  studyPage,
  /className="order-2 min-w-0 lg:order-1"/,
  'the coding column must be allowed to shrink inside the responsive grid',
);
assert.match(
  studyPage,
  /lg:grid-cols-\[minmax\(0,1fr\)_18rem\]/,
  'the coding page must reserve a fixed desktop column for the pomodoro instead of letting content collide with it',
);
assert.match(
  studyPage,
  /activeTab === 'coding' \? 'max-w-7xl' : 'max-w-5xl'/,
  'the coding tab needs a wider desktop container while preserving the compact width for other study tabs',
);
assert.match(
  deck,
  /className="min-w-0 space-y-6"/,
  'the flashcard deck must not impose its intrinsic width on mobile layouts',
);
assert.match(
  deck,
  /className="flex min-w-0 flex-col gap-3 rounded-2xl/,
  'flashcard rows must stack controls on mobile and keep their own width constrained',
);
assert.match(
  deck,
  /break-words font-black text-slate-800/,
  'flashcard questions must wrap instead of truncating or pushing the layout sideways',
);
assert.match(
  deck,
  /break-words text-sm leading-relaxed text-slate-500/,
  'flashcard answers must wrap across lines instead of being line-clamped',
);
assert.match(
  syntaxCodeBlock,
  /whitespace-pre-wrap/,
  'code examples must wrap long lines on narrow screens',
);
assert.match(
  syntaxCodeBlock,
  /\[overflow-wrap:anywhere\]/,
  'long unbroken code tokens must not force horizontal page overflow',
);

console.log('coding flashcard mobile layout checks passed');
