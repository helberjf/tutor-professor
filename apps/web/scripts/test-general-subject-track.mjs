/**
 * "Outras disciplinas": Francês or Direito are disciplines like Programação.
 *
 * What has to hold: a discipline holds subjects the way programming does, all
 * through one set of calls (/api/general scoped by discipline, /api/coding for
 * programming); the LeetCode trainer stays on the programming side; "Criar nova
 * disciplina" sits next to the discipline list; inside a discipline "Nova
 * matéria" comes with "Sugerir matéria por IA?", and a subject's lessons can be
 * laid out as a course.
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
assert.match(context, /createCurriculumApi\(curriculumBase\(track\), disciplineId\)/, 'screens call the list they belong to');
assert.match(factory, /discipline_id=\$\{disciplineId\}/, 'a discipline scopes the calls that list or add subjects');

// ── The study page opens the same tab for both lists ──────────────────────
assert.match(studyPage, /track=\{activeTab === 'coding' \? 'programming' : 'general'\}/);
assert.match(codingTab, /<CurriculumTrackProvider\s+track=\{track\}\s+disciplineId=\{discipline\?\.id \?\? null\}/);
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

// ── "Abrir lista de disciplinas" lists each discipline, with a create button ─
const picker = read('../src/app/study/_components/OtherSubjectsPicker.tsx');
assert.match(picker, /Abrir lista de disciplinas/);
assert.match(picker, /disciplines\.map\(\(discipline\) => \(\s*<option key=\{discipline\.id\} value=\{`discipline:\$\{discipline\.id\}`\}>/, 'every discipline is its own entry');
assert.match(picker, /\{codingEnabled \? <option value="coding">/, 'programming is one more entry once its module is on');
assert.match(picker, /Criar nova disciplina"\)\} <Plus/, 'the create button sits next to the list');
assert.match(studyPage, /label=\{translate\("Outras Disciplinas"\)\}/);
assert.match(studyPage, /requestCurriculum\('diverse', Number\(value\.slice\('discipline:'\.length\)\)\)/, 'picking a discipline opens it');
assert.match(studyPage, /onCreated=\{\(discipline\) => \{[\s\S]*?requestCurriculum\('diverse', discipline\.id\)/, 'a new discipline opens right away');
assert.match(studyPage, /discipline=\{activeTab === 'diverse' \? activeDiscipline : null\}/, 'the curriculum shows the discipline on screen');
assert.match(api, /createStudyDiscipline:[\s\S]*?'\/api\/general\/disciplines'/);
assert.match(curriculum, /onCreated=\{\(created\) => \{[\s\S]*?openSubject\(created\);/, 'a new subject opens right away to build its course');

// ── Inside a discipline, lessons form a course ─────────────────────────────
assert.match(factory, /generateCourseOutline:[\s\S]*?\/topics\/generate-outline/);
assert.match(curriculum, /await curriculum\.generateCourseOutline\(subject\.id, \{/);
assert.match(curriculum, /Montar curso com IA/);

console.log('general subject track checks passed');
