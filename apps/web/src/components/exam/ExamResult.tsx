'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

import { formatClock } from '@/components/questions/use-countdown';
import type { ExamAttemptResult } from '@/lib/api';

/**
 * The result screen. The percentage is the headline: it is the number that tells
 * you whether you are ready, which is the whole reason to sit a simulado.
 */
export function ExamResult({ result, onClose }: { result: ExamAttemptResult; onClose: () => void }) {
  const { attempt, exam, review } = result;
  const [showReview, setShowReview] = useState(false);
  const percent = attempt.score_percent ?? 0;
  const passed = attempt.passed ?? false;
  const missed = review.filter((item) => !item.correct);
  const domains = Object.entries(attempt.domain_breakdown ?? {});
  // A single "Geral" bucket says nothing the headline has not already said.
  const showDomains = domains.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-result-title"
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-stretch justify-center bg-slate-950/85 sm:items-center sm:p-6"
    >
      <div className="flex min-h-[100dvh] w-full max-w-3xl flex-col bg-white text-slate-900 shadow-2xl sm:min-h-0 sm:max-h-[92dvh] sm:rounded-3xl">
        <main className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
          <section className="text-center">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{exam.name}</p>
            <p
              id="exam-result-title"
              className={`mt-3 text-6xl font-black tabular-nums ${passed ? 'text-emerald-600' : 'text-amber-600'}`}
            >
              {percent}%
            </p>
            <p className="mt-2 text-lg font-black text-slate-700">
              {attempt.correct_count} de {attempt.question_count} corretas
            </p>
            <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${
              passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
            >
              {passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {passed
                ? `Acima da meta de ${exam.passing_percent}%`
                : `Abaixo da meta de ${exam.passing_percent}%`}
            </p>
            {attempt.duration_seconds !== null && (
              <p className="mt-3 text-sm font-bold text-slate-500">
                Tempo usado: {formatClock(attempt.duration_seconds)} de {formatClock(exam.duration_minutes * 60)}
              </p>
            )}
          </section>

          {showDomains && (
            <section className="mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Por assunto</h3>
              <div className="mt-3 space-y-3">
                {domains.map(([name, counts]) => {
                  const domainPercent = counts.total > 0 ? Math.round((counts.correct / counts.total) * 100) : 0;
                  return (
                    <div key={name}>
                      <div className="flex items-baseline justify-between gap-3 text-sm font-bold">
                        <span className="text-slate-700">{name}</span>
                        <span className="tabular-nums text-slate-500">
                          {counts.correct}/{counts.total} · {domainPercent}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${domainPercent >= exam.passing_percent ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${domainPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {missed.length > 0 && (
            <section className="mt-8">
              <button
                type="button"
                onClick={() => setShowReview((value) => !value)}
                className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                {showReview ? 'Ocultar' : `Revisar as ${missed.length} que errei`}
              </button>

              {showReview && (
                <div className="mt-4 space-y-4">
                  {missed.map((item) => (
                    <article key={item.question.id} className="rounded-2xl border-2 border-slate-100 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                        {item.question.domain}
                      </p>
                      <p className="mt-2 font-black text-slate-800">{item.question.question}</p>
                      {item.selected_options.length > 0 ? (
                        <p className="mt-3 text-sm font-bold text-rose-600">
                          Você marcou: {item.selected_options.join(' · ')}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm font-bold text-slate-400">Você deixou em branco.</p>
                      )}
                      <p className="mt-1 text-sm font-bold text-emerald-700">
                        Correta: {item.question.correct_options.join(' · ')}
                      </p>
                      <p className="mt-3 leading-relaxed text-slate-600">{item.question.explanation}</p>
                      {item.question.reference_url && (
                        <a
                          href={item.question.reference_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-sm font-black text-indigo-600 hover:underline"
                        >
                          Ver documentação
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>

        <footer className="border-t border-slate-200 px-5 py-4 sm:rounded-b-3xl sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-2xl bg-indigo-600 px-4 font-black text-white hover:bg-indigo-700"
          >
            Voltar aos simulados
          </button>
        </footer>
      </div>
    </div>
  );
}
