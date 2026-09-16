/** Cross-device resume must be server-owned and must restore deep study routes. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => {
  const path = resolve(root, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const apiClient = read('src/lib/api.ts');
const resumeClient = read('src/lib/study-resume.ts');
const homePage = read('src/app/page.tsx');
const studyPage = read('src/app/study/page.tsx');
const codingTab = read('src/app/study/_components/CodingTab.tsx');
const codingCurriculum = read('src/components/coding/CodingCurriculum.tsx');

assert.match(apiClient, /export interface StudyResume\s*{/, 'the API client needs a resume result type');
assert.match(apiClient, /getStudyResume:/, 'the API client needs to read the server bookmark');
assert.match(apiClient, /saveStudyResume:/, 'the API client needs to save the server bookmark');
assert.match(
  resumeClient,
  /export function rememberStudyLocation/,
  'screens need one non-blocking bookmark helper',
);
assert.match(
  resumeClient,
  /api\.saveStudyResume\(payload\)\.catch/,
  'bookmark failures must never block studying',
);
assert.match(homePage, /api\.getStudyResume\(\)/, 'home should load the latest study destination');
assert.match(
  homePage,
  /href=\{studyResume\.href\}/,
  'continue must use the canonical server destination instead of a fixed route',
);
assert.match(
  homePage,
  /studyResume\??\.label/,
  'continue should name the subject or lesson it will reopen',
);

assert.match(studyPage, /get\('mode'\)/, 'the study page should restore the programming mode');
assert.match(studyPage, /get\('subject_id'\)/, 'the study page should restore the programming subject');
assert.match(studyPage, /get\('topic_id'\)/, 'the study page should restore the programming topic');
assert.match(codingTab, /initialSubjectId/, 'the coding tab should forward the requested subject');
assert.match(codingTab, /initialTopicId/, 'the coding tab should forward the requested topic');
assert.match(
  codingCurriculum,
  /loadTopics\(requestedSubject, initialTopicId\)[\s\S]*loadedTopics\.find\([\s\S]{0,120}requestedTopicId/,
  'the programming curriculum should open the requested topic after loading it',
);
for (const kind of ['coding_subject', 'coding_topic', 'coding_questions', 'coding_flashcards']) {
  assert.match(
    codingCurriculum,
    new RegExp(`kind: '${kind}'`),
    `the programming curriculum should remember ${kind}`,
  );
}

console.log('cross-device study resume tests passed');
