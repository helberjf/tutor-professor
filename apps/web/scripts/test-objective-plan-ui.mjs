/**
 * "Criar plano" on the client: the plan rules the screen computes by itself,
 * and the wiring that makes the button, the wizard and the panel reachable.
 *
 * The server owns the saved numbers (scripts/test_study_plan.py). What is
 * pinned here is what the screen does between two requests: recomputing a plan
 * after one checkbox, choosing the next step, and building exactly the draft
 * the learner kept on the review screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// The modules under test now reach for the translation helper through the
// `@/` alias, and it pulls in a dictionary split across relative imports.
// Plain CommonJS resolution knows about neither, so both are resolved here.
// Resolving rather than stubbing keeps the assertions below running against the
// real lookup, which at the default locale returns the Portuguese source.
const SRC_ROOT = new URL('../src/', import.meta.url);

function resolveSpecifier(specifier, fromUrl) {
  const base = specifier.startsWith('@/')
    ? new URL(specifier.slice(2), SRC_ROOT)
    : new URL(specifier, fromUrl);
  for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = new URL(base.href + suffix);
    try {
      return { url: candidate, source: readFileSync(candidate, 'utf8') };
    } catch (error) {
      // A directory or a miss both just mean "not this candidate".
      if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') throw error;
    }
  }
  return null;
}

function loadModule(relativePath, fromUrl = import.meta.url) {
  const resolved = resolveSpecifier(relativePath, fromUrl);
  if (!resolved) throw new Error(`could not resolve ${relativePath}`);
  const compiled = ts.transpileModule(resolved.source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const scopedRequire = (specifier) =>
    specifier.startsWith('@/') || specifier.startsWith('.')
      ? loadModule(specifier, resolved.url)
      : require(specifier);
  new Function('exports', 'module', 'require', compiled)(module.exports, module, scopedRequire);
  return module.exports;
}

const {
  activePriorities,
  aiUnavailableMessage,
  buildRevisionDiff,
  createPlanLabel,
  isFinished,
  newPriorityCount,
  recomputePlan,
  selectDraft,
  withObjective,
  withoutObjective,
} = loadModule('../src/components/objectives/plan-helpers.ts');

function objective(id, planOrder, percent, extra = {}) {
  return {
    id,
    plan_id: 1,
    plan_order: planOrder,
    status: 'active',
    title: `Prioridade ${id}`,
    item_count: 2,
    done_count: percent >= 100 ? 2 : 0,
    progress_percent: percent,
    ...extra,
  };
}

function plan(objectives) {
  return recomputePlan({
    id: 1,
    title: 'Plano',
    objectives,
    progress_percent: 0,
    active_count: 0,
    achieved_count: 0,
    next_objective_id: null,
  });
}

// ── Progress, next step and order ───────────────────────────────────────────
assert.equal(isFinished({ item_count: 0, progress_percent: 100 }), false, 'an empty priority is not finished');
assert.equal(isFinished({ item_count: 3, progress_percent: 100 }), true);

const base = plan([
  objective(30, 3, 0),
  objective(10, 1, 100),
  objective(20, 2, 50),
  objective(40, 4, 0, { status: 'archived' }),
]);
assert.deepEqual(activePriorities(base).map((o) => o.id), [10, 20, 30], 'priorities follow plan order');
assert.equal(base.progress_percent, 50, 'the plan is the mean of its active priorities');
assert.equal(base.active_count, 3);
assert.equal(base.achieved_count, 1);
assert.equal(base.next_objective_id, 20, 'the next step is the first unfinished priority');
assert.deepEqual(base.objectives.map((o) => o.id), [10, 20, 30, 40], 'archived priorities go last');

const advanced = withObjective(base, objective(20, 2, 100));
assert.equal(advanced.next_objective_id, 30, 'finishing a priority moves the next step');
assert.equal(advanced.progress_percent, 67);
assert.equal(advanced.achieved_count, 2);

const shelved = withObjective(base, objective(30, 3, 0, { status: 'archived' }));
assert.equal(shelved.active_count, 2, 'an archived priority leaves the active list');
assert.equal(shelved.progress_percent, 75);

const moved = withObjective(base, objective(20, 2, 50, { plan_id: 99 }));
assert.ok(!moved.objectives.some((o) => o.id === 20), 'a priority now in another plan leaves this one');

const trimmed = withoutObjective(base, 10);
assert.equal(trimmed.next_objective_id, 20);
assert.equal(trimmed.progress_percent, 25);

const done = plan([objective(1, 1, 100), objective(2, 2, 100)]);
assert.equal(done.next_objective_id, null, 'a finished plan has no next step');
assert.equal(plan([]).progress_percent, 0, 'an empty plan is 0%');

// ── Review: exactly the draft the learner kept ──────────────────────────────
const draft = {
  title: 'Revisão',
  diagnosis: 'd',
  priorities: [
    { title: 'Mantida', objective_id: 20, items: [] },
    { title: 'Nova', items: [{ title: 'a', area: 'free', weight: 1 }, { title: 'b', area: 'coding', weight: 2 }] },
    { title: 'Nova sem itens depois', items: [{ title: 'c', area: 'free', weight: 1 }] },
    { title: 'Outra mantida', objective_id: 10, items: [{ title: 'd', area: 'free', weight: 1 }] },
  ],
  avoid: [],
  shortest_path: [],
  source: 'ai',
  plan_id: 1,
  dropped_objective_ids: [30, 999],
};

const diff = buildRevisionDiff(base, draft);
assert.deepEqual(diff.changes.map((change) => change.kind), ['kept', 'new', 'new', 'kept']);
assert.equal(diff.changes[0].objective.id, 20, 'a kept priority knows its objective');
assert.deepEqual(diff.dropped.map((o) => o.id), [30], 'unknown dropped ids are ignored');

const kept = selectDraft(draft, new Set([0, 1, 2]), { 1: new Set([0]), 2: new Set([0]) });
assert.deepEqual(kept.priorities.map((p) => p.title), ['Mantida', 'Nova'], 'unchosen and emptied new priorities are left out');
assert.deepEqual(kept.priorities[1].items.map((item) => item.title), ['b'], 'removed items stay out');
assert.equal(kept.priorities[0].items.length, 0, 'a kept priority may add nothing');
assert.equal(newPriorityCount(kept), 1);
assert.equal(draft.priorities[1].items.length, 2, 'the original draft is not mutated');

assert.equal(createPlanLabel(1), 'Criar plano com 1 prioridade');
assert.equal(createPlanLabel(6), 'Criar plano com 6 prioridades');
assert.match(createPlanLabel(0), /pelo menos uma/);
assert.match(aiUnavailableMessage('no_credits'), /créditos/);
assert.match(aiUnavailableMessage('no_config'), /chave de API/);
assert.match(aiUnavailableMessage(null), /modelos prontos/);

// ── Wiring ────────────────────────────────────────────────────────────────
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const apiClient = read('../src/lib/api.ts');
for (const method of [
  'getPlanContext:',
  'getPlanTemplates:',
  'getPlanTemplateDraft:',
  'generatePlanDraft:',
  'getPlans:',
  'createPlan:',
  'updatePlan:',
  'deletePlan:',
  'revisePlan:',
]) {
  assert.ok(apiClient.includes(method), `the API client should expose ${method}`);
}
assert.match(apiClient, /'\/api\/objectives\/plan\/generate'/, 'generation goes through the rate-limited /generate path');

const board = read('../src/components/objectives/ObjectivesBoard.tsx');
assert.match(board, /Criar plano/, 'the objectives screen offers "Criar plano"');
assert.match(board, /<CreatePlanWizard/, 'the button opens the wizard');
assert.match(board, /<PlanPanel/, 'plans are shown on the board');
assert.match(
  board,
  /getPlans\([^)]*\)\.catch\([\s\S]*?status === 404[\s\S]*?return null/,
  'a server without plans hides the plan button instead of breaking the objectives',
);

const wizard = read('../src/components/objectives/CreatePlanWizard.tsx');
assert.match(wizard, /Ver exatamente o que será enviado/, 'the learner sees what goes to the AI');
assert.match(wizard, /include_app_history: includeHistory/, 'the history switch reaches the request');
assert.match(wizard, /\/account#ia-da-conta/, 'no key points to the account AI settings');
assert.match(wizard, /getPlanTemplates/, 'the ready-made models are offered');
assert.match(wizard, /Nada que você concluiu é apagado/, 'a revision promises not to erase finished work');
assert.match(read('../src/app/account/page.tsx'), /id="ia-da-conta"/, 'the link target exists');

const panel = read('../src/components/objectives/PlanPanel.tsx');
assert.match(panel, /Próximo passo/, 'the plan says what to do now');
assert.match(panel, /Revisar plano/, 'the plan can be revised');
assert.match(panel, /Não priorizar agora/, 'the plan says what to leave alone');
assert.match(panel, /Caminho mais curto/, 'the plan shows the shortest path');

console.log('objective plan UI checks passed.');
