'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookMarked, Loader2, Sparkles, X } from 'lucide-react';

import {
  api,
  ApiError,
  type PlanContext,
  type PlanDraft,
  type PlanForm,
  type PlanTemplateSummary,
  type StudyPlan,
} from '@/lib/api';
import { PlanDraftReview } from './PlanDraftReview';
import {
  aiUnavailableMessage,
  buildRevisionDiff,
  createPlanLabel,
  newPriorityCount,
  selectDraft,
} from './plan-helpers';

type Step = 'start' | 'form' | 'generating' | 'review';

interface Props {
  /** Set to revise this plan instead of creating a new one. */
  plan?: StudyPlan | null;
  onClose: () => void;
  onSaved: (plan: StudyPlan) => void;
}

const PROFILE_PLACEHOLDER = `Conte o que a IA precisa saber para montar a estratégia:
- sua experiência e o que você já construiu (projetos, stack, resultados)
- onde você quer chegar e por quê
- o que já tentou e onde sente que trava
- o que não quer fazer agora`;

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 404) {
    return 'O servidor ainda não tem os planos. Tente novamente mais tarde.';
  }
  return err instanceof Error ? err.message : fallback;
}

function formFromPlan(plan: StudyPlan): PlanForm {
  return {
    goal: plan.goal,
    profile: plan.profile,
    weekly_hours: plan.weekly_hours,
    target_date: plan.target_date,
  };
}

/**
 * "Criar plano": pick AI or a ready-made model, say where you want to get,
 * review the draft, and only then save it. In revision mode the same wizard
 * starts at the form and ends on a review that shows what changes.
 */
export function CreatePlanWizard({ plan = null, onClose, onSaved }: Props) {
  const revising = plan !== null;
  const [step, setStep] = useState<Step>(revising ? 'form' : 'start');
  const [context, setContext] = useState<PlanContext | null>(null);
  const [templates, setTemplates] = useState<PlanTemplateSummary[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  const [goal, setGoal] = useState(plan?.goal ?? '');
  const [profile, setProfile] = useState(plan?.profile ?? '');
  const [weeklyHours, setWeeklyHours] = useState(plan?.weekly_hours ? String(plan.weekly_hours) : '');
  const [targetDate, setTargetDate] = useState(plan?.target_date ?? '');
  const [includeHistory, setIncludeHistory] = useState(true);

  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [removedItems, setRemovedItems] = useState<Record<number, Set<number>>>({});
  const [archive, setArchive] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getPlanContext(),
      revising ? Promise.resolve<PlanTemplateSummary[]>([]) : api.getPlanTemplates(),
    ])
      .then(([loadedContext, loadedTemplates]) => {
        if (cancelled) return;
        setContext(loadedContext);
        setTemplates(loadedTemplates);
        // The last plan's answers, so "sobre você" is not typed twice.
        if (!revising && loadedContext.last_form) {
          setProfile((current) => current || loadedContext.last_form?.profile || '');
          setWeeklyHours((current) => current || (loadedContext.last_form?.weekly_hours ? String(loadedContext.last_form.weekly_hours) : ''));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Não foi possível abrir o plano.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revising]);

  const diff = useMemo(
    () => (plan && draft ? buildRevisionDiff(plan, draft) : null),
    [plan, draft],
  );
  const selected = useMemo(
    () => (draft ? selectDraft(draft, chosen, removedItems) : null),
    [draft, chosen, removedItems],
  );

  function form(): PlanForm {
    const hours = Number.parseInt(weeklyHours, 10);
    return {
      goal: goal.trim(),
      profile: profile.trim() || null,
      weekly_hours: Number.isFinite(hours) && hours > 0 ? Math.min(hours, 100) : null,
      target_date: targetDate || null,
    };
  }

  function openDraft(next: PlanDraft) {
    setDraft(next);
    setDraftTitle(next.title);
    setChosen(new Set(next.priorities.map((_, index) => index)));
    setRemovedItems({});
    setArchive(new Set(next.dropped_objective_ids));
    setStep('review');
  }

  async function startFromTemplate(template: PlanTemplateSummary) {
    setError('');
    setSaving(true);
    try {
      const templateDraft = await api.getPlanTemplateDraft(template.slug);
      if (!goal.trim()) setGoal(template.title);
      openDraft(templateDraft);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Não foi possível abrir o modelo.'));
    } finally {
      setSaving(false);
    }
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!goal.trim()) return;
    setError('');
    setStep('generating');
    try {
      const generated = await api.generatePlanDraft({
        ...form(),
        include_app_history: includeHistory,
        plan_id: plan?.id ?? null,
      });
      openDraft(generated);
    } catch (err: unknown) {
      setError(errorMessage(err, 'A IA não conseguiu montar o plano agora.'));
      setStep('form');
    }
  }

  async function save() {
    if (!selected || !draft) return;
    if (!goal.trim()) {
      setError('Diga qual é o objetivo do plano.');
      return;
    }
    setError('');
    setSaving(true);
    const finalDraft: PlanDraft = { ...selected, title: draftTitle.trim() || draft.title };
    try {
      const saved = plan
        ? await api.revisePlan(plan.id, {
            draft: finalDraft,
            archive_objective_ids: [...archive],
            form: form(),
          })
        : await api.createPlan(form(), finalDraft);
      onSaved(saved);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Não foi possível salvar o plano.'));
    } finally {
      setSaving(false);
    }
  }

  function toggleChosen(index: number) {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleItem(priorityIndex: number, itemIndex: number) {
    setRemovedItems((previous) => {
      const current = new Set(previous[priorityIndex] ?? []);
      if (current.has(itemIndex)) current.delete(itemIndex);
      else current.add(itemIndex);
      return { ...previous, [priorityIndex]: current };
    });
  }

  function toggleArchive(objectiveId: number) {
    setArchive((previous) => {
      const next = new Set(previous);
      if (next.has(objectiveId)) next.delete(objectiveId);
      else next.add(objectiveId);
      return next;
    });
  }

  const aiAvailable = context?.ai_available ?? false;
  const willCreate = selected ? newPriorityCount(selected) : 0;
  const keptCount = selected ? selected.priorities.length - willCreate : 0;
  const canSave = Boolean(selected && selected.priorities.length > 0 && goal.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-wizard-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b-2 border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {step !== 'start' && step !== 'generating' && !(revising && step === 'form') ? (
              <button
                type="button"
                onClick={() => setStep(step === 'review' && draft?.source === 'ai' ? 'form' : revising ? 'form' : 'start')}
                aria-label="Voltar"
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <ArrowLeft size={20} />
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                {revising ? `Revisão ${plan ? plan.revision + 1 : ''}` : 'Criar plano'}
              </p>
              <h2 id="plan-wizard-title" className="truncate text-lg font-black text-slate-800 sm:text-xl">
                {step === 'start' && 'Como você quer começar?'}
                {step === 'form' && (revising ? `Revisar: ${plan?.title}` : 'Sobre você e o objetivo')}
                {step === 'generating' && 'Montando a estratégia'}
                {step === 'review' && (revising ? 'Revise as mudanças' : 'Revise o plano')}
              </h2>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {error ? (
            <p role="alert" className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>
          ) : null}

          {step === 'start' ? (
            <div className="space-y-5">
              <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-700">
                    <Sparkles size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-slate-800">Montar com IA</h3>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                      Você conta onde está e aonde quer chegar. A IA acha o maior gargalo, ordena as prioridades,
                      diz o que não fazer agora e traça o caminho mais curto. Usa 1 crédito de IA.
                    </p>
                    {loadingContext ? (
                      <p className="mt-3 text-sm font-semibold text-slate-500">Verificando a IA da conta...</p>
                    ) : aiAvailable ? (
                      <button
                        type="button"
                        onClick={() => setStep('form')}
                        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-indigo-700 px-4 text-sm font-black text-white transition hover:bg-indigo-800"
                      >
                        <Sparkles size={16} /> Começar com IA
                      </button>
                    ) : (
                      <div className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600">
                        {aiUnavailableMessage(context?.ai_unavailable_reason)}{' '}
                        {context?.ai_unavailable_reason !== 'no_credits' ? (
                          <Link href="/account#ia-da-conta" className="font-black text-primary-dark underline">
                            Abrir IA da conta
                          </Link>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  <BookMarked size={14} /> Ou comece por um modelo pronto (sem IA)
                </p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {templates.map((template) => (
                    <li key={template.slug}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void startFromTemplate(template)}
                        className="flex h-full w-full flex-col items-start rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-primary disabled:opacity-60"
                      >
                        <span className="font-black text-slate-800">{template.title}</span>
                        <span className="mt-1 text-xs font-medium leading-5 text-slate-500">{template.summary}</span>
                        <span className="mt-2 text-xs font-black text-slate-400">
                          {template.priority_count} prioridades · você ajusta tudo depois
                        </span>
                      </button>
                    </li>
                  ))}
                  {!loadingContext && templates.length === 0 ? (
                    <li className="text-sm font-semibold text-slate-500">Nenhum modelo disponível agora.</li>
                  ) : null}
                </ul>
              </section>
            </div>
          ) : null}

          {step === 'form' ? (
            <form id="plan-form" onSubmit={generate} className="space-y-4">
              {revising ? (
                <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-800">
                  A IA recebe o progresso de cada prioridade e reajusta o plano. Nada que você concluiu é apagado:
                  você revisa as mudanças antes de aplicar.
                </p>
              ) : null}

              <label className="block">
                <span className="text-sm font-black text-slate-700">Qual é o objetivo?</span>
                <textarea
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="Ex.: conseguir uma vaga internacional como dev full-stack"
                  maxLength={500}
                  rows={2}
                  required
                  autoFocus={!revising}
                  className="mt-1.5 w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Sobre você</span>
                <span className="mt-0.5 block text-xs font-medium text-slate-500">
                  Quanto mais concreto, melhor a estratégia. Fica salvo para o próximo plano.
                </span>
                <textarea
                  value={profile}
                  onChange={(event) => setProfile(event.target.value)}
                  placeholder={PROFILE_PLACEHOLDER}
                  maxLength={4000}
                  rows={7}
                  className="mt-1.5 w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-primary"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-black text-slate-700">Horas por semana</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={weeklyHours}
                    onChange={(event) => setWeeklyHours(event.target.value)}
                    placeholder="Ex.: 10"
                    className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-black text-slate-700">Prazo (opcional)</span>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                    className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
                  />
                </label>
              </div>

              <div className="rounded-2xl border-2 border-slate-200 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeHistory}
                    onChange={(event) => setIncludeHistory(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-sky-600"
                  />
                  <span>
                    <span className="block text-sm font-black text-slate-700">Incluir meu histórico do app</span>
                    <span className="block text-xs font-medium leading-5 text-slate-500">
                      Um resumo do que você já estudou aqui vai junto para a IA. Nada além disso é enviado.
                    </span>
                  </span>
                </label>
                {includeHistory ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-black text-primary-dark">
                      Ver exatamente o que será enviado
                    </summary>
                    {context && context.snapshot.length ? (
                      <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-xs font-medium leading-5 text-slate-600">
                        {context.snapshot.map((line) => (
                          <li key={line}>• {line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-500">
                        O app ainda não registrou estudo seu. Só o que você escreveu acima será enviado.
                      </p>
                    )}
                  </details>
                ) : null}
              </div>

              {!loadingContext && !aiAvailable ? (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  {aiUnavailableMessage(context?.ai_unavailable_reason)}
                </p>
              ) : null}
            </form>
          ) : null}

          {step === 'generating' ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 size={32} className="animate-spin text-indigo-700" />
              <p className="font-black text-slate-800">
                {revising ? 'Reajustando o plano com o seu progresso...' : 'Pensando na estratégia...'}
              </p>
              <p className="max-w-sm text-sm font-medium text-slate-500">
                A IA está diagnosticando o gargalo e ordenando as prioridades. Pode levar até um minuto.
              </p>
            </div>
          ) : null}

          {step === 'review' && draft ? (
            <div className="space-y-5">
              {draft.source !== 'ai' ? (
                <label className="block">
                  <span className="text-sm font-black text-slate-700">Qual é o objetivo deste plano?</span>
                  <input
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    maxLength={500}
                    className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
                  />
                </label>
              ) : null}
              <PlanDraftReview
                draft={draft}
                title={draftTitle}
                onTitleChange={setDraftTitle}
                chosen={chosen}
                onTogglePriority={toggleChosen}
                removedItems={removedItems}
                onToggleItem={toggleItem}
                diff={diff}
                archive={archive}
                onToggleArchive={toggleArchive}
              />
            </div>
          ) : null}
        </div>

        {step === 'form' || step === 'review' ? (
          <footer className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-2xl border-2 border-slate-200 px-5 font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            {step === 'form' ? (
              <button
                type="submit"
                form="plan-form"
                disabled={!goal.trim() || loadingContext || !aiAvailable}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-5 font-black text-white transition hover:bg-indigo-800 disabled:opacity-50"
              >
                <Sparkles size={17} /> {revising ? 'Gerar revisão com IA' : 'Gerar plano com IA'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !canSave}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-dark px-5 font-black text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? <Loader2 size={17} className="animate-spin" /> : null}
                {revising
                  ? `Aplicar revisão (${keptCount} ${keptCount === 1 ? 'mantida' : 'mantidas'}, ${willCreate} ${willCreate === 1 ? 'nova' : 'novas'})`
                  : createPlanLabel(selected?.priorities.length ?? 0)}
              </button>
            )}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
