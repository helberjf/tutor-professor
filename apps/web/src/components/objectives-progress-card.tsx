'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Target } from 'lucide-react';
import { api, type ObjectivesSummary } from '@/lib/api';
import { ObjectiveProgressBar } from '@/components/objectives/ObjectiveProgressBar';
import { deadlineLabel } from '@/components/objectives/objective-areas';
import { t, tf } from '@/lib/i18n';

/** Read the saved checklist and analysis; opening a dashboard never runs AI. */
export function ObjectivesProgressCard() {
  const [summary, setSummary] = useState<ObjectivesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    async function load() {
      const current = ++requestId;
      try {
        const data = await api.getObjectivesSummary();
        if (!cancelled && current === requestId) { setSummary(data); setError(false); }
      } catch {
        if (!cancelled && current === requestId) setError(true);
      } finally {
        if (!cancelled && current === requestId) setLoading(false);
      }
    }
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reloadNonce]);

  const objectives = [...(summary?.objectives ?? [])].sort((a, b) =>
    Number(a.item_count > 0 && a.progress_percent >= 100) - Number(b.item_count > 0 && b.progress_percent >= 100));
  const highlighted = showAll ? objectives : objectives.slice(0, 3);

  return (
    <section aria-label={t("O que falta para seus objetivos")} className="rounded-[1.6rem] border border-[var(--line-strong)] bg-[var(--surface-strong)] p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Target size={22} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{t("Objetivos")}</p>
            <h2 className="mt-1 text-lg font-black text-slate-800">{t("O que falta para seus objetivos")}</h2>
          </div>
        </div>
        <Link href="/objectives" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">
          {summary?.active_count === 0 ? t("Criar objetivo") : t("Ver objetivos")} <ArrowRight size={16} />
        </Link>
      </div>
      {loading ? <p role="status" className="mt-4 text-sm text-slate-500">{t("Carregando")}</p> : null}
      {error ? <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        <p>{t("Não foi possível atualizar seus objetivos.")}</p>
        <button type="button" onClick={() => setReloadNonce((value) => value + 1)} className="mt-1 min-h-11 font-bold underline">{t("Tentar novamente")}</button>
      </div> : null}
      {summary?.active_count === 0 ? <p className="mt-4 text-sm leading-6 text-slate-500">{t("Nenhum objetivo ativo")}</p> : null}
      <ul className="mt-4 space-y-4">
        {highlighted.map((objective) => {
          const pending = objective.items.filter((item) => !item.done).sort((a, b) => a.order_index - b.order_index);
          const analysis = objective.study_analysis;
          const hasChecklist = objective.item_count > 0;
          const percent = hasChecklist ? objective.progress_percent : analysis?.progress_percent ?? null;
          const deadline = deadlineLabel(objective.days_remaining, objective.target_date);
          return (
            <li key={objective.id} className="min-w-0 rounded-2xl border border-[var(--line-soft)] p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/objectives#objective-${objective.id}`} className="min-w-0 break-words text-base font-bold text-slate-800 hover:underline">
                  <span aria-hidden>{objective.icon_emoji || '🎯'} </span>{objective.title}
                </Link>
                {percent !== null ? <span className="shrink-0 text-sm font-black text-sky-700">{percent}%</span> : null}
              </div>
              {percent !== null ? <div className="mt-2"><ObjectiveProgressBar percent={percent} label={hasChecklist ? `${t("Objetivo")}: ${objective.title}` : t("Alcance estimado pela IA")} compact /></div> : null}
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {hasChecklist
                  ? tf("Faltam {count} de {total} etapas planejadas.", { count: pending.length, total: objective.item_count })
                  : analysis ? t("Estimativa da IA com base nos estudos salvos") : t("Analise este objetivo em Objetivos para ver o que falta estudar.")}
                {deadline ? ` · ${deadline}` : ''}
              </p>
              {pending.length > 0 ? <div className="mt-3">
                <h3 className="text-sm font-bold text-slate-700">{t("Próximas etapas")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                  {pending.slice(0, 3).map((item) => <li key={item.id} className="break-words">{item.title}</li>)}
                </ul>
                {pending.length > 3 ? <details className="mt-2 text-sm text-slate-600">
                  <summary className="cursor-pointer py-2 font-bold">{t("Ver todas as etapas pendentes")}</summary>
                  <ul className="list-disc space-y-1 pl-5">{pending.slice(3).map((item) => <li key={item.id} className="break-words">{item.title}</li>)}</ul>
                </details> : null}
              </div> : hasChecklist ? <p className="mt-3 text-sm font-bold text-emerald-700">{t("Todas as etapas planejadas foram concluídas.")}</p> : null}
              {analysis ? <div className="mt-3 space-y-3 border-t border-[var(--line-soft)] pt-3">
                {analysis.stale ? <p className="text-xs font-bold text-amber-800">{t("Análise desatualizada. Atualize em Objetivos.")}</p> : null}
                {analysis.progress_percent === null ? <p className="text-sm text-slate-500">{t("Dados insuficientes para estimar")}</p> : null}
                {([
                  [t("O que falta melhorar"), analysis.gaps],
                  [t("Plano para alcançar o objetivo"), analysis.next_steps],
                ] as [string, string[]][]).map(([label, items]) => items.length ? <div key={label}>
                  <h3 className="text-sm font-bold text-slate-700">{label}</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                    {items.slice(0, 3).map((item, index) => <li key={index} className="break-words">{item}</li>)}
                  </ul>
                </div> : null)}
              </div> : null}
            </li>
          );
        })}
      </ul>
      {objectives.length > 3 ? <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-3 min-h-11 text-sm font-bold text-primary-dark hover:underline">
        {showAll ? t("Mostrar menos") : t("Ver todos os objetivos")}
      </button> : null}
    </section>
  );
}
