import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const hookUrl = new URL('../src/hooks/use-study-content-scroll.ts', import.meta.url);
assert.ok(existsSync(hookUrl), 'study navigation needs a hook that scrolls to the rendered content');

const compiled = ts.transpileModule(readFileSync(hookUrl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

// A controlled effect/frame harness lets us verify the async navigation lifecycle
// without a browser or a timer race.
let previousDeps;
let cleanup;
let nextFrame = 0;
const frames = new Map();
const calls = [];
const target = { current: { scrollIntoView: (options) => calls.push(options) } };
const react = {
  useRef: () => target,
  useEffect: (effect, deps) => {
    if (previousDeps && deps.every((dep, index) => Object.is(dep, previousDeps[index]))) return;
    cleanup?.();
    previousDeps = deps;
    cleanup = effect();
  },
};
const browser = {
  requestAnimationFrame: (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  },
  cancelAnimationFrame: (id) => frames.delete(id),
};
const module = { exports: {} };
new Function('require', 'exports', 'module', 'window', compiled)(
  (name) => {
    assert.equal(name, 'react');
    return react;
  }, module.exports, module, browser,
);
const { useStudyContentScroll } = module.exports;
function render(destination, ready = true) {
  assert.equal(useStudyContentScroll(destination, ready), target);
}
function paint() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback());
}

render('subjects', false);
paint();
assert.equal(calls.length, 0, 'loading must not scroll to a placeholder');
render('subjects', true);
assert.equal(calls.length, 0, 'wait until the destination has rendered');
paint();
assert.deepEqual(calls, [{ block: 'start', behavior: 'auto' }]);
render('subjects', true);
paint();
assert.equal(calls.length, 1, 'ordinary rerenders must preserve the learner scroll');

render('topics:12');
render('topics:18', false);
paint();
assert.equal(calls.length, 1, 'a superseded navigation must cancel its frame');
render('topics:18');
paint();
assert.equal(calls.length, 2, 'new content scrolls after its load finishes');

render('topic:24');
cleanup?.();
paint();
assert.equal(calls.length, 2, 'unmounting must cancel a pending scroll');
target.current = null;
render('topic:25');
assert.doesNotThrow(paint, 'a removed target must be safe');

console.log('study content scroll checks passed');
