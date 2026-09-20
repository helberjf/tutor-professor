'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Target, Trophy } from 'lucide-react';

import { api, type ObjectivesSummary } from '@/lib/api';
import { ObjectiveProgressBar } from '@/components/objectives/ObjectiveProgressBar';
import { deadlineLabel } from '@/components/objectives/objective-areas';
import { t } from '@/lib/i18n';

/**
 * The dashboard's view of the objectives: how close each one is, and nothing else.
 *
 * It reads the summary endpoint instead of the full list because the card shows
 * three bars — loading every item of every objective to draw them would be the
 * heaviest request on a page that already makes several.
 */
export function ObjectivesProgressCard() {
  const [summary, setSummary] = useState<ObjectivesSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getObjectivesSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        // The dashboard still works without this card; staying silent beats an
        // error block for a section the page does not depend on.
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || summary === null) return null;

  const highlighted = summary.objectives.slice(0, 3);

  return (
    <section className="rounded-[1.6rem] border-2 border-slate-100 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            <Target size={22} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Objetivos")}</p>
            <h2 className="mt-0.5 text-lg font-black text-slate-800">
              {summary.active_count === 0
                ? t("Nenhum objetivo ativo")
                : `${summary.average_progress_percent}% de alcance médio`}
            </h2>
          </div>
        </div>

        <Link
          href="/objectives"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200"
        >
          {summary.active_count === 0 ? t("Criar objetivo") : t("Ver objetivos")} <ArrowRight size={16} />
        </Link>
      </div>

      {summary.active_count === 0 ? (
        <p className="mt-4 text-sm font-medium leading-6 text-slate-500">
          {t("Defina aonde quer chegar e liste o que precisa estudar. O alcance sobe sozinho conforme você estuda cada área, e você pode marcar qualquer item à mão.")}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm font-semibold text-slate-500">
            {summary.done_items} de {summary.total_items} {t("itens estudados ·")} {summary.achieved_count}{' '}
            {summary.achieved_count === 1 ? 'objetivo conquistado' : 'objetivos conquistados'}
          </p>

          <ul className="mt-4 space-y-3">
            {highlighted.map((objective) => {
              const deadline = deadlineLabel(objective.days_remaining, objective.target_date);
              const achieved = objective.progress_percent >= 100 && objective.item_count > 0;
              return (
                <li key={objective.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 truncate text-sm font-bold text-slate-700">
                      <span aria-hidden="true">{objective.icon_emoji || '🎯'}</span>
                      <span className="truncate">{objective.title}</span>
                      {achieved ? <Trophy size={14} className="shrink-0 text-emerald-600" /> : null}
                    </p>
                    <span className="shrink-0 text-sm font-black text-slate-700">{objective.progress_percent}%</span>
                  </div>
                  <div className="mt-1.5">
                    <ObjectiveProgressBar
                      percent={objective.progress_percent}
                      label={`Alcance do objetivo ${objective.title}`}
                      compact
                    />
                  </div>
                  {deadline ? (
                    <p className="mt-1 text-xs font-semibold text-slate-400">{deadline}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {summary.active_count > highlighted.length ? (
            <p className="mt-3 text-xs font-bold text-slate-400">
              +{summary.active_count - highlighted.length} {t("outros objetivos ativos")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
