'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronRight, Loader2, RotateCcw, X, XCircle } from 'lucide-react';

import { ApiError, api, type StudyLogEntry, type StudyLogReviewItem } from '@/lib/api';
import { t, tf } from '@/lib/i18n';

import { reviewScore } from './study-log-helpers';

export interface ReviewScope {
  discipline?: string;
  subject?: string | null;
  entryId?: number;
}

/**
 * Review the questions of the sheets, like flashcards: read the question, try
 * to answer, reveal, and say whether you knew it. Each entry's result is saved
 * as soon as its questions are done, so closing halfway keeps what was done.
 */
export function StudyLogReviewModal({
  discipline,
  subject,
  entryId,
  heading,
  onClose,
  onReviewed,
}: ReviewScope & {
  heading: string;
  onClose: () => void;
  onReviewed: (entry: StudyLogEntry) => void;
}) {
  const [items, setItems] = useState<StudyLogReviewItem[] | null>(null);
  const [error, setError] = useState('');
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState<Record<number, number>>({});
  const [answered, setAnswered] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  // Rendered on <body>: a fixed layer inside the page's spaced column would
  // inherit its top margin; the page behind also stops scrolling.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      setMounted(false);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const load = useCallback(async () => {
    setItems(null);
    setError('');
    setPosition(0);
    setRevealed(false);
    setKnown({});
    setAnswered({});
    setFinished(false);
    try {
      setItems(await api.getStudyLogReview({ discipline, subject, entryId }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Não foi possível abrir a revisão."));
      setItems([]);
    }
  }, [discipline, subject, entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const questions = useMemo(
    () => (items ?? []).flatMap((item) => item.questions.map((question) => ({ ...question, item }))),
    [items],
  );
  const current = questions[position];

  const answer = useCallback(
    async (knew: boolean) => {
      if (!current || saving) return;
      const entry = current.item;
      const entryKnown = (known[entry.id] ?? 0) + (knew ? 1 : 0);
      const entryAnswered = (answered[entry.id] ?? 0) + 1;
      setKnown((value) => ({ ...value, [entry.id]: entryKnown }));
      setAnswered((value) => ({ ...value, [entry.id]: entryAnswered }));
      if (entryAnswered === entry.questions.length) {
        setSaving(true);
        try {
          onReviewed(await api.submitStudyLogReview(entry.id, { known: entryKnown, total: entryAnswered }));
        } catch (err) {
          setError(err instanceof ApiError ? err.message : t("Não foi possível salvar a revisão."));
        } finally {
          setSaving(false);
        }
      }
      if (position + 1 >= questions.length) {
        setFinished(true);
      } else {
        setPosition(position + 1);
        setRevealed(false);
      }
    },
    [answered, current, known, onReviewed, position, questions.length, saving],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (finished || !current || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && event.key === '1') {
        void answer(true);
      } else if (revealed && event.key === '2') {
        void answer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, current, finished, onClose, revealed]);

  const totalKnown = Object.values(known).reduce((sum, value) => sum + value, 0);
  const totalAnswered = Object.values(answered).reduce((sum, value) => sum + value, 0);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-log-review-title"
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-6"
    >
      <div className="relative flex h-[100dvh] w-full flex-col overflow-y-auto bg-white px-5 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] pt-[calc(1.5rem_+_env(safe-area-inset-top))] sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[1.5rem] sm:border-2 sm:border-slate-200 sm:p-7 sm:shadow-[0_28px_90px_rgba(15,23,42,0.35)]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Fechar revisão")}
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 sm:right-4 sm:top-4"
        >
          <X size={16} />
        </button>

        <div className="space-y-5 pr-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("Modo revisar")}</p>
            <h2 id="study-log-review-title" className="mt-1 break-words text-xl font-black leading-tight text-slate-800">
              {heading}
            </h2>
          </div>
        </div>

        <div className="mt-5 flex-1 space-y-5">
          {error ? <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}

          {items === null ? (
            <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <Loader2 className="animate-spin" size={16} /> {t("Montando a revisão…")}
            </p>
          ) : questions.length === 0 ? (
            <div className="rounded-3xl bg-slate-50 p-6 text-center">
              <p className="font-black text-slate-800">{t("Nada para revisar aqui ainda")}</p>
              <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-slate-500">
                {t("As perguntas vêm das fichas. Gere as fichas dos seus registros e volte para revisar.")}
              </p>
            </div>
          ) : finished ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-emerald-50 p-6 text-center">
                <p className="text-4xl font-black text-emerald-700">{reviewScore(totalKnown, totalAnswered)}%</p>
                <p className="mt-2 font-black text-slate-800">
                  {tf("Você sabia {known} de {total} perguntas", { known: totalKnown, total: totalAnswered })}
                </p>
              </div>
              <ul className="space-y-2">
                {(items ?? []).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-100 px-4 py-3">
                    <span className="min-w-0 break-words text-sm font-black text-slate-700">{item.title}</span>
                    <span className="shrink-0 text-xs font-black text-slate-500">
                      {known[item.id] ?? 0}/{item.questions.length}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-primary font-black text-primary hover:bg-primary-light"
                >
                  <RotateCcw size={18} /> {t("Revisar de novo")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary-dark font-black text-white hover:bg-primary"
                >
                  {t("Concluir")}
                </button>
              </div>
            </div>
          ) : current ? (
            <>
              <div>
                <p className="text-sm font-bold text-slate-600">
                  {tf("Pergunta {current} de {total}", { current: position + 1, total: questions.length })}
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-primary-dark transition-all"
                    style={{ width: `${(position / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="min-h-48 rounded-3xl border-2 border-slate-100 bg-white p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {current.item.discipline}
                  {current.item.subject ? ` › ${current.item.subject}` : ''}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-500">{current.item.title}</p>
                <p className="mt-4 break-words text-lg font-black text-slate-800">{current.question}</p>

                {!revealed ? (
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary font-black text-primary hover:bg-primary-light"
                  >
                    <ChevronRight size={18} /> {t("Mostrar resposta")}
                  </button>
                ) : (
                  <>
                    <div className="mt-5 rounded-2xl bg-sky-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("Resposta")}</p>
                      <p className="mt-1 break-words font-semibold leading-relaxed text-slate-700">{current.answer}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void answer(false)}
                        disabled={saving}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 font-black text-rose-700 transition hover:border-rose-300 disabled:opacity-60"
                      >
                        <XCircle size={18} /> {t("Não sabia")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void answer(true)}
                        disabled={saving}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50 font-black text-emerald-700 transition hover:border-emerald-300 disabled:opacity-60"
                      >
                        <CheckCircle2 size={18} /> {t("Sabia")}
                      </button>
                    </div>
                    <p className="mt-3 hidden text-center text-xs font-semibold text-slate-400 sm:block">
                      {t("Atalhos: 1 = sabia · 2 = não sabia")}
                    </p>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
