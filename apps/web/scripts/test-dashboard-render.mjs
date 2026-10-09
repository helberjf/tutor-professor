import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const src = new URL('../src/', import.meta.url);
const failures = [];
const FixedDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-09T12:00:00'])); }
};

function renderComponent(file, name, states, props = {}) {
  let index = 0;
  const compiled = ts.transpileModule(readFileSync(new URL(file, src), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const scopedRequire = (specifier) => {
    if (specifier === 'react') return {
      ...React,
      useState: initial => [index < states.length ? states[index++] : typeof initial === 'function' ? initial() : initial, () => {}],
      useMemo: fn => fn(),
      useEffect: () => {},
    };
    if (specifier === '@/lib/api') return { api: {}, ApiError: class extends Error {} };
    if (specifier === 'next/navigation') return { useRouter: () => ({ replace: () => {} }) };
    if (specifier === 'next/link') return { default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (specifier.startsWith('@/components/')) return new Proxy({}, { get: (_, name) => () => React.createElement('section', null, String(name)) });
    if (specifier === '@/lib/i18n') return {
      t: text => text,
      tf: (text, values) => Object.entries(values).reduce((s, [key, value]) => s.replaceAll(`{${key}}`, value), text),
    };
    return require(specifier);
  };
  new Function('exports', 'module', 'require', 'Date', compiled)(module.exports, module, scopedRequire, FixedDate);
  return renderToStaticMarkup(React.createElement(module.exports[name], props));
}

const summary = {
  start_date: '2026-01-01', end_date: '2026-10-09', questions_answered: 63,
  topics_studied: 2, subjects_studied: 1, subject_names: ['DVA-C02'],
  topic_names: ['AWS Lambda', 'Amazon DynamoDB'],
};
const dashboard = {
  today: { study_date: '2026-10-09', pomodoro_count: 0, activity_count: 24 },
  recent_days: [], study_streak_count: 5, last_study_date: '2026-10-09',
  question_metrics: [{ subject_id: 19, subject_name: 'DVA-C02', resolved_count: 63, correct_count: 42, error_count: 21, accuracy_percent: 67 }],
};
function overview(states = [], data = dashboard) {
  return renderComponent('components/dashboard-overview.tsx', 'DashboardOverview',
    [null, 'year', summary, false, 0, false, null, null].map((value, index) => index in states ? states[index] : value),
    { dashboard: data, pomodoroState: { completedByDate: {} } });
}
function check(name, test) {
  try { test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`); }
}

check('question counts use complete singular/plural labels', () => {
  const html = overview();
  assert.match(html, /63 questões resolvidas/);
  assert.doesNotMatch(html, /questãoões/);
  assert.match(overview([], { ...dashboard, question_metrics: [{ ...dashboard.question_metrics[0], resolved_count: 1 }] }), /1 questão resolvida/);
});
check('period details show topics provided by the API', () => {
  const html = overview();
  assert.match(html, /Tópicos estudados no período/);
  assert.match(html, /AWS Lambda/);
  assert.match(html, /Amazon DynamoDB/);
});
check('historical fallback keeps the requested 30-day dates', () => {
  const html = overview([null, 'year', summary, false, 1]);
  assert.match(html, /2026-08-11/);
  assert.match(html, /2026-09-09/);
  assert.doesNotMatch(html, /2026-10-09: 0 pomodoro/);
  assert.doesNotMatch(html, /<span>Hoje<\/span>/);
});
check('missing period data is reported instead of displayed as zero', () => {
  const html = overview([null, 'year', null, false, 0, false, null, 'Não foi possível carregar a atividade do período.']);
  assert.match(html, /Não foi possível carregar a atividade do período/);
  assert.doesNotMatch(html, />0<\/p><p[^>]*>Questões feitas/);
});
check('empty successful period retains legitimate zero counts', () => {
  const html = overview([null, 'year', { ...summary, questions_answered: 0, topics_studied: 0, subject_names: [], topic_names: [], subjects_studied: 0 }]);
  assert.match(html, />0<\/p><p[^>]*>Questões feitas/);
});
check('weekly bars scale with daily totals', () => {
  const bars = [8, 24, 0].map((total, index) => ({ date: `2026-10-0${index + 1}`, dayLabel: 'dia', total, activities: total ? [{ type: 'coding', count: total }] : [] }));
  const html = renderComponent('components/weekly-activity-chart.tsx', 'WeeklyActivityChart', [bars, false, null]);
  const heights = Array.from(html.matchAll(/style="height:([\d.]+)%"/g), match => Number(match[1]));
  assert.ok(heights.some(height => Math.abs(height - 100 / 3) < 0.01), `8 events must occupy a third of the 24-event bar; got ${heights}`);
});
check('refresh failure retains the loaded dashboard and shows a warning', () => {
  const html = renderComponent('app/dashboard/page.tsx', 'default', ['authenticated', dashboard, false, 'Falha ao atualizar', { completedByDate: {} }]);
  assert.match(html, /Resumo de estudos/);
  assert.match(html, /Falha ao atualizar/);
});
check('initial dashboard failure remains visible', () => {
  const html = renderComponent('app/dashboard/page.tsx', 'default', ['authenticated', null, false, 'Falha inicial', { completedByDate: {} }]);
  assert.match(html, /Falha inicial/);
  assert.doesNotMatch(html, /Resumo de estudos/);
});
if (failures.length) throw new Error(`${failures.length} dashboard regressions failed: ${failures.join(', ')}`);
console.log('Dashboard component render checks passed.');
