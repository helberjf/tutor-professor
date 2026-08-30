'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';

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
}: {
  subjectName: string;
  topicTitle: string;
  questions: PracticeQuestion[];
  onAnswer: (questionId: number, selectedOption: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [finished, setFinished] = useState(false);
  const [attemptError, setAttemptError] = useState('');
  const total = questions.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const question = questions[safeIndex];
  const selectedOption = question ? answers[question.id] ?? '' : '';
  const isCorrect = question ? selectedOption === question.correct_option : false;
  const answered = Boolean(selectedOption);
  const progress = total > 0 ? ((safeIndex + 1) / total) * 100 : 0;
  const score = questions.filter((item) => answers[item.id] === item.correct_option).length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!question) return null;

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
    if (safeIndex + 1 >= total) setFinished(true);
    else setIndex((current) => current + 1);
  }

  function restart() {
    setIndex(0);
    setAnswers({});
    setFinished(false);
    setAttemptError('');
  }

  return (
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
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar questões"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
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
              <h3 className="mt-5 text-2xl font-black text-slate-900">Sessão concluída</h3>
              <p className="mt-2 text-lg font-black text-slate-700">
                Você acertou {score} de {total}
              </p>
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
    </div>
  );
}
