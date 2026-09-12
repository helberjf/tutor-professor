/**
 * "Continuar de onde parou" has to be the first thing on the screen, and true.
 *
 * These are source checks on the promises the screens make, the ones a refactor
 * could quietly drop:
 *
 *  - the home screen reads the queue state without creating a session, so
 *    opening the app never silently starts one;
 *  - the continue button is rendered only when there is something to continue,
 *    sits beside "Iniciar estudos", and says how much is left;
 *  - the session screen resumes from the stored position instead of index 0,
 *    saves the bookmark after each answer, and closes the day when it ends;
 *  - answers are recorded through the endpoints that already own each card type,
 *    so the metrics and the level ladder keep working.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const homePage = read('src/app/page.tsx');
const sessionPage = read('src/app/session/page.tsx');
const onboardingPage = read('src/app/onboarding/page.tsx');
const loginPage = read('src/app/login/page.tsx');
const apiClient = read('src/lib/api.ts');
const privateRoutes = read('src/lib/private-routes.ts');
const englishTab = read('src/app/study/_components/EnglishTab.tsx');
const questionsPanel = read('src/components/questions/StudyQuestionsPanel.tsx');

// ── home ───────────────────────────────────────────────────────────────────
assert.match(
  homePage,
  /api\.getStudySessionState\(\)/,
  'the home screen should read the queue state on load',
);
assert.doesNotMatch(
  homePage,
  /api\.startStudySession/,
  'rendering the home screen must never start a session by itself',
);
assert.match(
  homePage,
  /hasOpenSession\s*&&\s*\(\s*<Link\s+href="\/session"/,
  'the continue button should only render when there is an open session',
);
assert.match(
  homePage,
  /Continuar de onde parou[\s\S]{0,1500}Iniciar estudos/,
  'continuing should come before starting over, not after it',
);
assert.match(homePage, /remainingLabel/, 'the continue button should say how much is left');
assert.match(
  homePage,
  /function describeRemaining/,
  'the remaining label should come from a named helper, not inline string maths',
);
assert.match(
  homePage,
  /Faltam \$\{items\}/,
  'the label should count the items the student still owes',
);

// ── the session screen ─────────────────────────────────────────────────────
assert.match(sessionPage, /api\.startStudySession/, 'the session screen builds or resumes the queue');
assert.match(
  sessionPage,
  /const resumeAt = Math\.min\(Math\.max\(data\.position, 0\), data\.total\)/,
  'the session must open on the stored position, not on the first card',
);
assert.match(
  sessionPage,
  /api\s*\n?\s*\.saveStudySessionProgress|api\.saveStudySessionProgress/,
  'the bookmark should be saved as the student advances',
);
assert.match(sessionPage, /api\.finishStudySession/, 'finishing the queue should close the session');
assert.match(
  sessionPage,
  /api\.submitReviewAttempt[\s\S]*card_type: 'vocabulary'/,
  'vocabulary cards must be recorded through the review endpoint',
);
assert.match(
  sessionPage,
  /api\.submitStudyQuestionAttempt/,
  'study questions must be recorded through their own endpoint',
);
assert.match(
  sessionPage,
  /api\.completeLesson/,
  'finishing a lesson inside the session should mark the lesson complete',
);
assert.match(
  sessionPage,
  /O dia já foi marcado como estudado|O dia ja foi marcado como estudado/,
  'the summary should tell the student the day is closed',
);

// ── the API client ─────────────────────────────────────────────────────────
for (const method of [
  'getStudySessionState',
  'startStudySession',
  'saveStudySessionProgress',
  'finishStudySession',
  'ensureStudyQuestions',
  'prefetchStudyQuestions',
  'getOnboardingState',
  'getPlacementQuestions',
  'completeOnboarding',
]) {
  assert.match(apiClient, new RegExp(`${method}:`), `api client should expose ${method}`);
}

// ── the new screens are behind the login like every other app page ─────────
assert.match(privateRoutes, /'\/session'/, '/session should be a private route');
assert.match(privateRoutes, /'\/onboarding'/, '/onboarding should be a private route');

// ── onboarding ─────────────────────────────────────────────────────────────
assert.match(onboardingPage, /api\.getPlacementQuestions/, 'onboarding should offer the placement test');
assert.match(onboardingPage, /api\.completeOnboarding/, 'onboarding should save the profile it collected');
assert.match(
  onboardingPage,
  /Pular e começar do início|Pular e comecar do inicio/,
  'the placement test must be skippable',
);
assert.match(
  loginPage,
  /destinationAfterLogin/,
  'a first login should be able to land on the guided first run',
);
assert.match(
  loginPage,
  /if \(next !== '\/'\) return next;/,
  'an explicit ?next= link must always win over the onboarding redirect',
);

// ── the day closes by studying ─────────────────────────────────────────────
assert.match(
  englishTab,
  /closedByActivity/,
  'the English goal should close from activity, not only from typed text',
);
assert.match(
  englishTab,
  /const goalMet = hasStudyText \|\| closedByActivity/,
  'writing a note must stay optional once the day was studied',
);

// ── the question panel ─────────────────────────────────────────────────────
assert.match(
  questionsPanel,
  /api\.ensureStudyQuestions/,
  'an empty topic should fill itself from the lesson before showing an empty state',
);
assert.match(
  questionsPanel,
  /buildPracticeQueue\(questions, \{ includeMastered: replayAll \}\)/,
  'practice should start from what is owed, with an explicit way to redo everything',
);
assert.match(
  questionsPanel,
  /Praticar o que falta/,
  'the primary button should say it practises what is missing',
);
assert.match(
  questionsPanel,
  /prefetchStudyQuestions/,
  'a topic running low should be topped up in the background',
);

console.log('study session resume tests passed');
