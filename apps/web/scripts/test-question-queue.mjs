/**
 * The practice queue must not hand back what the student already knows.
 *
 * "Fazer simulado" used to replay every question of a topic from the first one,
 * every time. These checks run the real helper (transpiled, not grepped) so the
 * rule survives refactors, and they mirror the backend's `is_mastered` in
 * apps/api/services/study_queue_service.py — the two must agree or the session
 * queue and the practice screen will serve different questions.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const source = readFileSync(new URL('../src/lib/question-queue.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const { isMastered, buildPracticeQueue, pendingQuestions, countPending, sortForPractice } =
  module.exports;

function question(id, overrides = {}) {
  return {
    id,
    correct_option: 'certa',
    attempt_count: 0,
    correct_count: 0,
    error_count: 0,
    last_selected_option: null,
    last_answered_at: null,
    ...overrides,
  };
}

// ── mastery ────────────────────────────────────────────────────────────────
const neverSeen = question(1);
const seenOnce = question(2, { attempt_count: 1, correct_count: 1, last_selected_option: 'certa' });
const mastered = question(3, { attempt_count: 2, correct_count: 2, last_selected_option: 'certa' });
const masteredThenMissed = question(4, {
  attempt_count: 3,
  correct_count: 2,
  error_count: 1,
  last_selected_option: 'errada',
});

assert.equal(isMastered(neverSeen), false, 'a question nobody answered is not mastered');
assert.equal(isMastered(seenOnce), false, 'one right answer is not mastery');
assert.equal(isMastered(mastered), true, 'two right answers retire a question');
assert.equal(
  isMastered(masteredThenMissed),
  false,
  'the last answer decides: right twice and then missed is still owed',
);

// ── what is offered to practise ────────────────────────────────────────────
const bank = [neverSeen, seenOnce, mastered, masteredThenMissed];
assert.deepEqual(
  pendingQuestions(bank).map((item) => item.id),
  [1, 2, 4],
  'a mastered question must not be offered again',
);
assert.equal(countPending(bank), 3, 'the panel counts what is still owed');

const queue = buildPracticeQueue(bank);
assert.deepEqual(
  queue.map((item) => item.id),
  [1, 4, 2],
  'order: never seen, then missed, then merely seen',
);

assert.deepEqual(
  buildPracticeQueue(bank, { includeMastered: true }).map((item) => item.id).sort(),
  [1, 2, 3, 4],
  '"refazer todas" keeps every question, including the mastered ones',
);

// ── tie-breaking is stable, so the list does not shuffle between renders ────
const sameRank = [
  question(11, { attempt_count: 1, error_count: 1, last_selected_option: 'errada', last_answered_at: '2026-09-10T10:00:00' }),
  question(12, { attempt_count: 1, error_count: 3, last_selected_option: 'errada', last_answered_at: '2026-09-11T10:00:00' }),
  question(13, { attempt_count: 1, error_count: 1, last_selected_option: 'errada', last_answered_at: '2026-09-09T10:00:00' }),
];
assert.deepEqual(
  sortForPractice(sameRank).map((item) => item.id),
  [12, 13, 11],
  'most-missed first, then the one left alone longest',
);
assert.deepEqual(
  sortForPractice(sameRank).map((item) => item.id),
  sortForPractice([...sameRank].reverse()).map((item) => item.id),
  'the order must not depend on the order it came in',
);

// ── nothing is mutated ─────────────────────────────────────────────────────
const original = bank.map((item) => item.id);
buildPracticeQueue(bank);
assert.deepEqual(bank.map((item) => item.id), original, 'the caller list must not be reordered in place');

console.log('question queue tests passed');
