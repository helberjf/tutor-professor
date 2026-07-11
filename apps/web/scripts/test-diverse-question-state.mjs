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
  updateItemById,
  updateSubjectById,
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

console.log('Diverse question state checks passed.');
