import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/components/coding/topic-flashcard-state.ts', import.meta.url);

let source;
try {
  source = readFileSync(helperUrl, 'utf8');
} catch {
  assert.fail('Expected topic-flashcard-state.ts to exist');
}

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const { appendGeneratedFlashcards, syncTopicFlashcardCount } = module.exports;
assert.equal(typeof appendGeneratedFlashcards, 'function');
assert.equal(typeof syncTopicFlashcardCount, 'function');

const existing = Object.freeze([{ id: 1, front: 'Existing' }]);
const generated = Object.freeze([
  { id: 2, front: 'Generated A' },
  { id: 3, front: 'Generated B' },
]);
const appended = appendGeneratedFlashcards(existing, generated);
assert.deepEqual(appended, [...existing, ...generated]);
assert.notStrictEqual(appended, existing);
assert.deepEqual(existing, [{ id: 1, front: 'Existing' }]);
assert.deepEqual(generated, [
  { id: 2, front: 'Generated A' },
  { id: 3, front: 'Generated B' },
]);

const latestTopic = Object.freeze({
  id: 9,
  title: 'Latest title',
  status: 'mastered',
  notes: 'Saved while generation was pending',
  ai_content: { sections: [{ title: 'Current lesson' }] },
  flashcard_count: 1,
});
const synced = syncTopicFlashcardCount(latestTopic, 3);
assert.deepEqual(synced, { ...latestTopic, flashcard_count: 3 });
assert.equal(synced.notes, latestTopic.notes);
assert.equal(synced.status, latestTopic.status);
assert.equal(synced.ai_content, latestTopic.ai_content);
assert.equal(latestTopic.flashcard_count, 1);

assert.strictEqual(syncTopicFlashcardCount(synced, 3), synced);

console.log('Topic flashcard state checks passed.');
