import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/lib/diverse-question-state.ts', import.meta.url);
const apiUrl = new URL('../src/lib/api.ts', import.meta.url);

let source;
try {
  source = readFileSync(helperUrl, 'utf8');
} catch {
  assert.fail('Expected diverse-question-state.ts to exist');
}

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const apiSource = readFileSync(apiUrl, 'utf8');
const compiledApi = ts.transpileModule(apiSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const apiModule = { exports: {} };
new Function('exports', 'module', 'require', compiledApi)(
  apiModule.exports,
  apiModule,
  () => ({}),
);
const { ApiError } = apiModule.exports;

const {
  appendTopicToSubjectById,
  clearDraftForRemovedSubject,
  findItemIndexById,
  resolveItemsByIds,
  resolveDiverseGenerationTarget,
  mergeGeneratedDiverseQuestions,
  generateAndSynchronizeDiverseQuestions,
  isUncertainDiverseGenerationError,
  updateItemById,
  updateSubjectById,
  reconcileStudyQueueByTopicIds,
} = module.exports;

assert.equal(
  isUncertainDiverseGenerationError(new ApiError('offline after POST', { code: 'offline' })),
  true,
  'offline ApiError is an uncertain generation outcome',
);
assert.equal(
  isUncertainDiverseGenerationError(new ApiError('unreadable response', { code: 'parse' })),
  true,
  'parse ApiError is an uncertain generation outcome',
);
assert.equal(isUncertainDiverseGenerationError(new TypeError('Failed to fetch')), true);
assert.equal(
  isUncertainDiverseGenerationError(new ApiError('validation', { status: 422, code: 'http' })),
  false,
  'ordinary API validation errors remain retry-safe errors',
);
assert.equal(
  isUncertainDiverseGenerationError(new ApiError('conflict', { status: 409, code: 'http' })),
  false,
  '409 keeps its dedicated recovery behavior',
);

const replacement = Object.freeze({ id: 'subject-replacement', topics: [] });
const target = Object.freeze({ id: 'subject-target', topics: [] });
const reordered = Object.freeze([replacement, target]);
assert.equal(findItemIndexById(reordered, 'subject-target'), 1);
const updated = updateSubjectById(reordered, 'subject-target', (subject) => ({
  ...subject,
  topics: [{ id: 'question-new' }],
}));
assert.strictEqual(updated[0], replacement, 'reordering must not redirect a preview to the old index');
assert.deepEqual(updated[1].topics, [{ id: 'question-new' }]);

const removed = Object.freeze([replacement]);
assert.equal(findItemIndexById(removed, 'subject-target'), -1);
assert.strictEqual(
  updateSubjectById(removed, 'subject-target', () => {
    assert.fail('a removed preview subject must not update its replacement');
  }),
  removed,
);
const targetDraft = Object.freeze({ subjectId: 'subject-target', lesson: {} });
assert.equal(clearDraftForRemovedSubject(targetDraft, 'subject-target'), null);
assert.strictEqual(clearDraftForRemovedSubject(targetDraft, 'subject-other'), targetDraft);

const valid = Object.freeze({ id: 'question-valid', topic: 'Valid', done: false, review_count: 0 });
const resolved = resolveItemsByIds([valid], ['question-missing', 'question-valid']);
assert.deepEqual(resolved, [valid], 'dangling references must be skipped without shifting identity');
const visibleTopicId = resolved[0].id;
const toggled = updateItemById([valid], visibleTopicId, (topic) => ({ ...topic, done: true }));
assert.equal(toggled[0].done, true);
const edited = updateItemById(toggled, visibleTopicId, (topic) => ({ ...topic, topic: 'Edited' }));
assert.equal(edited[0].topic, 'Edited');
const rated = updateItemById(edited, visibleTopicId, (topic) => ({ ...topic, review_count: topic.review_count + 1 }));
assert.equal(rated[0].review_count, 1);

const suggestedTopic = Object.freeze({ id: 'question-suggested', topic: 'AI suggestion' });
const suggestionAfterReorder = appendTopicToSubjectById(reordered, 'subject-target', suggestedTopic);
assert.strictEqual(suggestionAfterReorder[0], replacement, 'a reordered suggestion must not write to the previous index');
assert.deepEqual(suggestionAfterReorder[1].topics, [suggestedTopic]);
assert.strictEqual(
  appendTopicToSubjectById(removed, 'subject-target', suggestedTopic),
  removed,
  'a removed suggestion target must leave its replacement untouched',
);

const generationDay = Object.freeze({
  custom_subjects: Object.freeze([
    replacement,
    Object.freeze({
      id: 'subject-target',
      topics: [],
      lessons: Object.freeze([
        Object.freeze({ id: 'lesson-other', title: 'Other', topic_ids: [] }),
        Object.freeze({ id: 'lesson-target', title: 'Target', topic_ids: [] }),
      ]),
    }),
  ]),
});
const generationTarget = resolveDiverseGenerationTarget(generationDay, 'subject-target', 'lesson-target');
assert.equal(generationTarget?.subjectIndex, 1, 'the backend index must be resolved after subjects reorder');
assert.equal(generationTarget?.subject.id, 'subject-target');
assert.equal(generationTarget?.lesson.id, 'lesson-target');
assert.equal(
  resolveDiverseGenerationTarget(generationDay, 'subject-target', 'lesson-missing'),
  null,
  'a removed lesson must not redirect generation to another lesson',
);
assert.equal(
  resolveDiverseGenerationTarget(generationDay, 'subject-missing', 'lesson-target'),
  null,
  'a removed subject must not redirect generation to its old index',
);

const savedGenerationDay = Object.freeze({
  ...generationDay,
  custom_subjects: Object.freeze([
    replacement,
    Object.freeze({
      id: 'subject-target',
      topics: Object.freeze([
        Object.freeze({ id: 'question-old', topic: 'Old', answer: 'Preserved', review_count: 3 }),
      ]),
      lessons: Object.freeze([
        Object.freeze({ id: 'lesson-other', title: 'Other', topic_ids: Object.freeze([]) }),
        Object.freeze({ id: 'lesson-target', title: 'Target', topic_ids: Object.freeze(['question-old']) }),
      ]),
    }),
  ]),
});
const generatedQuestions = Object.freeze([
  Object.freeze({ id: 'question-new-1', topic: 'New 1', answer: 'Answer 1' }),
  Object.freeze({ id: 'question-new-2', topic: 'New 2', answer: 'Answer 2' }),
]);
const mergedGenerationDay = mergeGeneratedDiverseQuestions(
  savedGenerationDay,
  'subject-target',
  'lesson-target',
  generatedQuestions,
);
const mergedTarget = resolveDiverseGenerationTarget(mergedGenerationDay, 'subject-target', 'lesson-target');
assert.deepEqual(
  mergedTarget.subject.topics.map((topic) => topic.id),
  ['question-old', 'question-new-1', 'question-new-2'],
  'confirmed generated topics append without replacing old questions',
);
assert.equal(mergedTarget.subject.topics[0].review_count, 3, 'old review state is preserved');
assert.deepEqual(
  mergedTarget.lesson.topic_ids,
  ['question-old', 'question-new-1', 'question-new-2'],
  'confirmed generated IDs append to the target lesson once',
);
assert.strictEqual(
  mergeGeneratedDiverseQuestions(
    mergedGenerationDay,
    'subject-target',
    'lesson-target',
    generatedQuestions,
  ),
  mergedGenerationDay,
  'merging the same POST response twice is idempotent',
);

let generateCalls = 0;
let refreshCalls = 0;
const partialSyncEvents = [];
const partialSyncOutcome = await generateAndSynchronizeDiverseQuestions({
  savedDay: savedGenerationDay,
  subjectId: 'subject-target',
  lessonId: 'lesson-target',
  generate: async () => {
    generateCalls += 1;
    partialSyncEvents.push('generate');
    return generatedQuestions;
  },
  installConfirmed: (confirmedDay) => {
    partialSyncEvents.push('install');
    assert.deepEqual(
      resolveDiverseGenerationTarget(confirmedDay, 'subject-target', 'lesson-target').lesson.topic_ids,
      ['question-old', 'question-new-1', 'question-new-2'],
    );
  },
  refresh: async () => {
    refreshCalls += 1;
    partialSyncEvents.push('refresh');
    throw new Error('temporary GET failure');
  },
});
assert.equal(generateCalls, 1);
assert.equal(refreshCalls, 1);
assert.equal(partialSyncOutcome.synchronized, false);
assert.deepEqual(partialSyncEvents, ['generate', 'install', 'refresh'], 'confirmed state installs before GET synchronization');
assert.deepEqual(
  resolveDiverseGenerationTarget(partialSyncOutcome.day, 'subject-target', 'lesson-target').lesson.topic_ids,
  ['question-old', 'question-new-1', 'question-new-2'],
  'POST success plus GET failure resolves with the confirmed merged state',
);

let refreshAfterFailedPost = false;
await assert.rejects(
  generateAndSynchronizeDiverseQuestions({
    savedDay: savedGenerationDay,
    subjectId: 'subject-target',
    lessonId: 'lesson-target',
    generate: async () => { throw new Error('POST conflict'); },
    refresh: async () => { refreshAfterFailedPost = true; return savedGenerationDay; },
  }),
  /POST conflict/,
  'POST failures still reject for the existing conflict recovery path',
);
assert.equal(refreshAfterFailedPost, false);

const activeQueue = Object.freeze({
  order: Object.freeze([0, 1]),
  position: 1,
  userAnswer: 'draft for b',
  revealed: true,
  results: Object.freeze(['knew']),
  done: false,
});
const appendedActiveQueue = reconcileStudyQueueByTopicIds(
  activeQueue,
  ['question-a', 'question-b'],
  ['question-a', 'question-b', 'question-c', 'question-d', 'question-e', 'question-f', 'question-g'],
);
assert.deepEqual(appendedActiveQueue.order, [0, 1, 2, 3, 4, 5, 6]);
assert.equal(appendedActiveQueue.position, 1);
assert.deepEqual(appendedActiveQueue.results, ['knew']);
assert.equal(appendedActiveQueue.userAnswer, 'draft for b');
assert.equal(appendedActiveQueue.revealed, true);
assert.equal(appendedActiveQueue.done, false);
assert.deepEqual(
  reconcileStudyQueueByTopicIds(
    appendedActiveQueue,
    ['question-a', 'question-b', 'question-c', 'question-d', 'question-e', 'question-f', 'question-g'],
    ['question-a', 'question-b', 'question-c', 'question-d', 'question-e', 'question-f', 'question-g'],
  ),
  appendedActiveQueue,
  'the same generated IDs must never be queued twice',
);

const completedQueue = Object.freeze({
  order: Object.freeze([1, 0]),
  position: 1,
  userAnswer: 'old answer',
  revealed: true,
  results: Object.freeze(['partial', 'knew']),
  done: true,
});
const appendedCompletedQueue = reconcileStudyQueueByTopicIds(
  completedQueue,
  ['question-a', 'question-b'],
  ['question-a', 'question-b', 'question-c', 'question-d'],
);
assert.deepEqual(appendedCompletedQueue.order, [1, 0, 2, 3]);
assert.equal(appendedCompletedQueue.position, 2, 'a completed session resumes at its first new topic');
assert.deepEqual(appendedCompletedQueue.results, ['partial', 'knew']);
assert.equal(appendedCompletedQueue.userAnswer, '');
assert.equal(appendedCompletedQueue.revealed, false);
assert.equal(appendedCompletedQueue.done, false);

const removedCurrentQueue = reconcileStudyQueueByTopicIds(
  activeQueue,
  ['question-a', 'question-b'],
  ['question-a', 'question-c'],
);
assert.deepEqual(removedCurrentQueue.order, [0, 1]);
assert.equal(removedCurrentQueue.position, 1, 'removing the current topic advances safely to the next topic');
assert.deepEqual(removedCurrentQueue.results, ['knew']);
assert.equal(removedCurrentQueue.userAnswer, '');
assert.equal(removedCurrentQueue.revealed, false);
assert.equal(removedCurrentQueue.done, false);

console.log('Diverse question state checks passed.');
