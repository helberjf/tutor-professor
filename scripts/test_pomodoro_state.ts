import assert from 'node:assert/strict';
import {
  createInitialPomodoroState,
  formatTimer,
  getLocalDateKey,
  getTodaysPomodoroCount,
  resolvePomodoroState,
  startPomodoro,
} from '../apps/web/src/lib/pomodoro';

const start = new Date('2026-06-08T10:00:00').getTime();
const afterTenMinutes = start + 10 * 60 * 1000;
const afterTwentySixMinutes = start + 26 * 60 * 1000;

const initial = createInitialPomodoroState();
assert.equal(initial.mode, 'focus');
assert.equal(initial.running, false);
assert.equal(initial.seconds, 25 * 60);
assert.equal(formatTimer(65), '01:05');

const running = startPomodoro(initial, start);
assert.equal(running.running, true);
assert.equal(running.endsAt, start + 25 * 60 * 1000);

const stillRunning = resolvePomodoroState(running, afterTenMinutes);
assert.equal(stillRunning.running, true);
assert.equal(stillRunning.seconds, 15 * 60);
assert.equal(getTodaysPomodoroCount(stillRunning, afterTenMinutes), 0);

const completedWhileAway = resolvePomodoroState(running, afterTwentySixMinutes);
assert.equal(completedWhileAway.running, false);
assert.equal(completedWhileAway.mode, 'break');
assert.equal(completedWhileAway.seconds, 5 * 60);
assert.equal(completedWhileAway.completedByDate[getLocalDateKey(running.endsAt!)], 1);
assert.equal(getTodaysPomodoroCount(completedWhileAway, afterTwentySixMinutes), 1);

const resolvedAgain = resolvePomodoroState(completedWhileAway, afterTwentySixMinutes + 1000);
assert.equal(resolvedAgain.completedByDate[getLocalDateKey(running.endsAt!)], 1);

console.log('Pomodoro state checks passed.');
