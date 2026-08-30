import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const modalUrl = new URL('../src/components/questions/PracticeQuestionsModal.tsx', import.meta.url);
const curriculumUrl = new URL('../src/components/coding/CodingCurriculum.tsx', import.meta.url);

let modalSource;
try {
  modalSource = readFileSync(modalUrl, 'utf8');
} catch {
  assert.fail('Expected PracticeQuestionsModal.tsx to exist');
}

// Compile just the pure clock helper: the component itself needs a DOM.
const helperMatch = modalSource.match(/export function formatClock\(totalSeconds: number\): string \{[\s\S]*?\n\}/);
assert.ok(helperMatch, 'Expected formatClock to be exported from the practice modal');
const compiled = ts.transpileModule(helperMatch[0], {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { formatClock } = module.exports;

assert.equal(typeof formatClock, 'function');
assert.equal(formatClock(0), '00:00');
assert.equal(formatClock(9), '00:09');
assert.equal(formatClock(59), '00:59');
assert.equal(formatClock(60), '01:00');
assert.equal(formatClock(599), '09:59');
assert.equal(formatClock(3599), '59:59');
assert.equal(formatClock(3600), '1:00:00', 'an hour or more must show hours');
assert.equal(formatClock(7800), '2:10:00', 'the 130 minute AWS exam reads as 2:10:00');
assert.equal(formatClock(-5), '00:00', 'a negative remainder must clamp to zero');
assert.equal(formatClock(30.7), '00:30', 'fractional seconds must floor, never round up past the deadline');

// ── The timer must be a deadline, not a decrementing counter ────────────────
assert.ok(
  modalSource.includes('deadline - Date.now()'),
  'the countdown must be derived from a deadline so a throttled background tab does not drift',
);
assert.ok(
  !/setRemaining\((?:current|value|prev)[^)]*-\s*1\)/.test(modalSource),
  'the countdown must not be a naive decrement',
);
assert.ok(
  modalSource.includes('window.clearInterval(id)'),
  'the interval must be cleared so it does not outlive the session',
);
assert.ok(
  modalSource.includes('setRanOutOfTime(true)') && modalSource.includes('setFinished(true)'),
  'reaching zero must end the session',
);
assert.ok(
  modalSource.includes('Tempo esgotado'),
  'the result screen must say when the session ended on the clock',
);
assert.ok(
  modalSource.includes('durationSeconds?: number'),
  'the timer must be optional so untimed practice sessions are unchanged',
);
assert.ok(
  modalSource.includes('if (!timed || finished) return;'),
  'the clock must stop once the session is finished',
);
assert.ok(
  modalSource.includes('aria-live="off"'),
  'a per-second timer must not be announced on every tick by a screen reader',
);

// restart() must give back a full clock, otherwise "Fazer novamente" starts expired.
const restartMatch = modalSource.match(/function restart\(\) \{[\s\S]*?\n  \}/);
assert.ok(restartMatch, 'Expected a restart function');
assert.ok(
  restartMatch[0].includes('setDeadline(') && restartMatch[0].includes('setRemaining('),
  'restarting a timed exam must reset the clock, not resume an expired one',
);
assert.ok(
  restartMatch[0].includes('setRanOutOfTime(false)'),
  'restarting must clear the ran-out-of-time result',
);

// ── The subject exam wires the clock to the real exam pace ──────────────────
const curriculumSource = readFileSync(curriculumUrl, 'utf8');
const paceMatch = curriculumSource.match(/const EXAM_SECONDS_PER_QUESTION = (\d+);/);
assert.ok(paceMatch, 'Expected the subject exam to declare its pace');
const pace = Number(paceMatch[1]);
assert.equal(pace, 120, 'AWS associate exams allow 130 minutes for 65 questions, so about 2 minutes each');
assert.equal(65 * pace, 7800, 'a 65 question simulado must budget the same 130 minutes as the real exam');
assert.ok(
  curriculumSource.includes('examTimed ? examQuestions.length * EXAM_SECONDS_PER_QUESTION : undefined'),
  'the clock must scale with the number of questions drawn, and be skippable',
);
assert.ok(
  curriculumSource.includes('Cronometrar como na prova'),
  'the subject exam must let the user choose whether to be timed',
);

console.log('Simulado timer checks passed.');
