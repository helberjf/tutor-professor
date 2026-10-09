import type { CreateObjectivePayload, Objective, ObjectiveStudyOptions, ObjectiveStudyScope, ObjectiveStudyScopeInput, ObjectiveStudyTarget } from '@/lib/api';

export const MAX_STUDY_TARGETS = 30;

export function studyAiUnavailableMessage(reason?: string | null): string {
  if (reason === 'no_config') return 'Configure uma chave de API na sua conta para analisar seus objetivos.';
  if (reason === 'no_credits') return 'Seus créditos de IA acabaram. Verifique os créditos na sua conta para analisar novamente.';
  return reason || 'A IA está indisponível. Verifique sua configuração de IA.';
}

export function toStudyScopeInput(scope?: ObjectiveStudyScope | null): ObjectiveStudyScopeInput | null {
  return scope ? { discipline_key: scope.discipline_key, target_keys: scope.targets.map((target) => target.key) } : null;
}

export function toggleStudyTarget(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((item) => item !== key) : keys.length < MAX_STUDY_TARGETS ? [...keys, key] : keys;
}

export function selectStudyTargets(targets: ObjectiveStudyTarget[], selectedKeys: string[] = []): string[] {
  return [...new Set([...selectedKeys, ...targets.filter((target) => target.available).map((target) => target.key)])]
    .slice(0, MAX_STUDY_TARGETS);
}

function searchKey(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function filterStudyTargets(targets: ObjectiveStudyTarget[], query: string, subject: string): ObjectiveStudyTarget[] {
  const search = searchKey(query);
  return targets.filter((target) => (!subject || target.subject === subject)
    && (!search || searchKey(`${target.title} ${target.subject ?? ''}`).includes(search)));
}

export function validStudyScope(value: ObjectiveStudyScopeInput | null, options: ObjectiveStudyOptions | null): boolean {
  if (!value || !options || value.target_keys.length === 0 || value.target_keys.length > MAX_STUDY_TARGETS) return false;
  const discipline = options.disciplines.find((item) => item.key === value.discipline_key);
  return !!discipline && value.target_keys.every((key) => discipline.targets.some((target) => target.key === key && target.available));
}

export function missingStudyTargets(value: ObjectiveStudyScopeInput | null, options: ObjectiveStudyOptions | null, saved?: ObjectiveStudyScope | null): ObjectiveStudyTarget[] {
  if (!value || !options) return [];
  const discipline = options.disciplines.find((item) => item.key === value.discipline_key);
  return value.target_keys.filter((key) => !discipline?.targets.some((target) => target.key === key && target.available))
    .map((key) => saved?.targets.find((target) => target.key === key) ?? {
      key, title: key, subject: null, topic_id: null, subject_id: null, available: false,
    });
}

/** A provider failure cannot turn a successful save into another create attempt. */
export async function createAndAnalyzeObjective(
  client: { create: (payload: CreateObjectivePayload) => Promise<Objective>; analyze: (id: number) => Promise<Objective> },
  payload: CreateObjectivePayload,
  analyze: boolean,
): Promise<{ objective: Objective; analysisError: string | null }> {
  const objective = await client.create(payload);
  if (!analyze || !objective.study_scope) return { objective, analysisError: null };
  try {
    return { objective: await client.analyze(objective.id), analysisError: null };
  } catch (error: unknown) {
    return { objective, analysisError: error instanceof Error ? error.message : 'Não foi possível analisar o objetivo.' };
  }
}
