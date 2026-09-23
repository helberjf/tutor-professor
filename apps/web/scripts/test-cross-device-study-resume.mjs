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
const sessionPage = read('src/app/session/page.tsx');
const lessonPage = read('src/app/lesson/page.tsx');
const reviewPage = read('src/app/review/page.tsx');

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
  /href=\{resumeDestination\.href\}/,
  'continue must use the canonical server destination instead of a fixed route',
);
assert.match(
  homePage,
  /resume\.label \|\| describeRemaining\(state\)/,
  'the resolved destination should keep the server-owned subject or lesson label',
);
assert.match(
  homePage,
  /\{resumeDestination\.label\}/,
  'continue should display the subject or lesson it will reopen',
);

assert.match(studyPage, /get\('mode'\)/, 'the study page should restore the programming mode');
assert.match(studyPage, /get\('subject_id'\)/, 'the study page should restore the programming subject');
assert.match(studyPage, /get\('topic_id'\)/, 'the study page should restore the programming topic');
assert.match(
  studyPage,
  /if \(loading && \(activeTab === 'english' \|\| activeTab === 'dashboard'\)\)/,
  'coding resume must render without waiting for the unrelated dashboard request',
);
assert.doesNotMatch(
  studyPage,
  /import \{ (?:CodingCurriculum|SyntaxCodeBlock|DashboardOverview|StudyStatisticsPanel) \}/,
  'the study route must not eagerly import unused heavy components',
);
assert.match(codingTab, /initialSubjectId/, 'the coding tab should forward the requested subject');
assert.match(codingTab, /initialTopicId/, 'the coding tab should forward the requested topic');
assert.match(
  codingCurriculum,
  /loadTopics\(requestedSubject, initialTopicId\)[\s\S]*loadedTopics\.find\([\s\S]{0,120}requestedTopicId/,
  'the programming curriculum should open the requested topic after loading it',
);
assert.match(
  codingCurriculum,
  /loadSubjects\(1, 'last_used', Boolean\(initialSubjectId\)\)[\s\S]{0,320}\[initialSubjectId\]/,
  'a subject id that arrives after mount must still restore the requested subject',
);
assert.match(
  codingCurriculum,
  /async function loadTopics[\s\S]{0,500}rememberStudyLocation\(\{[\s\S]{0,180}kind: 'coding_subject'/,
  'opening a subject must save the bookmark before its topics finish loading',
);
assert.doesNotMatch(
  codingCurriculum,
  /Promise\.all\(\[[\s\S]{0,240}getCodingSubjectPage[\s\S]{0,240}getCodingSubject/,
  'direct resume must not wait for the general subject page before opening the subject',
);
assert.doesNotMatch(
  codingCurriculum,
  /Promise\.all\(\[[\s\S]{0,160}getCodingTopics[\s\S]{0,160}getMyAICredits/,
  'topic rendering must not wait for the unrelated AI credit balance',
);
for (const kind of ['coding_subject', 'coding_topic', 'coding_questions', 'coding_flashcards']) {
  assert.match(
    codingCurriculum,
    new RegExp(`kind: '${kind}'`),
    `the programming curriculum should remember ${kind}`,
  );
}

assert.match(sessionPage, /kind: 'guided_session'/, 'a loaded guided session should become resumable');
assert.match(lessonPage, /kind: 'language_lesson'/, 'a loaded language lesson should become resumable');
assert.match(reviewPage, /kind: 'language_review'/, 'a non-empty review should become resumable');
assert.match(studyPage, /get\('date'\)/, 'a deep link should restore its study date');
// "Outras matérias" use the curriculum too; a subject link only opens in the
// list it came from, so a programming id never lands in the general list.
assert.match(
  studyPage,
  /curriculumResumeTarget\.tab === activeTab \? curriculumResumeTarget\.subjectId : null/,
  'a subject deep link applies only to the tab it names',
);

console.log('cross-device study resume tests passed');
