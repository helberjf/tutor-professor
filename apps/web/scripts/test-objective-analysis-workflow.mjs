import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sourceUrl = new URL('../src/lib/objective-analysis-workflow.ts', import.meta.url);
assert.ok(existsSync(sourceUrl), 'large objective histories need a resumable request driver');
const ts = require('typescript');
const compiled = ts.transpileModule(readFileSync(sourceUrl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { runObjectiveAnalysis } = module.exports;

const finalObjective = { id: 7, study_analysis: { progress_percent: 62 } };
const pending = (completed, total = 65) => ({ job_id: 'job-7', status: 'pending', completed_steps: completed, total_steps: total, objective: null });
const complete = { ...pending(65), status: 'complete', objective: finalObjective };
const progress = [];
let steps = 0;
const result = await runObjectiveAnalysis({
  start: async () => pending(0),
  step: async (id) => {
    assert.equal(id, 'job-7');
    steps += 1;
    return steps === 65 ? complete : pending(steps);
  },
}, (value) => progress.push(value));
assert.equal(result, finalObjective, 'only the full final diagnosis is returned');
assert.equal(steps, 65, 'histories are not capped at twelve requests');
assert.equal(progress.at(-1).completed_steps, 65);

let waits = 0;
let attempts = 0;
await runObjectiveAnalysis({
  start: async () => ({ ...pending(3), status: 'running' }),
  step: async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('connection lost'), { code: 'offline' });
    return complete;
  },
  pause: async () => { waits += 1; },
});
assert.equal(attempts, 2, 'a lost step response is retried using the same durable job');
assert.equal(waits, 2, 'an active claim and a connection failure both wait before retry');

const originalError = Object.assign(new Error('invalid provider answer'), { status: 502, code: 'http' });
attempts = 0;
await assert.rejects(runObjectiveAnalysis({
  start: async () => pending(5),
  step: async () => { attempts += 1; throw originalError; },
  pause: async () => {},
}), (error) => error === originalError);
assert.equal(attempts, 1, 'provider validation failures stay visible and can be manually resumed');

attempts = 0;
await assert.rejects(runObjectiveAnalysis({
  start: async () => pending(5),
  step: async () => { attempts += 1; throw Object.assign(new Error('offline'), { code: 'offline' }); },
  pause: async () => {},
}), /offline/);
assert.equal(attempts, 3, 'an offline connection cannot loop indefinitely');

await assert.rejects(runObjectiveAnalysis({
  start: async () => ({ ...complete, objective: null }),
  step: async () => { throw new Error('must not request a completed job'); },
}), /resultado/i, 'a missing final objective cannot be published');

waits = 0;
await assert.rejects(runObjectiveAnalysis({
  start: async () => ({ ...pending(2), status: 'running' }),
  step: async () => ({ ...pending(2), status: 'running' }),
  pause: async () => { waits += 1; },
}), /progresso.*salvo/i, 'a stalled claim eventually offers a resumable retry');
assert.ok(waits <= 80);
console.log('objective analysis workflow: 65 steps, resume, transient errors and validation passed');
