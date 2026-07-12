import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/lib/lesson-question-state.ts', import.meta.url);
const apiUrl = new URL('../src/lib/api.ts', import.meta.url);

let source;
try {
  source = readFileSync(helperUrl, 'utf8');
} catch {
  assert.fail('Expected lesson-question-state.ts to exist');
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
  IncompleteLessonQuestionBatchError,
  isUncertainLessonQuestionGenerationError,
  mergeLessonQuestionsById,
  validateConfirmedLessonQuestionBatch,
} = module.exports;

const existing = Object.freeze([
  Object.freeze({ id: 1, lesson_id: 7, front: 'Existing question' }),
]);
const generated = Object.freeze(
  Array.from({ length: 5 }, (_, index) => Object.freeze({
    id: index + 2,
    lesson_id: 7,
    front: `Generated question ${index + 1}`,
  })),
);

assert.strictEqual(
  validateConfirmedLessonQuestionBatch(generated, 7),
  generated,
  'a complete five-question response for the active lesson is confirmed',
);
assert.deepEqual(
  mergeLessonQuestionsById(existing, generated),
  [...existing, ...generated],
  'confirmed questions append without replacing existing questions',
);
assert.deepEqual(
  mergeLessonQuestionsById([...existing, ...generated], generated),
  [...existing, ...generated],
  'replaying the same response is idempotent',
);
assert.deepEqual(
  mergeLessonQuestionsById(existing, [generated[0], generated[0], generated[1]]),
  [existing[0], generated[0], generated[1]],
  'duplicate IDs inside a response append only once',
);

for (const invalidBatch of [
  generated.slice(0, 4),
  [...generated.slice(0, 4), generated[0]],
  generated.map((question, index) => index === 4 ? { ...question, lesson_id: 8 } : question),
  [...generated.slice(0, 4), { ...generated[4], id: 0 }],
]) {
  assert.throws(
    () => validateConfirmedLessonQuestionBatch(invalidBatch, 7),
    IncompleteLessonQuestionBatchError,
    'partial, duplicate, invalid-ID, or stale-lesson responses are uncertain',
  );
}

assert.equal(
  isUncertainLessonQuestionGenerationError(
    new ApiError('offline after POST', { code: 'offline' }),
  ),
  true,
);
assert.equal(
  isUncertainLessonQuestionGenerationError(
    new ApiError('response could not be parsed', { code: 'parse' }),
  ),
  true,
);
assert.equal(
  isUncertainLessonQuestionGenerationError(new TypeError('Failed to fetch')),
  true,
);
assert.equal(
  isUncertainLessonQuestionGenerationError(new IncompleteLessonQuestionBatchError()),
  true,
);
assert.equal(
  isUncertainLessonQuestionGenerationError(
    new ApiError('validation failed', { status: 422, code: 'http' }),
  ),
  false,
);

console.log('lesson question state checks passed');
