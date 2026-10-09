import type { ObjectiveAnalysisProgress as AnalysisProgress } from '@/lib/objective-analysis-workflow';
import { t, tf } from '@/lib/i18n';

export function ObjectiveAnalysisProgress({ progress }: { progress: AnalysisProgress | null }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-[var(--line-soft)] bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--text)]">
      <p className="font-bold text-[var(--text-strong)]">{progress
        ? tf('Lendo estudos: {completed} de {total} partes.', { completed: progress.completed_steps, total: progress.total_steps })
        : t('Preparando o histórico de estudos...')}</p>
      {progress ? <progress aria-label={t('Leitura do histórico de estudos')} value={progress.completed_steps} max={Math.max(1, progress.total_steps)} className="h-2 w-full accent-sky-600" /> : null}
      <p>{t('O progresso fica salvo. Se houver uma falha, tente novamente para continuar.')}</p>
    </div>
  );
}
