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
const { toStudyScopeInput, toggleStudyTarget, filterStudyTargets, validStudyScope, missingStudyTargets, createAndAnalyzeObjective, studyAiUnavailableMessage } = module.exports;

const limits = { key: 'topic:1', title: 'Limites', subject: 'Cálculo', topic_id: 1, subject_id: 10, available: true };
const derivatives = { key: 'topic:2', title: 'Derivação', subject: 'Cálculo', topic_id: 2, subject_id: 10, available: true };
const geometry = { key: 'topic:3', title: 'Triângulos', subject: 'Geometria', topic_id: 3, subject_id: 11, available: true };
const options = { disciplines: [{ key: 'discipline:1', name: 'Matemática', targets: [limits, derivatives, geometry] }], ai_available: true, ai_unavailable_reason: null };
const scope = { discipline_key: 'discipline:1', discipline: 'Matemática', targets: [limits, derivatives], available: true };
assert.equal(toStudyScopeInput(null), null);
assert.deepEqual(toStudyScopeInput(scope), { discipline_key: 'discipline:1', target_keys: ['topic:1', 'topic:2'] });
assert.deepEqual(toggleStudyTarget(['topic:1'], 'topic:2'), ['topic:1', 'topic:2']);
assert.deepEqual(toggleStudyTarget(['topic:1', 'topic:2'], 'topic:1'), ['topic:2']);
const fullSelection = Array.from({ length: 30 }, (_, index) => `topic:${index}`);
assert.deepEqual(toggleStudyTarget(fullSelection, 'topic:31'), fullSelection, 'selection respects the server limit');
assert.match(studyAiUnavailableMessage('no_config'), /chave de API/);
assert.match(studyAiUnavailableMessage('no_credits'), /créditos/);
assert.deepEqual(filterStudyTargets(options.disciplines[0].targets, 'derivacao', ''), [derivatives]);
assert.deepEqual(filterStudyTargets(options.disciplines[0].targets, '', 'Geometria'), [geometry]);
assert.deepEqual(filterStudyTargets(options.disciplines[0].targets, 'limites', 'Geometria'), []);
assert.equal(validStudyScope(toStudyScopeInput(scope), options), true);
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
