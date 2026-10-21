import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const helper = new URL('../src/app/study/_lib/discipline-resume.ts', import.meta.url);
assert.ok(existsSync(helper), 'study needs a validated discipline resume destination');
const compiled = ts.transpileModule(readFileSync(helper, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;
const module = {exports: {}};
new Function('exports', 'module', compiled)(module.exports, module);
const {getLastStudyDiscipline} = module.exports;
const resume = href => ({has_resume: true, href});
const disciplines = [{id: 1}, {id: 9}];
assert.deepEqual(getLastStudyDiscipline(resume('/study?tab=diverse&discipline_id=9&subject_id=8'), disciplines, true), {tab: 'diverse', disciplineId: 9});
assert.deepEqual(getLastStudyDiscipline(resume('/study?tab=coding&subject_id=2'), disciplines, true), {tab: 'coding', disciplineId: null});
assert.equal(getLastStudyDiscipline(resume('/study?tab=coding'), disciplines, false), null);
for (const href of ['/review', '/study?tab=diverse&discipline_id=8', '/study?tab=diverse&discipline_id=-1', '/study?tab=diverse', 'https://external.test/study?tab=diverse&discipline_id=9']) {
  assert.equal(getLastStudyDiscipline(resume(href), disciplines, true), null, href);
}
assert.equal(getLastStudyDiscipline({has_resume: false, href: '/study?tab=coding'}, disciplines, true), null);
console.log('last study discipline client checks passed');
