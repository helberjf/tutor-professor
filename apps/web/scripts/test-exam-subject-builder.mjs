import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const api = read('../src/lib/api.ts');
assert.match(api, /getExamSources: \(\) => fetchAPI<ExamSource\[\]>\('\/api\/exams\/sources'\)/);
assert.match(api, /createExamFromSubject:[\s\S]*?'\/api\/exams\/from-subject'/);
assert.match(api, /export type ExamSourceArea = 'coding' \| 'diverse' \| 'english';/, 'every study area can feed a simulado');

const builder = read('../src/components/exam/SubjectExamBuilder.tsx');
for (const label of ['Inglês', 'Matérias', 'Programação']) {
  assert.match(builder, new RegExp(label), `the subject picker should group the ${label} area`);
}
assert.match(builder, /api\.createExamFromSubject\(/, 'the builder must create through the subject endpoint');
assert.match(builder, /Atualizar simulado/, 'a subject that already has a simulado should offer to refresh it');
assert.match(builder, /Gere questões em Estudar/, 'an account with no questions should be told where they come from');

const list = read('../src/components/exam/ExamList.tsx');
assert.match(list, /<SubjectExamBuilder onCreated=/, 'the simulado list should host the subject builder');
assert.ok(
  list.indexOf('<SubjectExamBuilder') < list.indexOf('function ExamCards'),
  'the builder must render outside the loading branch so its confirmation survives the reload',
);

console.log('exam subject builder checks passed.');
