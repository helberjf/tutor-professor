import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const url = new URL('../src/components/objectives/objective-study-helpers.ts', import.meta.url);
const source = readFileSync(url, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', 'require', compiled)(module.exports, module, require);
const { toStudyScopeInput, toggleStudyTarget, selectStudyTargets, filterStudyTargets, validStudyScope, missingStudyTargets, createAndAnalyzeObjective, studyAiUnavailableMessage, objectiveTaskProgress } = module.exports;

assert.equal(typeof objectiveTaskProgress, 'function', 'the board must distinguish study-only goals from task progress');
const studyOnlyGoal = { status: 'active', item_count: 0, done_count: 0, progress_percent: 0 };
assert.deepEqual(objectiveTaskProgress([studyOnlyGoal]), { averagePercent: null, achievedCount: 0, pendingItems: 0 }, 'study-only goals do not report empty task progress');
const finishedTasks = { status: 'active', item_count: 2, done_count: 2, progress_percent: 100 };
const unfinishedTasks = { status: 'active', item_count: 2, done_count: 1, progress_percent: 50 };
assert.deepEqual(objectiveTaskProgress([finishedTasks, studyOnlyGoal]), { averagePercent: 100, achievedCount: 1, pendingItems: 0 }, 'study-only goals cannot reduce the mean of existing tasks');
assert.deepEqual(objectiveTaskProgress([finishedTasks, unfinishedTasks, { ...unfinishedTasks, status: 'archived' }]), { averagePercent: 75, achievedCount: 1, pendingItems: 1 }, 'active checklist progress remains supported');

const limits = { key: 'topic:1', title: 'Limites', subject: 'Cálculo', topic_id: 1, subject_id: 10, available: true };
const derivatives = { key: 'topic:2', title: 'Derivação', subject: 'Cálculo', topic_id: 2, subject_id: 10, available: true };
const geometry = { key: 'topic:3', title: 'Triângulos', subject: 'Geometria', topic_id: 3, subject_id: 11, available: true };
const options = { disciplines: [{ key: 'discipline:1', name: 'Matemática', targets: [limits, derivatives, geometry] }], ai_available: true, ai_unavailable_reason: null };
const scope = { discipline_key: 'discipline:1', discipline: 'Matemática', targets: [limits, derivatives], available: true };
assert.equal(toStudyScopeInput(null), null);
assert.deepEqual(toStudyScopeInput(scope), { discipline_key: 'discipline:1', target_keys: ['topic:1', 'topic:2'] });
assert.deepEqual(toggleStudyTarget(['topic:1'], 'topic:2'), ['topic:1', 'topic:2']);
assert.deepEqual(toggleStudyTarget(['topic:1', 'topic:2'], 'topic:1'), ['topic:2']);
const previousCap = Array.from({ length: 30 }, (_, index) => `topic:${index}`);
assert.deepEqual(toggleStudyTarget(previousCap, 'topic:30'), [...previousCap, 'topic:30'], 'the 31st topic can now be selected');
const fullSelection = Array.from({ length: 60 }, (_, index) => `topic:${index}`);
assert.deepEqual(toggleStudyTarget(fullSelection.slice(0, 59), 'topic:59'), fullSelection, 'the 60th topic can be selected');
assert.deepEqual(toggleStudyTarget(fullSelection, 'topic:60'), fullSelection, 'the 61st topic exceeds the server limit');
assert.match(studyAiUnavailableMessage('no_config'), /chave de API/);
assert.match(studyAiUnavailableMessage('no_credits'), /créditos/);
assert.deepEqual(filterStudyTargets(options.disciplines[0].targets, 'derivacao', ''), [derivatives]);
assert.deepEqual(filterStudyTargets(options.disciplines[0].targets, '', 'Geometria'), [geometry]);
assert.deepEqual(filterStudyTargets(options.disciplines[0].targets, 'limites', 'Geometria'), []);
assert.equal(typeof selectStudyTargets, 'function', 'bulk selection must be available');
assert.deepEqual(selectStudyTargets(filterStudyTargets(options.disciplines[0].targets, '', 'Cálculo')), ['topic:1', 'topic:2'], 'choosing a subject selects all its topics');
assert.deepEqual(selectStudyTargets(filterStudyTargets(options.disciplines[0].targets, '', 'Geometria')), ['topic:3'], 'changing subject replaces the prior group');
assert.deepEqual(selectStudyTargets(options.disciplines[0].targets), ['topic:1', 'topic:2', 'topic:3'], 'all subjects selects the discipline');
assert.deepEqual(selectStudyTargets(filterStudyTargets(options.disciplines[0].targets, 'derivacao', ''), ['topic:3']), ['topic:3', 'topic:2'], 'selecting search results preserves other selected topics');
assert.deepEqual(selectStudyTargets([limits, limits, derivatives], ['topic:1', 'topic:1']), ['topic:1', 'topic:2'], 'bulk selection deduplicates old and new keys');
assert.deepEqual(selectStudyTargets([{ ...limits, available: false }, derivatives]), ['topic:2'], 'unavailable topics are never selected automatically');
const manyTargets = Array.from({ length: 65 }, (_, index) => ({ ...limits, key: `topic:${index}` }));
assert.equal(selectStudyTargets(manyTargets.slice(0, 35)).length, 35, 'a subject with more than 30 topics is selected in full');
assert.deepEqual(selectStudyTargets(manyTargets), fullSelection, 'bulk selection respects the server cap');
assert.deepEqual(selectStudyTargets([geometry], fullSelection), fullSelection, 'a full selection cannot grow');
assert.deepEqual(selectStudyTargets([]), [], 'an empty subject has no selected targets');
assert.equal(validStudyScope(toStudyScopeInput(scope), options), true);
const manyOptions = { ...options, disciplines: [{ ...options.disciplines[0], targets: manyTargets }] };
assert.equal(validStudyScope({ discipline_key: 'discipline:1', target_keys: fullSelection }, manyOptions), true, 'saving 60 available topics is valid');
assert.equal(validStudyScope({ discipline_key: 'discipline:1', target_keys: [...fullSelection, 'topic:60'] }, manyOptions), false, 'saving 61 topics is invalid');
assert.equal(validStudyScope({ discipline_key: 'discipline:1', target_keys: [] }, options), false);
assert.equal(validStudyScope({ discipline_key: 'discipline:2', target_keys: ['topic:1'] }, options), false);
assert.equal(validStudyScope({ discipline_key: 'discipline:1', target_keys: ['topic:99'] }, options), false);
const deleted = { ...derivatives, key: 'topic:99', available: false };
assert.deepEqual(missingStudyTargets({ discipline_key: 'discipline:1', target_keys: ['topic:99'] }, options, { ...scope, targets: [deleted] }), [deleted]);

// A paid analysis may fail after the objective is saved: return that saved
// objective, so the caller cannot invite the learner to create a duplicate.
let writes = 0;
const saved = { id: 7, title: 'Resolver derivadas', study_scope: scope };
const failed = await createAndAnalyzeObjective({
  create: async () => { writes++; return saved; },
  analyze: async () => { throw new Error('Provedor indisponível'); },
}, { title: saved.title }, true);
assert.equal(writes, 1);
assert.equal(failed.objective, saved);
assert.equal(failed.analysisError, 'Provedor indisponível');
const manual = await createAndAnalyzeObjective({
  create: async () => saved,
  analyze: async () => { throw new Error('must not call AI'); },
}, { title: saved.title }, false);
assert.equal(manual.analysisError, null);
await assert.rejects(createAndAnalyzeObjective({
  create: async () => { throw new Error('save failed'); }, analyze: async () => saved,
}, { title: saved.title }, true), /save failed/);
console.log('objective study analysis helper checks passed');
