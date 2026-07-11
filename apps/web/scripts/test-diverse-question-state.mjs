import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/lib/diverse-question-state.ts', import.meta.url);

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

const {
  appendTopicToSubjectById,
  clearDraftForRemovedSubject,
  findItemIndexById,
  resolveItemsByIds,
  resolveDiverseGenerationTarget,
  updateItemById,
  updateSubjectById,
  reconcileStudyQueueByTopicIds,
} = module.exports;

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
