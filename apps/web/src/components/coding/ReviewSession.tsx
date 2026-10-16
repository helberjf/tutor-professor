'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, HelpCircle, Loader2, X, XCircle } from 'lucide-react';
import { type CodingReviewCard, type ReviewRating } from '@/lib/api';
import { SyntaxCodeBlock } from './SyntaxCodeBlock';
import { t } from '@/lib/i18n';
import { useCurriculumApi } from './curriculum-context';

interface Props {
  subjectName: string;
  cards: CodingReviewCard[];
  onClose: () => void;
}

type Mode = 'flip' | 'choice';

interface CardState {
  revealed: boolean;
  done: boolean;
  rating: ReviewRating | null;
  selected: string | null;
}

export function ReviewSession({ subjectName, cards, onClose }: Props) {
  const curriculum = useCurriculumApi();
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('flip');
  const [states, setStates] = useState<CardState[]>(cards.map(() => ({ revealed: false, done: false, rating: null, selected: null })));
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);

  const card = cards[index];
  const state = states[index];
  const total = cards.length;
  const knew = states.filter((state) => state.rating === 'knew').length;
  const partial = states.filter((state) => state.rating === 'partial').length;
  const unknown = states.filter((state) => state.rating === 'unknown').length;

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

  async function submitRating(rating: ReviewRating, selected: string | null = null) {
    setSubmitting(true);
    try {
      await curriculum.submitCodingReviewAttempt({ review_item_id: card.review_item_id, rating });
    } finally {
      setSubmitting(false);
    }
    setStates((prev) => prev.map((s, i) => (i === index ? { ...s, done: true, rating, selected } : s)));
  }

  function advance() {
    if (index + 1 >= total) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  async function handleAnswer(rating: ReviewRating) {
    await submitRating(rating);
    advance();
  }

  // Multiple choice: record the attempt, then keep the card on screen with
  // right/wrong feedback until the person moves on.
  async function handleChoice(option: string) {
    await submitRating(option === card.back.slice(0, 120) ? 'knew' : 'unknown', option);
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="rounded-full bg-emerald-100 p-6">
          <CheckCircle2 size={48} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-800">{t("Revisão concluída!")}</h2>
        <div className="flex gap-8">
          <div><p className="text-3xl font-black text-emerald-600">{knew}</p><p className="text-sm font-bold text-slate-500">{t("Sabia")}</p></div>
          <div><p className="text-3xl font-black text-amber-500">{partial}</p><p className="text-sm font-bold text-slate-500">{t("Parcial")}</p></div>
          <div><p className="text-3xl font-black text-rose-500">{unknown}</p><p className="text-sm font-bold text-slate-500">{t("Não sabia")}</p></div>
          <div><p className="text-3xl font-black text-slate-700">{total}</p><p className="text-sm font-bold text-slate-500">{t("Total")}</p></div>
        </div>
        <p className="max-w-sm text-sm text-slate-500">
          {t("O que você marcou como")} <span className="font-bold text-rose-500">{t("não sabia")}</span> {t("volta em minutos,")}{' '}
          <span className="font-bold text-amber-500">parcial</span> {t("volta mais cedo e")}{' '}
          <span className="font-bold text-emerald-600">sabia</span> {t("espaça a próxima revisão.")}
        </p>
        <button type="button" onClick={onClose} className="rounded-2xl bg-primary-dark px-8 py-3 font-black text-white hover:bg-primary-dark">
          {t("Fechar")}
        </button>
      </div>
    );
  }

  if (!card) return null;

  const correctChoice = card.back.slice(0, 120);
  const choiceCorrect = state.selected === correctChoice;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("Revisão ·")} {subjectName}</p>
          <p className="text-sm font-bold text-slate-600">{index + 1} / {total}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-2xl border-2 border-slate-200">
            {(['flip', 'choice'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-2 text-xs font-black transition ${mode === m ? 'bg-primary-dark text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
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
        <div className="h-1.5 rounded-full bg-primary-dark transition-all" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      {/* Card */}
      <div className="min-h-48 rounded-3xl border-2 border-slate-100 bg-white p-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">{t("Frente")}</p>
        <p className="text-lg font-black text-slate-800">{card.front}</p>

        {mode === 'flip' && (
          <>
            {!state.revealed && !state.done ? (
              <button
                type="button"
                onClick={() => setStates((prev) => prev.map((s, i) => (i === index ? { ...s, revealed: true } : s)))}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary py-3 font-black text-primary hover:bg-primary-light"
              >
                <ChevronRight size={18} /> {t("Revelar resposta")}
              </button>
            ) : (
              <>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">{t("Verso")}</p>
                  <p className="leading-relaxed text-slate-700">{card.back}</p>
                  {card.code_example && (
                    <SyntaxCodeBlock code={card.code_example} language="typescript" className="mt-3 p-3" />
                  )}
                </div>
                {state.done ? (
                  <NextButton last={index + 1 >= total} onClick={advance} />
                ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleAnswer('unknown')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-rose-200 bg-rose-50 py-3 text-sm font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} {t("Não sabia")}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleAnswer('partial')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-200 bg-amber-50 py-3 text-sm font-black text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <HelpCircle size={16} />} {t("Parcial")}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleAnswer('knew')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {t("Sabia!")}
                  </button>
                </div>
                )}
              </>
            )}
          </>
        )}

        {mode === 'choice' && (
          <>
            <div className="mt-5 space-y-2">
              {choiceOptions[index].map((opt) => {
                const isCorrect = opt === correctChoice;
                const isSelected = state.selected === opt;
                let cls = 'flex w-full items-center gap-2 rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition ';
                if (!state.done) cls += 'border-slate-200 text-slate-700 hover:border-primary disabled:opacity-50';
                else if (isCorrect) cls += 'border-emerald-400 bg-emerald-50 text-emerald-700';
                else if (isSelected) cls += 'border-rose-300 bg-rose-50 text-rose-700';
                else cls += 'border-slate-100 text-slate-400';
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={state.done || submitting}
                    onClick={() => handleChoice(opt)}
                    className={`${cls} disabled:cursor-default`}
                  >
                    <span className="flex-1">{opt}</span>
                    {state.done && isCorrect && <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />}
                    {state.done && isSelected && !isCorrect && <XCircle size={18} className="shrink-0 text-rose-500" />}
                  </button>
                );
              })}
            </div>
            {state.done && state.selected !== null && (
              <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${choiceCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <p className="font-black">{choiceCorrect ? t("✅ Correto!") : t("❌ Incorreto.")}</p>
                <p className="mt-1 leading-relaxed">{card.back}</p>
                {card.code_example && (
                  <SyntaxCodeBlock code={card.code_example} language="typescript" className="mt-3 p-3" />
                )}
              </div>
            )}
            {state.done && <NextButton last={index + 1 >= total} onClick={advance} />}
          </>
        )}
      </div>
    </div>
  );
}

function NextButton({ last, onClick }: { last: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-dark py-3 font-black text-white hover:bg-primary-dark"
    >
      {last ? t("Ver resultado") : t("Próxima")} <ChevronRight size={18} />
    </button>
  );
}
