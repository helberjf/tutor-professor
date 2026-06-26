import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const homePage = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');
const studyPage = readFileSync(resolve(root, 'src/app/study/page.tsx'), 'utf8');
const codingCurriculum = readFileSync(
  resolve(root, 'src/components/coding/CodingCurriculum.tsx'),
  'utf8',
);

assert.match(
  homePage,
  /href="\/study"[\s\S]*?Iniciar estudos|Iniciar estudos[\s\S]*?href="\/study"/,
  'home page primary study CTA should link to /study',
);
assert.match(homePage, /Vamos aprender inglês do seu jeito/, 'home hero should use updated Portuguese copy');
assert.doesNotMatch(homePage, /story-dots/, 'home hero should not use the white dotted background pattern');
assert.match(homePage, /rounded-\[2rem\][\s\S]*bg-gradient-to-br/, 'home hero should use the modern gradient surface');

assert.match(
  studyPage,
  /href="\/lesson"[\s\S]*?(Começar lição|Ir para lição|Continuar lição)|(?:Começar lição|Ir para lição|Continuar lição)[\s\S]*?href="\/lesson"/,
  'study page should include a large lesson CTA linking to /lesson',
);

assert.match(
  studyPage,
  /type CodingMode = 'reading' \| 'flashcards'/,
  'study coding tab should define reading and flashcards modes',
);
assert.match(studyPage, /Modo leitura/, 'study coding tab should expose reading mode');
assert.match(studyPage, /Modo flashcards/, 'study coding tab should expose flashcards mode');

assert.match(
  codingCurriculum,
  /focusMode\?: CodingFocusMode/,
  'coding curriculum should accept a focus mode prop',
);
assert.match(
  codingCurriculum,
  /focusMode === 'flashcards'/,
  'coding curriculum should route flashcards mode into flashcard decks',
);

console.log('study navigation tests passed');
