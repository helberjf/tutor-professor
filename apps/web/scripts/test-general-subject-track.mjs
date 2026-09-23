/**
 * "Outras matérias" are studied on the same screens as programming.
 *
 * What has to hold: the general list talks to /api/general and programming to
 * /api/coding through one set of calls; the LeetCode trainer stays on the
 * programming side; and "Nova matéria" comes with a "Sugerir matéria por IA?"
 * button that only fills the form.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const api = read('../src/lib/api.ts');
const context = read('../src/components/coding/curriculum-context.tsx');
const curriculum = read('../src/components/coding/CodingCurriculum.tsx');
const createSubject = read('../src/components/coding/CreateSubjectModal.tsx');
const codingTab = read('../src/app/study/_components/CodingTab.tsx');
const studyPage = read('../src/app/study/page.tsx');

// ── One set of calls, two lists ──────────────────────────────────────────────
assert.match(api, /return track === 'general' \? '\/api\/general' : '\/api\/coding';/);
assert.match(api, /\.\.\.createCurriculumApi\('\/api\/coding'\),/, 'the default client keeps serving programming');
const factory = api.slice(api.indexOf('export function createCurriculumApi'), api.indexOf('export type CurriculumApi'));
assert.doesNotMatch(factory, /\/api\/coding/, 'the shared calls never hard-code the programming prefix');
assert.doesNotMatch(factory, /leetcode/i, 'the LeetCode trainer is not part of the shared calls');
assert.match(factory, /suggestSubject:/, 'both lists can ask for a suggested subject');
assert.match(context, /createCurriculumApi\(curriculumBase\(track\)\)/, 'screens call the list they belong to');

// ── The study page opens the same tab for both lists ──────────────────────
assert.match(studyPage, /track=\{activeTab === 'coding' \? 'programming' : 'general'\}/);
assert.match(codingTab, /<CurriculumTrackProvider track=\{track\}>/);
assert.match(codingTab, /setCodingMode\('exam'\)/, 'the simulado mode is there for every list');

// ── LeetCode only for programming ───────────────────────────────────────────
assert.match(
  curriculum,
  /\{!general && \(\s*<button[\s\S]*?leetcode-trainer-card/,
  'the LeetCode trainer entry is hidden on the general list',
);

// ── "Sugerir matéria por IA?" next to "Nova Matéria" ───────────────────────
assert.match(curriculum, /setShowCreateSubject\('suggest'\)[\s\S]*?Sugerir matéria por IA\?/);
assert.match(curriculum, /autoSuggest=\{showCreateSubject === 'suggest'\}/);
assert.match(createSubject, /await curriculum\.suggestSubject\(\)/);
assert.match(createSubject, /setName\(suggestion\.name\)/, 'the suggestion fills the form instead of saving');
assert.doesNotMatch(
  createSubject.slice(createSubject.indexOf('async function suggestSubject'), createSubject.indexOf('useEffect(')),
  /createCodingSubject/,
  'suggesting never creates the subject by itself',
);

console.log('general subject track checks passed');
