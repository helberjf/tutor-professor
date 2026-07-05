import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const homePage = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');
const studyPage = readFileSync(resolve(root, 'src/app/study/page.tsx'), 'utf8');
const layout = readFileSync(resolve(root, 'src/app/layout.tsx'), 'utf8');
const navbar = readFileSync(resolve(root, 'src/components/navbar.tsx'), 'utf8');
const codingCurriculum = readFileSync(
  resolve(root, 'src/components/coding/CodingCurriculum.tsx'),
  'utf8',
);
const flashcardDeck = readFileSync(resolve(root, 'src/components/coding/FlashcardDeck.tsx'), 'utf8');
const globals = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');

assert.match(navbar, /Tutor pessoal/, 'navbar should rename the app eyebrow to Tutor pessoal');
assert.doesNotMatch(navbar, /Tutor de idiomas/, 'navbar should not keep the old Tutor de idiomas label');
assert.match(layout, /title: 'Tutor Pessoal'/, 'browser metadata should use Tutor Pessoal as the app title');
assert.match(layout, /description: 'Um tutor pessoal/, 'browser metadata should describe the app as a personal tutor');

assert.match(
  homePage,
  /href="\/study"[\s\S]*?Iniciar estudos|Iniciar estudos[\s\S]*?href="\/study"/,
  'home page primary study CTA should link to /study',
);
assert.match(homePage, /Vamos aprender inglês do seu jeito/, 'home hero should use updated Portuguese copy');
assert.doesNotMatch(homePage, /story-dots/, 'home hero should not use the white dotted background pattern');
assert.match(homePage, /mx-auto max-w-6xl/, 'home page should use a wider responsive shell');
assert.match(homePage, /rounded-\[1\.75rem\][\s\S]*bg-white/, 'home hero should use a high-contrast readable surface');
assert.match(homePage, /text-3xl[\s\S]*sm:text-4xl[\s\S]*md:text-5xl/, 'home hero headline should scale from mobile upward');
assert.match(homePage, /grid-cols-1[\s\S]*sm:grid-cols-2[\s\S]*lg:grid-cols-3/, 'home activity cards should be one column on narrow screens');
assert.doesNotMatch(homePage, /grid-cols-2 gap-4 md:grid-cols-2/, 'home activity cards should not force two columns on mobile');

assert.match(
  studyPage,
  /href="\/lesson"[\s\S]*?(Começar lição|Ir para lição|Continuar lição)|(?:Começar lição|Ir para lição|Continuar lição)[\s\S]*?href="\/lesson"/,
  'study page should include a large lesson CTA linking to /lesson',
);
assert.match(
  studyPage,
  /activeTab === 'english'\s*&&\s*\(\s*<Link[\s\S]*?href="\/lesson"[\s\S]*?<\/Link>\s*\)/,
  'study page lesson CTA should only render while the English tab is active',
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
assert.match(codingCurriculum, /leetcode-trainer-card/, 'LeetCode trainer card should use a theme-aware surface class');
assert.match(flashcardDeck, /study-mode-tabs/, 'flashcard deck tabs should use a theme-aware tab shell');
assert.match(flashcardDeck, /study-mode-tab-idle/, 'inactive flashcard deck tabs should use theme-aware text and hover states');
assert.match(flashcardDeck, /role="dialog"/, 'active flashcard study card should render as a modal dialog');
assert.match(flashcardDeck, /aria-modal="true"/, 'flashcard study modal should announce modal behavior');
assert.match(flashcardDeck, /h-\[100dvh\][\s\S]*sm:max-w-3xl/, 'flashcard study modal should fill mobile and center with max width on desktop');
assert.match(flashcardDeck, /Fechar tela cheia dos flashcards/, 'flashcard study modal should include a small X close button');
assert.match(globals, /\.study-mode-tabs/, 'theme CSS should define the flashcard deck tab shell');
assert.match(globals, /\.leetcode-trainer-card/, 'theme CSS should define the LeetCode trainer card surface');

console.log('study navigation tests passed');
