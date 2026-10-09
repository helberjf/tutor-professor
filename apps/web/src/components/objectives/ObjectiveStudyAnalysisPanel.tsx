'use client';

import { useState } from 'react';
import { Loader2, Pencil, Sparkles } from 'lucide-react';
import { api, type Objective, type ObjectiveStudyScopeInput } from '@/lib/api';
import { getActiveLocale, t, tf } from '@/lib/i18n';
import { ObjectiveProgressBar } from './ObjectiveProgressBar';
import { ObjectiveStudyScopePicker } from './ObjectiveStudyScopePicker';
import { useObjectiveStudyOptions } from './ObjectiveStudyOptions';
import { studyAiUnavailableMessage, toStudyScopeInput, validStudyScope } from './objective-study-helpers';

export function ObjectiveStudyAnalysisPanel({ objective, onChanged }: { objective: Objective; onChanged: (objective: Objective) => void }) {
  const { options, loading, error: optionsError, reload } = useObjectiveStudyOptions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ObjectiveStudyScopeInput | null>(null);
  const [busy, setBusy] = useState<'save' | 'analyze' | null>(null);
  const [error, setError] = useState('');
  const scope = objective.study_scope;
  const analysis = objective.study_analysis;
  const canAnalyze = !!scope?.available && !!options?.ai_available && !loading && !optionsError && !busy;

  function editScope() { setDraft(toStudyScopeInput(scope)); setEditing(true); setError(''); }

  async function saveScope() {
    setBusy('save'); setError('');
    try {
      onChanged(await api.updateObjective(objective.id, { study_scope: draft }));
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Não foi possível salvar os tópicos do objetivo.'));
    } finally { setBusy(null); }
  }

  async function analyze() {
    setBusy('analyze'); setError('');
    try { onChanged(await api.analyzeObjective(objective.id)); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : t('Não foi possível analisar o objetivo.')); }
    finally { setBusy(null); }
  }

  const confidence = { low: t('Baixa'), medium: t('Média'), high: t('Alta') };
  const date = analysis ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(analysis.generated_at) ? analysis.generated_at : `${analysis.generated_at}Z`) : null;

  return (
    <section className="mt-4 min-w-0 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-strong)] p-4" aria-label={t('Análise do objetivo com IA')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="flex items-center gap-2 text-sm font-bold text-[var(--text-strong)]"><Sparkles size={16} className="text-[var(--sky)]" />{t('Quanto falta para alcançar?')}</h4>
          {scope ? (
            <>
              <p className="mt-2 break-words text-sm font-bold text-slate-700">{scope.discipline}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {scope.targets.map((target) => <li key={target.key} className={`max-w-full break-words rounded-lg px-2 py-1 text-xs font-semibold ${target.available ? 'bg-white text-slate-600' : 'bg-amber-50 text-amber-800'}`}>
                  {target.title}{target.subject ? ` · ${target.subject}` : ''}{!target.available ? ` · ${t('indisponível')}` : ''}
                </li>)}
              </ul>
            </>
          ) : <p className="mt-1 text-xs leading-5 text-slate-500">{t('Vincule uma disciplina e tópicos para analisar seus estudos em relação ao objetivo.')}</p>}
        </div>
        <button type="button" onClick={editScope} disabled={!!busy || editing} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-sky-800 hover:bg-sky-100 disabled:opacity-50">
          <Pencil size={14} />{scope ? t('Editar tópicos') : t('Vincular estudos')}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <ObjectiveStudyScopePicker value={draft} onChange={setDraft} savedScope={scope} disabled={!!busy} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveScope()} disabled={!!busy || (draft !== null && !validStudyScope(draft, options))}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : null}{t('Salvar vínculo')}
            </button>
            <button type="button" disabled={!!busy} onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600">{t('Cancelar')}</button>
          </div>
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-4 space-y-3">
          {analysis.stale ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">{t('O objetivo ou os tópicos mudaram. Atualize a análise para considerar o vínculo atual.')}</p> : null}
          <div className="rounded-xl bg-white p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-xs font-black text-sky-800">{t('Estimativa da IA')}</p>
              {analysis.progress_percent !== null ? <p className="text-lg font-black text-sky-900">{analysis.progress_percent}%</p> : null}
            </div>
            {analysis.progress_percent === null ? <p className="mt-2 text-sm font-bold text-slate-700">{t('Dados insuficientes para estimar')}</p> : (
              <>
                <div className="mt-2"><ObjectiveProgressBar percent={analysis.progress_percent} label={t('Alcance estimado pela IA')} /></div>
                <p className="mt-2 text-xs font-semibold text-slate-500">{tf('Faltam aproximadamente {percent}% para o objetivo.', { percent: analysis.remaining_percent ?? 100 - analysis.progress_percent })}</p>
              </>
            )}
            <p className="mt-2 text-sm leading-6 text-slate-600">{analysis.summary}</p>
          </div>
          {([
            [t('O que já foi estudado'), analysis.studied],
            [t('O que falta melhorar'), analysis.gaps],
          ] as [string, string[]][]).map(([title, items]) => items.length ? (
            <div key={title}>
              <p className="text-sm font-black text-slate-700">{title}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">{items.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul>
            </div>
          ) : null)}
          {analysis.next_steps.length ? (
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-muted)] p-3 sm:p-4">
              <h5 className="text-sm font-bold text-[var(--text-strong)]">{t('Plano para alcançar o objetivo')}</h5>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--text)]">
                {analysis.next_steps.map((step, index) => <li key={index} className="break-words pl-1">{step}</li>)}
              </ol>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-slate-500">{tf('Confiança: {confidence} · {count} evidências de estudo', { confidence: confidence[analysis.confidence], count: analysis.evidence_count })}
            {date && !Number.isNaN(date.valueOf()) ? ` · ${date.toLocaleString(getActiveLocale(), { dateStyle: 'short', timeStyle: 'short' })}` : ''}
          </p>
          {analysis.context_truncated ? <p className="text-xs text-amber-800">{t('Esta análise usou uma amostra do histórico disponível.')}</p> : null}
        </div>
      ) : null}

      {scope && !editing ? (
        <div className="mt-4 space-y-2">
          {!scope.available ? <p className="text-xs font-semibold text-amber-800">{t('Revise os tópicos indisponíveis antes de analisar novamente.')}</p> : null}
          {loading ? <p className="text-xs text-slate-500">{t('Carregando disciplinas e tópicos...')}</p> : optionsError ? (
            <p className="text-xs text-rose-700">{optionsError} <button type="button" onClick={reload} className="font-bold underline">{t('Tentar novamente')}</button></p>
          ) : options && !options.ai_available ? <p className="text-xs leading-5 text-slate-500">{t(studyAiUnavailableMessage(options.ai_unavailable_reason))}</p> : null}
          <button type="button" onClick={() => void analyze()} disabled={!canAnalyze} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">
            {busy === 'analyze' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {busy === 'analyze' ? t('Analisando estudos...') : analysis ? t('Atualizar análise') : t('Analisar objetivo')}
          </button>
          {!analysis ? <p className="text-xs leading-5 text-slate-500">{t('A IA compara o objetivo com os estudos registrados nos tópicos escolhidos.')}</p> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}
    </section>
  );
}
