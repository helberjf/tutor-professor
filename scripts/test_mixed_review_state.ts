import assert from 'node:assert/strict';

import {
  advanceMixedReview,
  beginMixedReviewAdvancement,
  beginMixedReviewSubmission,
  buildReviewAttemptPayload,
  captureReviewAttempt,
  createMixedReviewState,
  revealMixedReviewLessonAnswer,
  isReviewAttemptCompletionCurrent,
  runLessonQuestionGeneration,
} from '../apps/web/src/lib/mixed-review-state.ts';
import { isUncertainLessonQuestionGenerationError } from '../apps/web/src/lib/lesson-question-state.ts';

const vocabularyCard = {
  card_type: 'vocabulary' as const,
  review_item_id: 17,
  word_en: 'bonjour',
  word_pt: 'olá',
};
const lessonQuestionCard = {
  card_type: 'lesson_question' as const,
  lesson_question_id: 29,
};

assert.deepEqual(buildReviewAttemptPayload(vocabularyCard, true), {
  card_type: 'vocabulary',
  review_item_id: 17,
  word_en: 'bonjour',
  word_pt: 'olá',
  correct: true,
});
assert.deepEqual(buildReviewAttemptPayload(lessonQuestionCard, false), {
  card_type: 'lesson_question',
  lesson_question_id: 29,
  correct: false,
});

const attemptOnFirstQueue = captureReviewAttempt(1, vocabularyCard);
assert.equal(
  isReviewAttemptCompletionCurrent(attemptOnFirstQueue, 1, vocabularyCard),
  true,
  'the same epoch and card may complete its attempt',
);
assert.equal(
  isReviewAttemptCompletionCurrent(attemptOnFirstQueue, 2, {
    ...vocabularyCard,
    review_item_id: 31,
  }),
  false,
  'installing a fresh queue invalidates an old attempt completion',
);
assert.equal(
  isReviewAttemptCompletionCurrent(attemptOnFirstQueue, 1, {
    ...vocabularyCard,
    review_item_id: 31,
  }),
  false,
  'a different active card in the same epoch also rejects the old completion',
);

const revealed = {
  ...createMixedReviewState(2),
  flipped: true,
  lessonAnswerRevealed: true,
};
const firstSubmission = beginMixedReviewSubmission(revealed);
assert.equal(firstSubmission.accepted, true);
const ratedSubmission = {
  ...firstSubmission.state,
  chosenConfidence: 3 as const,
};
const duplicateSubmission = beginMixedReviewSubmission(ratedSubmission);
assert.equal(duplicateSubmission.accepted, false, 'a second click cannot submit or advance twice');

const next = advanceMixedReview(ratedSubmission);
assert.equal(next.currentIndex, 1, 'the accepted submission advances exactly once');
assert.equal(next.flipped, false, 'the next vocabulary card starts on its front');
assert.equal(next.chosenConfidence, null, 'the next vocabulary card has no previous rating');
assert.equal(next.lessonAnswerRevealed, false, 'the next lesson question starts hidden');
assert.equal(next.submissionLocked, false, 'the next card accepts one new answer');
assert.equal(next.completed, false);

const firstLesson = revealMixedReviewLessonAnswer(createMixedReviewState(2));
assert.equal(firstLesson.accepted, true);
const lessonSubmission = beginMixedReviewSubmission(firstLesson.state);
assert.equal(lessonSubmission.accepted, true);
const lessonAdvancement = beginMixedReviewAdvancement(lessonSubmission.state);
assert.equal(lessonAdvancement.accepted, true);
assert.equal(
  revealMixedReviewLessonAnswer(lessonAdvancement.state).accepted,
  false,
  'reveal is ignored while a lesson card is advancing',
);
assert.equal(
  beginMixedReviewAdvancement(lessonAdvancement.state).accepted,
  false,
  'the same lesson answer cannot start a second advancement',
);
const consecutiveLesson = advanceMixedReview(lessonAdvancement.state);
assert.equal(consecutiveLesson.currentIndex, 1);
assert.equal(consecutiveLesson.lessonAnswerRevealed, false);
assert.equal(consecutiveLesson.submissionLocked, false);
assert.equal(consecutiveLesson.advancementLocked, false);
assert.equal(revealMixedReviewLessonAnswer(consecutiveLesson).accepted, true);

const completed = advanceMixedReview({ ...next, currentIndex: 1, submissionLocked: true });
assert.equal(completed.currentIndex, 1);
assert.equal(completed.completed, true);

const confirmedEvents: string[] = [];
const confirmed = await runLessonQuestionGeneration({
  lessonId: 4,
  generate: async () => {
    confirmedEvents.push('generate');
    return Array.from({ length: 5 }, (_, index) => ({ id: index + 1, lesson_id: 4 }));
  },
  validate: (questions) => questions,
  reload: async () => {
    confirmedEvents.push('reload');
    return true;
  },
  isCurrent: () => true,
  isUncertainError: () => false,
});
assert.deepEqual(confirmedEvents, ['generate', 'reload']);
assert.deepEqual(confirmed, { kind: 'confirmed', count: 5, reloaded: true });

for (const uncertainError of [
  Object.assign(new Error('offline'), { code: 'offline' }),
  Object.assign(new Error('parse'), { code: 'parse' }),
  Object.assign(new Error('server'), { status: 503 }),
]) {
  let reloads = 0;
  const result = await runLessonQuestionGeneration({
    lessonId: 4,
    generate: async () => { throw uncertainError; },
    validate: (questions) => questions,
    reload: async () => { reloads += 1; return true; },
    isCurrent: () => true,
    isUncertainError: isUncertainLessonQuestionGenerationError,
  });
  assert.deepEqual(result, { kind: 'uncertain', reloaded: true });
  assert.equal(reloads, 1, 'uncertain outcomes must reconcile the review queue');
}

let definiteReloads = 0;
const definiteError = Object.assign(new Error('bad request'), { status: 422 });
const definite = await runLessonQuestionGeneration({
  lessonId: 4,
  generate: async () => { throw definiteError; },
  validate: (questions) => questions,
  reload: async () => { definiteReloads += 1; return true; },
  isCurrent: () => true,
  isUncertainError: isUncertainLessonQuestionGenerationError,
});
assert.equal(definite.kind, 'definite_failure');
assert.equal(definite.error, definiteError);
assert.equal(definiteReloads, 0, 'definite 4xx failures must not trigger reconciliation');

let mounted = true;
let activeToken = 7;
let releaseGeneration!: (questions: Array<{ id: number; lesson_id: number }>) => void;
const pending = runLessonQuestionGeneration({
  lessonId: 4,
  generate: () => new Promise((resolve) => { releaseGeneration = resolve; }),
  validate: (questions) => questions,
  reload: async () => true,
  isCurrent: () => mounted && activeToken === 7,
  isUncertainError: () => false,
});
activeToken = 8;
releaseGeneration(Array.from({ length: 5 }, (_, index) => ({ id: index + 1, lesson_id: 4 })));
assert.deepEqual(await pending, { kind: 'stale' }, 'a superseded token cannot update state');

const unmounted = runLessonQuestionGeneration({
  lessonId: 4,
  generate: async () => Array.from({ length: 5 }, (_, index) => ({ id: index + 1, lesson_id: 4 })),
  validate: (questions) => questions,
  reload: async () => true,
  isCurrent: () => mounted,
  isUncertainError: () => false,
});
mounted = false;
assert.deepEqual(await unmounted, { kind: 'stale' }, 'an unmounted screen cannot update state');

console.log('Mixed language review state checks passed.');
