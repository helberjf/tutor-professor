'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, X, XCircle } from 'lucide-react';
import { api, type CodingReviewCard } from '@/lib/api';

interface Props {
  subjectName: string;
  cards: CodingReviewCard[];
  onClose: () => void;
}

type Mode = 'flip' | 'choice';

interface CardState {
  revealed: boolean;
  done: boolean;
  correct: boolean | null;
}

export function ReviewSession({ subjectName, cards, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('flip');
  const [states, setStates] = useState<CardState[]>(cards.map(() => ({ revealed: false, done: false, correct: null })));
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);

  const card = cards[index];
  const state = states[index];
  const total = cards.length;
  const correct = states.filter((s) => s.correct === true).length;
  const wrong = states.filter((s) => s.correct === false).length;

  // Build multiple-choice options once (stable)
  const [choiceOptions] = useState(() =>
    cards.map((c) => {
      const correctAns = c.back.slice(0, 120);
      const others = cards
        .filter((o) => o.flashcard_id !== c.flashcard_id)
        .map((o) => o.back.slice(0, 120))
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      return [correctAns, ...others].sort(() => Math.random() - 0.5);
    }),
  );

  async function handleAnswer(isCorrect: boolean) {
    setSubmitting(true);
    try {
      await api.submitCodingReviewAttempt({ review_item_id: card.review_item_id, correct: isCorrect });
    } finally {
      setSubmitting(false);
    }
    setStates((prev) => prev.map((s, i) => (i === index ? { ...s, done: true, correct: isCorrect } : s)));
    if (index + 1 >= total) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="rounded-full bg-emerald-100 p-6">
          <CheckCircle2 size={48} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-800">Revisão concluída!</h2>
        <div className="flex gap-8">
          <div><p className="text-3xl font-black text-emerald-600">{correct}</p><p className="text-sm font-bold text-slate-500">Acertos</p></div>
          <div><p className="text-3xl font-black text-rose-500">{wrong}</p><p className="text-sm font-bold text-slate-500">Erros</p></div>
          <div><p className="text-3xl font-black text-slate-700">{total}</p><p className="text-sm font-bold text-slate-500">Total</p></div>
        </div>
        <button type="button" onClick={onClose} className="rounded-2xl bg-primary px-8 py-3 font-black text-white hover:bg-primary-dark">
          Fechar
        </button>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Revisão · {subjectName}</p>
          <p className="text-sm font-bold text-slate-600">{index + 1} / {total}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-2xl border-2 border-slate-200">
            {(['flip', 'choice'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-2 text-xs font-black transition ${mode === m ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                {m === 'flip' ? 'Flip' : 'Múltipla'}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      {/* Card */}
      <div className="min-h-48 rounded-3xl border-2 border-slate-100 bg-white p-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Frente</p>
        <p className="text-lg font-black text-slate-800">{card.front}</p>

        {mode === 'flip' && (
          <>
            {!state.revealed ? (
              <button
                type="button"
                onClick={() => setStates((prev) => prev.map((s, i) => (i === index ? { ...s, revealed: true } : s)))}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary py-3 font-black text-primary hover:bg-primary-light"
              >
                <ChevronRight size={18} /> Revelar resposta
              </button>
            ) : (
              <>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Verso</p>
                  <p className="leading-relaxed text-slate-700">{card.back}</p>
                  {card.code_example && (
                    <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-3 text-xs text-slate-100">
                      <code>{card.code_example}</code>
                    </pre>
                  )}
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleAnswer(false)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 py-3 font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={18} />} Não sabia
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleAnswer(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 py-3 font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={18} />} Sabia!
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {mode === 'choice' && (
          <div className="mt-5 space-y-2">
            {choiceOptions[index].map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={state.done || submitting}
                onClick={() => handleAnswer(opt === card.back.slice(0, 120))}
                className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-primary disabled:cursor-default disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
