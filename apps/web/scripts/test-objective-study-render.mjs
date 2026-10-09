import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const src = new URL('../src/', import.meta.url);
const targets = [
  { key: 'topic:1', title: 'Limites', subject: 'Cálculo', topic_id: 1, subject_id: 10, available: true },
  { key: 'topic:2', title: 'Derivadas', subject: 'Cálculo', topic_id: 2, subject_id: 10, available: true },
  { key: 'topic:3', title: 'Triângulos', subject: 'Geometria', topic_id: 3, subject_id: 11, available: true },
];
let optionsState = { options: { disciplines: [{ key: 'discipline:1', name: 'Matemática', targets }], ai_available: true, ai_unavailable_reason: null }, loading: false, error: '', reload: () => {} };
function load(path, from = src) {
  const base = path.startsWith('@/') ? new URL(path.slice(2), src) : new URL(path, from);
  const url = ['', '.ts', '.tsx', '/index.ts'].map((suffix) => new URL(base.href + suffix)).find((candidate) => existsSync(candidate) && /\.(ts|tsx)$/.test(candidate.pathname));
  assert.ok(url, `module exists: ${path}`);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const scopedRequire = (specifier) => {
    if (specifier === '@/lib/api') return { api: new Proxy({}, { get: () => () => { throw new Error('render must not call API'); } }) };
    if (specifier.endsWith('/ObjectiveStudyOptions')) return { useObjectiveStudyOptions: () => optionsState };
    return specifier.startsWith('@/') || specifier.startsWith('.') ? load(specifier, url) : require(specifier);
  };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, scopedRequire);
  return module.exports;
}
const { ObjectiveStudyScopePicker } = load('./components/objectives/ObjectiveStudyScopePicker');
const { ObjectiveStudyAnalysisPanel } = load('./components/objectives/ObjectiveStudyAnalysisPanel');
const { ObjectiveCard } = load('./components/objectives/ObjectiveCard');
const { CreateObjectiveModal } = load('./components/objectives/CreateObjectiveModal');
const scope = { discipline_key: 'discipline:1', discipline: 'Matemática', targets: targets.slice(0, 2), available: true };
const input = { discipline_key: scope.discipline_key, target_keys: ['topic:1', 'topic:2'] };
const picker = renderToStaticMarkup(React.createElement(ObjectiveStudyScopePicker, { value: input, onChange: () => {}, savedScope: scope }));
assert.match(picker, /2 tópicos ou assuntos selecionados/);
assert.equal((picker.match(/type="checkbox"[^>]*checked=""/g) ?? []).length, 2);
assert.match(picker, /Filtrar por matéria/);
assert.match(picker, /Triângulos/);
const missing = renderToStaticMarkup(React.createElement(ObjectiveStudyScopePicker, { value: { ...input, target_keys: ['topic:99'] }, onChange: () => {}, savedScope: { ...scope, targets: [{ ...targets[0], key: 'topic:99', title: 'Tópico excluído', available: false }] } }));
assert.match(missing, /Tópico excluído/);
assert.match(missing, /Remova os vínculos indisponíveis/);
const analysis = { progress_percent: null, remaining_percent: null, confidence: 'low', summary: 'Ainda faltam exercícios registrados.', studied: [], gaps: ['Praticar derivadas.'], next_steps: ['Resolver exercícios.'], evidence_count: 0, evidence_refs: [], context_truncated: false, generated_at: '2026-10-09T12:00:00', stale: false };
const objective = { id: 7, title: 'Resolver derivadas', study_scope: scope, study_analysis: analysis, items: [], progress_percent: 0, item_count: 0, done_count: 0, total_weight: 0, done_weight: 0, status: 'active', target_date: null, days_remaining: null };
const noEvidence = renderToStaticMarkup(React.createElement(ObjectiveStudyAnalysisPanel, { objective, onChanged: () => {} }));
assert.match(noEvidence, /Dados insuficientes para estimar/);
assert.match(noEvidence, /O que falta melhorar/);
assert.match(noEvidence, /Plano para alcançar o objetivo/);
assert.match(noEvidence, /<ol[^>]*>[\s\S]*Resolver exercícios\.[\s\S]*<\/ol>/, 'the action plan is presented in order');
assert.doesNotMatch(noEvidence, /0%|Faltam aproximadamente/);
const completeEstimate = renderToStaticMarkup(React.createElement(ObjectiveCard, { objective: { ...objective, study_analysis: { ...analysis, progress_percent: 100, remaining_percent: 0, stale: true } }, onChanged: () => {}, onDeleted: () => {} }));
assert.match(completeEstimate, /Progresso das tarefas/);
assert.match(completeEstimate, /Estimativa da IA/);
assert.match(completeEstimate, /100%/);
assert.match(completeEstimate, /O objetivo ou os tópicos mudaram/);
assert.doesNotMatch(completeEstimate, /Conquistado/);
const createModal = renderToStaticMarkup(React.createElement(CreateObjectiveModal, { onClose: () => {}, onCreated: () => {} }));
assert.doesNotMatch(createModal, /Peso do item|peso [1-9]|O peso diz/, 'creating tasks no longer asks for a weight');
assert.doesNotMatch(completeEstimate, /Peso do novo item|peso [1-9]/, 'adding tasks to a card no longer asks for a weight');
optionsState = { ...optionsState, options: { ...optionsState.options, ai_available: false, ai_unavailable_reason: 'Configure sua chave de IA.' } };
const unavailable = renderToStaticMarkup(React.createElement(ObjectiveStudyAnalysisPanel, { objective, onChanged: () => {} }));
assert.match(unavailable, /Configure sua chave de IA\./);
assert.match(unavailable, /<button[^>]+disabled=""[^>]*>[\s\S]*?Atualizar análise/);
console.log('objective study component render checks passed');
