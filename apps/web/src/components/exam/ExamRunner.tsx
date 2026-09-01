'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Timer, X } from 'lucide-react';

import { formatClock, useCountdown } from '@/components/questions/use-countdown';
import { api, type ExamAttemptQuestion, type ExamAttemptResult, type ExamAttemptStart } from '@/lib/api';

import { ExamResult } from './ExamResult';

/**
 * One sitting.
 *
 * Unlike the questions mode, nothing is revealed while the exam is open: no
 * right/wrong, no explanation, no running score. The percentage only appears on
 * the result screen, which is the point of a simulado.
 */
export function ExamRunner({ start, onClose }: { start: ExamAttemptStart; onClose: () => void }) {
  const { attempt, exam, questions } = start;
  // Resuming: come back with what was already marked, on the first unanswered
  // question, and with the clock the attempt already had.
  const [selections, setSelections] = useState<Record<number, string[]>>(() =>
    Object.fromEntries(start.answers.map((answer) => [answer.exam_question_id, answer.selected_options])),
  );
  const [index, setIndex] = useState(() => {
    const answered = new Set(start.answers.map((answer) => answer.exam_question_id));
    const firstOpen = questions.findIndex((question) => !answered.has(question.id));
    return firstOpen === -1 ? Math.max(0, questions.length - 1) : firstOpen;
  });
  const [result, setResult] = useState<ExamAttemptResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  const durationSeconds = start.seconds_remaining;
  const clock = useCountdown(durationSeconds, result === null);

  const total = questions.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const question: ExamAttemptQuestion | undefined = questions[safeIndex];
  const answeredCount = useMemo(
    () => Object.values(selections).filter((options) => options.length > 0).length,
    [selections],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function finish() {
    if (finishing || result) return;
    setFinishing(true);
    setError('');
    try {
      setResult(await api.finishExamAttempt(attempt.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível encerrar o simulado.');
    } finally {
      setFinishing(false);
    }
  }

  // Running out of time ends the sitting exactly like pressing "Finalizar".
  useEffect(() => {
    if (clock.expired && !result && !finishing) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.expired, result, finishing]);

  function toggleOption(option: string) {
    if (!question || result) return;
    const current = selections[question.id] ?? [];
    const next =
      question.response_type === 'multiple'
        ? current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option]
        : [option];
    setSelections((state) => ({ ...state, [question.id]: next }));
    void api
      .recordExamAnswer(attempt.id, { exam_question_id: question.id, selected_options: next })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Não foi possível salvar esta resposta.');
      });
  }

  if (result) {
    return <ExamResult result={result} onClose={onClose} />;
  }

  if (!question) return null;

  const selected = selections[question.id] ?? [];
  const progress = total > 0 ? ((safeIndex + 1) / total) * 100 : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-runner-title"
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-stretch justify-center bg-slate-950/85 sm:items-center sm:p-6"
    >
      <div className="flex min-h-[100dvh] w-full max-w-5xl flex-col bg-white text-slate-900 shadow-2xl sm:min-h-0 sm:max-h-[92dvh] sm:rounded-3xl">
        <header className="border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Simulado</p>
              <h2 id="exam-runner-title" className="mt-1 text-xl font-black leading-tight sm:text-2xl">
                {exam.name}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Questão {safeIndex + 1} de {total} · {answeredCount} respondidas
                {start.resumed && ' · retomado'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {clock.timed && (
                <div
                  role="timer"
                  aria-live="off"
                  aria-label={`Tempo restante: ${formatClock(clock.remaining)}`}
                  className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2 font-black tabular-nums ${
                    clock.remaining <= 60
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : clock.remaining <= 300
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Timer size={16} />
                  {formatClock(clock.remaining)}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Sair do simulado sem perder o progresso"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="mt-4 h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <section className="mx-auto max-w-2xl">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-600">
              {question.response_type === 'multiple' ? 'Escolha todas que se aplicam' : 'Escolha uma'}
            </p>
            <h3 className="mt-3 text-2xl font-black leading-tight">{question.question}</h3>

            <div className="mt-6 space-y-3">
              {question.options.map((option) => {
                const active = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleOption(option)}
                    className={`flex w-full min-h-12 items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-black leading-relaxed transition ${
                      active
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                        question.response_type === 'multiple' ? 'rounded-md' : 'rounded-full'
                      } ${active ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300'}`}
                    >
                      {active && <CheckCircle2 size={12} />}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {error}
              </p>
            )}
          </section>
        </main>

        <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:rounded-b-3xl sm:px-7">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={safeIndex === 0}
              className="flex min-h-12 items-center justify-center gap-1 rounded-2xl border-2 border-slate-200 px-4 font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={18} /> Voltar
            </button>
            {safeIndex + 1 < total ? (
              <button
                type="button"
                onClick={() => setIndex((current) => Math.min(total - 1, current + 1))}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 font-black text-white hover:bg-indigo-700"
              >
                Próxima <ChevronRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void finish()}
                disabled={finishing}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 font-black text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {finishing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                Finalizar e ver resultado
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-xs font-bold text-slate-400">
            {answeredCount < total && `${total - answeredCount} questões ainda sem resposta · `}
            Sair mantém o progresso e o tempo
          </p>
        </footer>
      </div>
    </div>
  );
}
