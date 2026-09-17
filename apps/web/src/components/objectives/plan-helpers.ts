import type { Objective, PlanDraft, PlanPriorityDraft, StudyPlan } from '@/lib/api';

/**
 * The plan rules the screen needs without asking the server again.
 *
 * Only type imports on purpose: the file is loaded as plain JavaScript by
 * scripts/test-objective-plan-ui.mjs, and the progress rule here has to match
 * plan_progress in apps/api/services/study_plan_service.py.
 */

export function isFinished(objective: Pick<Objective, 'item_count' | 'progress_percent'>) {
  return objective.item_count > 0 && objective.progress_percent >= 100;
}

/** Active priorities in plan order. */
export function activePriorities(plan: Pick<StudyPlan, 'objectives'>): Objective[] {
  return plan.objectives
    .filter((objective) => objective.status === 'active')
    .sort((left, right) => {
      const leftOrder = left.plan_order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.plan_order ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.id - right.id;
    });
}

export function archivedPriorities(plan: Pick<StudyPlan, 'objectives'>): Objective[] {
  return plan.objectives.filter((objective) => objective.status !== 'active');
}

/**
 * The plan with one of its priorities replaced, and its numbers recomputed.
 *
 * A checked item answers with the objective only, so the percentage, the
 * achieved count and the next step are worked out here instead of reloading
 * every plan after each click.
 */
export function withObjective(plan: StudyPlan, updated: Objective): StudyPlan {
  if (updated.plan_id !== plan.id) {
    return withoutObjective(plan, updated.id);
  }
  const exists = plan.objectives.some((objective) => objective.id === updated.id);
  const objectives = exists
    ? plan.objectives.map((objective) => (objective.id === updated.id ? updated : objective))
    : [...plan.objectives, updated];
  return recomputePlan({ ...plan, objectives });
}

export function withoutObjective(plan: StudyPlan, objectiveId: number): StudyPlan {
  return recomputePlan({
    ...plan,
    objectives: plan.objectives.filter((objective) => objective.id !== objectiveId),
  });
}

export function recomputePlan(plan: StudyPlan): StudyPlan {
  const active = activePriorities(plan);
  const finished = active.filter(isFinished);
  const next = active.find((objective) => !isFinished(objective)) ?? null;
  const progress = active.length
    ? Math.round(active.reduce((total, objective) => total + objective.progress_percent, 0) / active.length)
    : 0;
  return {
    ...plan,
    objectives: [...active, ...archivedPriorities(plan)],
    progress_percent: progress,
    active_count: active.length,
    achieved_count: finished.length,
    next_objective_id: next ? next.id : null,
  };
}

export type RevisionChange =
  | { kind: 'kept'; index: number; priority: PlanPriorityDraft; objective: Objective }
  | { kind: 'new'; index: number; priority: PlanPriorityDraft };

export interface RevisionDiff {
  changes: RevisionChange[];
  /** Active priorities the revision leaves out; the screen offers to archive them. */
  dropped: Objective[];
}

/** What a revision draft would do to the current plan, for the review screen. */
export function buildRevisionDiff(plan: StudyPlan, draft: PlanDraft): RevisionDiff {
  const byId = new Map(plan.objectives.map((objective) => [objective.id, objective]));
  const changes: RevisionChange[] = draft.priorities.map((priority, index) => {
    const objective = priority.objective_id != null ? byId.get(priority.objective_id) : undefined;
    return objective
      ? { kind: 'kept', index, priority, objective }
      : { kind: 'new', index, priority };
  });
  const dropped = draft.dropped_objective_ids
    .map((objectiveId) => byId.get(objectiveId))
    .filter((objective): objective is Objective => Boolean(objective));
  return { changes, dropped };
}

/**
 * The draft as it will be saved: only the chosen priorities, and in each one
 * only the items that were not removed on the review screen.
 *
 * A new priority left with no items is dropped here rather than refused by the
 * server; a kept one may stay empty, since its existing items carry on.
 */
export function selectDraft(
  draft: PlanDraft,
  chosen: ReadonlySet<number>,
  removedItems: Readonly<Record<number, ReadonlySet<number>>> = {},
): PlanDraft {
  const priorities = draft.priorities
    .map((priority, index) => ({ priority, index }))
    .filter(({ index }) => chosen.has(index))
    .map(({ priority, index }) => ({
      ...priority,
      items: priority.items.filter((_, itemIndex) => !removedItems[index]?.has(itemIndex)),
    }))
    .filter((priority) => priority.items.length > 0 || priority.objective_id != null);
  return { ...draft, priorities };
}

export function newPriorityCount(draft: PlanDraft) {
  return draft.priorities.filter((priority) => priority.objective_id == null).length;
}

export function createPlanLabel(count: number) {
  if (count === 0) return 'Escolha pelo menos uma prioridade';
  return `Criar plano com ${count} ${count === 1 ? 'prioridade' : 'prioridades'}`;
}

export function aiUnavailableMessage(reason: 'no_config' | 'no_credits' | null | undefined) {
  if (reason === 'no_credits') {
    return 'Seus créditos de IA de hoje acabaram. Comece por um modelo pronto ou volte amanhã.';
  }
  return 'Para montar o plano com IA, configure uma chave de API na sua conta. Os modelos prontos funcionam sem IA.';
}
