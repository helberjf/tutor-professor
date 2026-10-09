'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { api, type Objective, type ObjectiveStudyScopeInput } from '@/lib/api';
import { ObjectiveStudyScopePicker } from './ObjectiveStudyScopePicker';
import { useObjectiveStudyOptions } from './ObjectiveStudyOptions';
import { createAndAnalyzeObjective, studyAiUnavailableMessage, validStudyScope } from './objective-study-helpers';
import { t } from '@/lib/i18n';
import type { ObjectiveAnalysisProgress as AnalysisProgress } from '@/lib/objective-analysis-workflow';
import { ObjectiveAnalysisProgress } from './ObjectiveAnalysisProgress';

interface Props {
  onClose: () => void;
  onCreated: (objective: Objective, analysisError?: string) => void;
}

/** Create a goal linked to recorded studies, then optionally assess its history. */
export function CreateObjectiveModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [studyScope, setStudyScope] = useState<ObjectiveStudyScopeInput | null>(null);
  const [analyzeAfterCreate, setAnalyzeAfterCreate] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const { options } = useObjectiveStudyOptions();
  const scopeValid = validStudyScope(studyScope, options);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setSaving(true);
    setError('');
    try {
      const result = await createAndAnalyzeObjective({
        create: api.createObjective,
        analyze: (id) => { setAnalyzing(true); setAnalysisProgress(null); return api.analyzeObjective(id, setAnalysisProgress); },
      }, {
        title: clean,
        description: description.trim() || undefined,
        icon_emoji: emoji.trim() || undefined,
        target_date: targetDate || undefined,
        study_scope: studyScope,
      }, scopeValid && !!options?.ai_available && analyzeAfterCreate);
      onCreated(result.objective, result.analysisError
        ? `${t('Objetivo salvo. A análise falhou; tente novamente no cartão do objetivo.')} ${result.analysisError}` : undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("Não foi possível criar o objetivo."));
    } finally {
      setSaving(false);
      setAnalyzing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="new-objective-title" className="dialog-sheet max-h-[90dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-3xl p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="new-objective-title" className="text-xl font-black text-slate-800">{t("Novo objetivo")}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t("Fechar")}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} aria-busy={saving}>
          <fieldset disabled={saving} className="min-w-0 space-y-4">
          <div className="flex gap-3">
            <input
              aria-label={t("Emoji do objetivo")}
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              placeholder="🎯"
              maxLength={2}
              className="w-16 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xl outline-none focus:border-primary"
            />
            <input
              aria-label={t("Título do objetivo")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("Ex: passar na certificação AWS")}
              maxLength={120}
              required
              autoFocus
              className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </div>

          <textarea
            aria-label={t("Descrição do objetivo")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("Por que este objetivo importa (opcional)")}
            maxLength={500}
            rows={2}
            className="w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-primary"
          />

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Prazo (opcional)")}</span>
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </label>

          <ObjectiveStudyScopePicker value={studyScope} onChange={setStudyScope} disabled={saving} />
          {scopeValid ? (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={analyzeAfterCreate && !!options?.ai_available} onChange={(event) => setAnalyzeAfterCreate(event.target.checked)}
                  disabled={saving || !options?.ai_available} className="mt-1 h-4 w-4 shrink-0 accent-sky-700" />
                {t('Analisar com IA após criar')}
              </label>
              {!options?.ai_available ? <p className="text-xs leading-5 text-slate-500">{t(studyAiUnavailableMessage(options?.ai_unavailable_reason))}</p> : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>
          ) : null}
          {analyzing ? <ObjectiveAnalysisProgress progress={analysisProgress} /> : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-11 flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50"
            >
              {t("Cancelar")}
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || (studyScope !== null && !scopeValid)}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-dark py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? <><Loader2 size={18} className="animate-spin" />{analyzing ? t('Objetivo salvo. Analisando...') : t('Salvando...')}</> : t("Criar objetivo")}
            </button>
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
