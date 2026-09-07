'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronRight, Timer, X } from 'lucide-react';

import { formatClock, useCountdown } from './use-countdown';

/** Minimal shape a question needs to be practised; ProgrammingQuestion and StudyQuestion both satisfy it. */
export interface PracticeQuestion {
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
}

export function PracticeQuestionsModal({
  subjectName,
  topicTitle,
  questions,
  onAnswer,
  onClose,
  durationSeconds,
}: {
  subjectName: string;
  topicTitle: string;
  questions: PracticeQuestion[];
  onAnswer: (questionId: number, selectedOption: string) => Promise<unknown>;
  onClose: () => void;
  /** Timed exam when set; omit for an untimed practice session. */
  durationSeconds?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [finished, setFinished] = useState(false);
  const [attemptError, setAttemptError] = useState('');
  const [ranOutOfTime, setRanOutOfTime] = useState(false);
  const clock = useCountdown(durationSeconds, !finished);
  const { timed, remaining } = clock;
  const elapsedRef = useRef(0);
  const total = questions.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const question = questions[safeIndex];
  const selectedOption = question ? answers[question.id] ?? '' : '';
  const isCorrect = question ? selectedOption === question.correct_option : false;
  const answered = Boolean(selectedOption);
  const progress = total > 0 ? ((safeIndex + 1) / total) * 100 : 0;
  const score = questions.filter((item) => answers[item.id] === item.correct_option).length;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!clock.expired || finished) return;
    elapsedRef.current = durationSeconds ?? 0;
    setRanOutOfTime(true);
    setFinished(true);
  }, [clock.expired, finished, durationSeconds]);

  if (!question || !mounted) return null;

  const shuffledOptions = [...question.options].sort((a, b) => {
    const seed = question.id + question.question.length * 31;
    const hashA = (seed * 73856093 ^ a.charCodeAt(0) * 19349663) % 1000;
    const hashB = (seed * 73856093 ^ b.charCodeAt(0) * 19349663) % 1000;
    return hashA - hashB;
  });

  function chooseOption(option: string) {
    if (answered) return;
    setAttemptError('');
    setAnswers((current) => ({ ...current, [question.id]: option }));
    void onAnswer(question.id, option).catch((err) => {
      setAttemptError(err instanceof Error ? err.message : 'Não foi possível salvar esta tentativa nas métricas.');
    });
  }

  function goNext() {
    if (safeIndex + 1 >= total) {
      if (timed) elapsedRef.current = (durationSeconds ?? 0) - remaining;
      setFinished(true);
    } else {
      setIndex((current) => current + 1);
    }
  }

  function restart() {
    setIndex(0);
    setAnswers({});
    setFinished(false);
    setAttemptError('');
    setRanOutOfTime(false);
    elapsedRef.current = 0;
    clock.restart();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="practice-questions-title"
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-6"
    >
      <div className="flex min-h-[100dvh] w-full max-w-5xl flex-col bg-white text-slate-900 shadow-2xl sm:min-h-0 sm:max-h-[92dvh] sm:rounded-3xl">
        <header className="border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-amber-600">{subjectName}</p>
              <h2 id="practice-questions-title" className="mt-1 text-xl font-black leading-tight text-slate-900 sm:text-2xl">
                {topicTitle}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {finished ? 'Resultado' : `Questão ${safeIndex + 1} de ${total}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {timed && !finished && (
                <div
                  role="timer"
                  aria-live="off"
                  aria-label={`Tempo restante: ${formatClock(remaining)}`}
                  className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2 font-black tabular-nums ${
                    remaining <= 60
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : remaining <= 300
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Timer size={16} />
                  {formatClock(remaining)}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar questões"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          {!finished && (
            <div className="mt-4 h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          {finished ? (
            <section className="mx-auto flex max-w-2xl flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-emerald-100 p-5 text-emerald-600">
                <CheckCircle2 size={42} />
              </div>
              <h3 className="mt-5 text-2xl font-black text-slate-900">
                {ranOutOfTime ? 'Tempo esgotado' : 'Sessão concluída'}
              </h3>
              <p className="mt-2 text-lg font-black text-slate-700">
                Você acertou {score} de {total}
              </p>
              {timed && (
                <p role="status" className="mt-2 text-sm font-bold text-slate-500">
                  {ranOutOfTime
                    ? `O tempo de ${formatClock(durationSeconds ?? 0)} acabou com ${total - Object.keys(answers).length} questões sem responder.`
                    : `Tempo usado: ${formatClock(elapsedRef.current)} de ${formatClock(durationSeconds ?? 0)}.`}
                </p>
              )}
              <p className="mt-2 text-sm font-bold text-slate-500">
                As próximas questões geradas para este tópico evitam as perguntas já salvas.
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={restart}
                  className="rounded-2xl border-2 border-amber-200 bg-white px-5 py-3 text-sm font-black text-amber-800 hover:bg-amber-50"
                >
                  Fazer novamente
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white hover:bg-amber-600"
                >
                  Fechar
                </button>
              </div>
            </section>
          ) : (
            <section className="mx-auto max-w-2xl">
              <p className="text-xs font-black uppercase tracking-widest text-amber-600">Questão {safeIndex + 1}</p>
              <h3 className="mt-3 text-2xl font-black leading-tight text-slate-900">{question.question}</h3>
              <div className="mt-6 space-y-3">
                {shuffledOptions.map((option) => {
                  const selected = selectedOption === option;
                  const correct = question.correct_option === option;
                  let className = 'w-full min-h-12 rounded-2xl border-2 px-4 py-3 text-left text-base font-black leading-relaxed transition ';
                  if (!answered) className += 'border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50';
                  else if (correct) className += 'border-emerald-400 bg-emerald-50 text-emerald-800';
                  else if (selected) className += 'border-rose-300 bg-rose-50 text-rose-700';
                  else className += 'border-slate-100 bg-slate-50 text-slate-400';

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={answered}
                      onClick={() => chooseOption(option)}
                      className={className}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <div className={`mt-6 rounded-2xl px-4 py-3 text-sm font-bold leading-relaxed ${isCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  {isCorrect ? 'Correto. ' : 'Ainda não. '}
                  {question.explanation}
                </div>
              )}
              {attemptError && (
                <p role="alert" className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  Resposta exibida, mas não entrou nas métricas: {attemptError}
                </p>
              )}
            </section>
          )}
        </main>

        {!finished && (
          <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:rounded-b-3xl sm:px-7">
            <button
              type="button"
              onClick={goNext}
              disabled={!answered}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-40"
            >
              {safeIndex + 1 >= total ? 'Ver resultado' : 'Próxima questão'}
              {safeIndex + 1 < total && <ChevronRight size={17} />}
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
