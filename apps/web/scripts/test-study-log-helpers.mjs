/**
 * The numbers at the top of the "Controle de estudos" and the way its entries
 * are grouped. They are what tells the learner how much they studied, so they
 * are pinned here rather than eyeballed on screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, require);
  return module.exports;
}

const {
  addDays,
  barPercent,
  daysBetween,
  daysSinceReview,
  filterEntries,
  formatMinutes,
  formatPeriodLabel,
  groupByDay,
  groupByDiscipline,
  isValidPeriod,
  nameKey,
  notebookFileName,
  presetOf,
  presetRange,
  reviewScore,
  studyLogTotals,
  weekdayLabels,
} = loadModule('../src/components/study-log/study-log-helpers.ts');

let nextId = 1;
function entry(studied_on, discipline, { subject = null, minutes = null, title = 'Estudo' } = {}) {
  return {
    id: nextId++,
    studied_on,
    title,
    title_is_auto: false,
    discipline,
    subject,
    subject_id: null,
    subject_is_auto: false,
    source: 'manual',
    source_id: null,
    source_filename: null,
    duration_minutes: minutes,
    has_content: true,
    has_summary: false,
    created_at: `${studied_on}T10:00:00`,
    updated_at: `${studied_on}T10:00:00`,
  };
}

// ── Names fold the way the API folds them ─────────────────────────────────────
assert.equal(nameKey('Direito  Penal'), nameKey('direito penal'));
assert.equal(nameKey('DVA-C02'), 'dva c02');
assert.equal(nameKey('Programming'), nameKey('Programação'));
assert.equal(nameKey('French'), nameKey('Francês'));
assert.equal(nameKey('Direito — Penal'), nameKey('direito penal'), 'a dash separates words like a space');
assert.notEqual(nameKey('История'), '', 'a name in another alphabet keeps a key of its own');
assert.notEqual(nameKey('История'), nameKey('Математика'), 'two Cyrillic names stay two groups');
assert.equal(nameKey('История'), nameKey('история'));

// ── Time reads like people say it ─────────────────────────────────────────────
assert.equal(formatMinutes(0), '—');
assert.equal(formatMinutes(null), '—');
assert.equal(formatMinutes(45), '45 min');
assert.equal(formatMinutes(60), '1h');
assert.equal(formatMinutes(80), '1h 20min');
assert.equal(addDays('2026-09-01', -1), '2026-08-31');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');

// ── Today, the last 7 days and the 7 before them ──────────────────────────────
const today = '2026-09-26';
const entries = [
  entry('2026-09-26', 'Direito', { subject: 'Penal', minutes: 40 }),
  entry('2026-09-26', 'Programação', { subject: 'DVA-C02', minutes: 25 }),
  entry('2026-09-24', 'programacao', { subject: 'dva c02', minutes: 30 }),
  entry('2026-09-20', 'Direito', { minutes: 15 }),
  entry('2026-09-19', 'Direito', { minutes: 50 }),
  entry('2026-09-13', 'Inglês', { minutes: 10 }),
  entry('2026-09-12', 'Inglês', { minutes: 99 }),
];
const totals = studyLogTotals(entries, today);
assert.equal(totals.todayMinutes, 65);
assert.equal(totals.todayCount, 2);
assert.equal(totals.weekMinutes, 40 + 25 + 30 + 15, 'the week is today and the 6 days before');
assert.equal(totals.weekCount, 4);
assert.equal(totals.weekStudyDays, 3);
assert.equal(totals.previousWeekMinutes, 50 + 10, 'the week before is days 7 to 13 back');

// ── By day, newest first ──────────────────────────────────────────────────────
const days = groupByDay(entries);
assert.deepEqual(days.map((group) => group.day).slice(0, 3), ['2026-09-26', '2026-09-24', '2026-09-20']);
assert.equal(days[0].minutes, 65);
assert.equal(days[0].entries.length, 2);

// ── By discipline › subject, spelling and case do not split a group ───────────
const disciplines = groupByDiscipline(entries);
const programming = disciplines.find((group) => nameKey(group.discipline) === nameKey('Programação'));
assert.equal(programming.count, 2, '"programacao" and "Programação" are one discipline');
assert.equal(programming.subjects.length, 1, '"dva c02" and "DVA-C02" are one subject');
assert.equal(programming.discipline, 'Programação', 'the group takes the most recent spelling');
assert.equal(programming.subjects[0].minutes, 55);
const law = disciplines.find((group) => group.discipline === 'Direito');
assert.deepEqual(law.subjects.map((subject) => subject.subject), ['Penal', null], 'entries without a subject come last');
assert.equal(law.minutes, 105);
assert.equal(disciplines[0].lastStudied, '2026-09-26', 'the discipline studied most recently comes first');

// ── The filter matches every word, ignoring accents ───────────────────────────
assert.equal(filterEntries(entries, '').length, entries.length);
assert.equal(filterEntries(entries, 'penal direito').length, 1);
assert.equal(filterEntries(entries, 'programming').length, 2, 'the English name finds the Portuguese label');
assert.equal(filterEntries(entries, 'ingles').length, 2);

// ── Reviews: days since, and the score the API also computes ──────────────────
assert.equal(daysBetween('2026-09-20', '2026-09-27'), 7);
assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
assert.equal(daysSinceReview(null, '2026-09-27'), null, 'never reviewed');
assert.equal(daysSinceReview(`${new Date().getFullYear()}-06-15T12:00:00`, `${new Date().getFullYear()}-06-18`), 3);
assert.equal(reviewScore(2, 3), 67);
assert.equal(reviewScore(0, 0), 0);

// ── The notebook's file name ──────────────────────────────────────────────────
assert.equal(notebookFileName('Caderno de Direito › Constitucional'), 'caderno-de-direito-constitucional.md');
assert.equal(notebookFileName('???'), 'caderno.md');

// ── The period of an analysis ─────────────────────────────────────────────────
assert.deepEqual(presetRange('week', '2026-09-27'), { start: '2026-09-21', end: '2026-09-27' }, 'seven days, today included');
assert.deepEqual(presetRange('month', '2026-09-27'), { start: '2026-08-29', end: '2026-09-27' });
assert.equal(presetOf('2026-09-21', '2026-09-27', '2026-09-27'), 'week');
assert.equal(presetOf('2026-08-29', '2026-09-27', '2026-09-27'), 'month');
assert.equal(presetOf('2026-09-21', '2026-09-27', '2026-09-28'), 'custom', 'an old week is a custom period today');
assert.equal(isValidPeriod('2026-09-27', '2026-09-27'), true, 'one day');
assert.equal(isValidPeriod('2026-09-28', '2026-09-27'), false, 'the end before the start');
assert.equal(isValidPeriod('2025-09-27', '2026-09-27'), true, 'a year, as the API allows 366 days');
assert.equal(isValidPeriod('2025-09-26', '2026-09-27'), false, 'more than a year');
assert.equal(isValidPeriod('', '2026-09-27'), false, 'a date input still empty');

// ── Bars and labels ───────────────────────────────────────────────────────────
assert.equal(barPercent(50, 100), 50);
assert.equal(barPercent(1, 1000), 4, 'a small value stays visible');
assert.equal(barPercent(0, 100), 0);
assert.equal(barPercent(10, 0), 0);
const week = formatPeriodLabel('2026-09-21', '2026-09-27', 'pt-BR');
assert.match(week, /21/);
assert.match(week, /27/);
assert.doesNotMatch(week, /2026/, 'the year only when the period crosses one');
assert.match(formatPeriodLabel('2025-12-29', '2026-01-04', 'pt-BR'), /2026/);
assert.doesNotMatch(formatPeriodLabel('2026-09-27', '2026-09-27', 'en'), /[–-]/, 'one day is not a range');
const weekdays = weekdayLabels('en');
assert.equal(weekdays.length, 7);
assert.match(weekdays[0], /^Mon/, 'Monday first, like the API');
assert.match(weekdays[6], /^Sun/);

console.log('study log helpers: ok');
