import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const countdownUrl = new URL('../src/components/questions/use-countdown.ts', import.meta.url);
const modalUrl = new URL('../src/components/questions/PracticeQuestionsModal.tsx', import.meta.url);
const runnerUrl = new URL('../src/components/exam/ExamRunner.tsx', import.meta.url);

let countdownSource;
try {
  countdownSource = readFileSync(countdownUrl, 'utf8');
} catch {
  assert.fail('Expected use-countdown.ts to exist');
}
const modalSource = readFileSync(modalUrl, 'utf8');

// Compile just the pure clock helper: the hook itself needs React and a DOM.
const helperMatch = countdownSource.match(/export function formatClock\(totalSeconds: number\): string \{[\s\S]*?\n\}/);
assert.ok(helperMatch, 'Expected formatClock to be exported from the countdown module');
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
  countdownSource.includes('deadline - Date.now()'),
  'the countdown must be derived from a deadline so a throttled background tab does not drift',
);
assert.ok(
  !/setRemaining\((?:current|value|prev)[^)]*-\s*1\)/.test(countdownSource),
  'the countdown must not be a naive decrement',
);
assert.ok(
  countdownSource.includes('window.clearInterval(id)'),
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
  countdownSource.includes('if (!timed || !active || expired) return;'),
  'the clock must stop once the session is finished',
);
assert.ok(
  modalSource.includes('aria-live="off"'),
  'a per-second timer must not be announced on every tick by a screen reader',
);

// restart() must give back a full clock, otherwise "Fazer novamente" starts expired.
const restartMatch = countdownSource.match(/const restart = useCallback\(\(\) => \{[\s\S]*?\}, \[total\]\);/);
assert.ok(restartMatch, 'Expected a restart callback on the countdown');
assert.ok(
  restartMatch[0].includes('setDeadline(') && restartMatch[0].includes('setRemaining('),
  'restarting a timed exam must reset the clock, not resume an expired one',
);
assert.ok(
  restartMatch[0].includes('setExpired(false)'),
  'restarting must clear the expired flag',
);
assert.ok(
  modalSource.includes('setRanOutOfTime(false)'),
  'the practice modal must clear its ran-out-of-time result on restart',
);

// ── The exam runner takes its clock from the server, not the client ─────────
const runnerSource = readFileSync(runnerUrl, 'utf8');
assert.ok(
  runnerSource.includes('const durationSeconds = exam.duration_minutes * 60;'),
  'the sitting must be timed by the exam it belongs to',
);
assert.ok(
  runnerSource.includes('if (clock.expired && !result && !finishing) void finish();'),
  'running out of time must end the sitting exactly like pressing finish',
);
// Nothing may leak the answer while the exam is open. Comments are stripped first,
// otherwise the doc comment explaining this very rule would trip the check.
const runnerCode = runnerSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
for (const leak of ['correct_options', 'explanation', 'isCorrect']) {
  assert.ok(
    !runnerCode.includes(leak),
    `the runner must not reference ${leak}: no feedback before the exam ends`,
  );
}

console.log('Simulado timer checks passed.');
