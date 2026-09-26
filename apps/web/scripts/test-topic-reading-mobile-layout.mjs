import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const topicView = await readFile(
  new URL('../src/components/coding/TopicView.tsx', import.meta.url),
  'utf8',
);

assert.match(topicView, /fixed inset-0 z-\[60\]/, 'the reading modal must cover the global mobile navigation');
assert.match(topicView, /h-\[100dvh\] min-h-0 w-full flex-col/, 'the modal panel must stay within the mobile viewport');
assert.match(topicView, /shrink-0 border-b border-slate-200 px-3 pb-2 pt-\[calc\(0\.5rem_\+_env\(safe-area-inset-top\)\)\] sm:px-7 sm:pb-4 sm:pt-4/, 'the mobile reading header must use compact spacing');
assert.match(topicView, /mt-2 flex flex-nowrap items-center gap-1/, 'the mobile reading controls must stay on one compact row');
assert.match(topicView, /t\("Parar áudio"\) : t\("Ouvir texto"\)/, 'the speech action must retain its requested full label');
assert.match(topicView, /Aprofundar com IA/, 'the AI action must retain its full mobile label');
assert.match(topicView, /<main className="min-h-0 flex-1 overflow-y-auto/, 'only the reading body should consume remaining scroll space');
assert.match(topicView, /<footer className="shrink-0[^\"]*env\(safe-area-inset-bottom\)/, 'the fixed footer must respect the iPhone safe area');
assert.match(topicView, /aria-label=\{t\("Etapa anterior do estudo"\)\}[\s\S]*?rounded-xl[^\"]*px-3 py-2 text-xs[^\"]*sm:rounded-2xl/, 'the previous button must be visually smaller on mobile');
assert.match(topicView, /aria-label=\{t\("Próxima etapa do estudo"\)\}[\s\S]*?rounded-xl[^\"]*px-3 py-2 text-xs[^\"]*sm:rounded-2xl/, 'the next button must be visually smaller on mobile');

assert.match(topicView, /flex flex-wrap items-start justify-between gap-x-3 lg:flex-nowrap lg:items-center/, 'on a computer the title, count and controls must share one row');
assert.match(topicView, /order-last basis-full[^"]*lg:order-none lg:mt-0 lg:basis-auto/, 'below lg the controls wrap under the title; on lg they sit beside it');
assert.match(topicView, /lg:hidden">\s*\{safeIndex \+ 1\} de \{total\}/, 'on a computer the step count joins the subject line instead of its own row');
assert.match(topicView, /function buildSpeakableReadingText\(step: ReadingStudyStep\): string \{\s*if \(step.type === 'section'\) \{\s*return \[\s*`Parte/, 'the audio must start at the part, not repeat the topic title');
assert.match(topicView, /window\.scrollTo\(\{ top: 0[^}]*\}\);\s*\}, \[initialTopic\.id\]\);/, 'opening a topic must start at its header, not keep the list scroll');
console.log('topic reading mobile layout checks passed');
