import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const src = new URL('../src/', import.meta.url);
const dashboard = { today: { study_date: '2026-10-09', pomodoro_count: 0 }, recent_days: [], question_metrics: [] };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness(file, name, method, initial, effectIndex, props) {
  const state = [...initial];
  const effects = [];
  const events = new Map();
  const requests = [];
  let index = 0;
  const api = { [method]: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) };
  const window = { addEventListener: (event, fn) => events.set(event, fn), removeEventListener: () => {} };
  const document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
  const scopedRequire = (specifier) => {
    if (specifier === 'react') return { ...React, useMemo: fn => fn(), useEffect: fn => effects.push(fn), useState: value => {
      const slot = index++;
      if (!(slot in state)) state[slot] = typeof value === 'function' ? value() : value;
      return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
    } };
    if (specifier === '@/lib/api') return { api, ApiError: class extends Error {} };
    if (specifier === '@/lib/i18n') return { t: text => text, tf: text => text };
    if (specifier === 'next/navigation') return { useRouter: () => ({}) };
    if (specifier === 'next/link') return { default: () => null };
    if (specifier.startsWith('@/components/')) return new Proxy({}, { get: () => () => null });
    return require(specifier);
  };
  const compiled = ts.transpileModule(readFileSync(new URL(file, src), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', 'window', 'document', compiled)(module.exports, module, scopedRequire, window, document);
  module.exports[name](props);
  const cleanup = effects[effectIndex]();
  return { state, requests, refresh: () => events.get('focus')(), cleanup };
}

const cases = [
  { name: 'period', file: 'components/dashboard-overview.tsx', component: 'DashboardOverview', method: 'getActivitySummary', initial: [null, 'year', null, true, 0], effect: 1, props: { dashboard, pomodoroState: { completedByDate: {} } }, data: value => ({ questions_answered: value }), read: state => state[2]?.questions_answered, error: state => state[7] },
  { name: 'calendar', file: 'components/dashboard-overview.tsx', component: 'DashboardOverview', method: 'getActivityMonth', initial: [null, 'year', null, true, 0], effect: 0, props: { dashboard, pomodoroState: { completedByDate: {} } }, data: value => [{ total_activities: value }], read: state => state[0]?.[0]?.total_activities, error: state => state[6] },
  { name: 'dashboard', file: 'app/dashboard/page.tsx', component: 'default', method: 'getStudyDashboard', initial: ['authenticated', null, true, null, { completedByDate: {} }], effect: 1, data: value => ({ ...dashboard, study_streak_count: value }), read: state => state[1]?.study_streak_count, error: state => state[3] },
  { name: 'weekly chart', file: 'components/weekly-activity-chart.tsx', component: 'WeeklyActivityChart', method: 'getWeekActivities', initial: [[], true, null], effect: 0, data: value => [{ activity_date: '2026-10-09', total_activities: value, activities_by_type: { coding: value } }], read: state => state[0]?.[0]?.total, error: state => state[2] },
];
const failures = [];
for (const config of cases) {
  const h = harness(config.file, config.component, config.method, config.initial, config.effect, config.props);
  h.requests[0].resolve(config.data(4)); await tick();
  assert.equal(config.read(h.state), 4, `${config.name} initial request`);
  h.refresh(); h.refresh();
  h.requests[2].resolve(config.data(12)); await tick();
  h.requests[1].reject(new Error('older response failed')); await tick();
  try {
    assert.equal(config.read(h.state), 12, 'latest successful data must remain');
    assert.equal(config.error(h.state), null, 'an older failed request must not overwrite the latest success');
    console.log(`PASS ${config.name} ignores older refresh responses`);
  } catch (error) { failures.push(config.name); console.error(`FAIL ${config.name}: ${error.message}`); }
  h.refresh(); h.cleanup(); h.requests[3].resolve(config.data(20)); await tick();
  assert.notEqual(config.read(h.state), 20, `${config.name} ignores requests after cleanup`);
}
assert.equal(failures.length, 0, `${failures.join(', ')} refresh races`);
