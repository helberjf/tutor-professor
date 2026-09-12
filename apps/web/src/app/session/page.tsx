'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Home,
  Loader2,
  PartyPopper,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';

import { CelebrationOverlay } from '@/components/celebration';
import { StatusCard } from '@/components/status-card';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { ApiError, api, type StudyQueueItem, type StudySession } from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';

/**
 * One study run, start to finish, with nothing to choose on the way in.
 *
 * The queue is assembled and stored by the API, so this screen opens on the card
 * the child stopped at — that is what makes "continuar de onde parou" true after
 * the app was closed, the tab was reloaded, or the phone was handed back.
 *
 * Every answer is recorded through the endpoint that already owns that card type
 * (review, lesson question or study question), so the metrics, the level ladder
 * and the activity log keep working exactly as they did. The only thing this
 * screen owns is the bookmark.
 */

type Phase = 'loading' | 'running' | 'finished' | 'empty' | 'error';

export default function StudySessionPage() {
  const authState = useRequireAuth();
  const [session, setSession] = useState<StudySession | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attemptError, setAttemptError] = useState('');
  const [audioBusy, setAudioBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const mountedRef = useRef(true);
  const completedLessonsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (restart: boolean) => {
    setPhase('loading');
    setError(null);
    setAttemptError('');
    try {
      const data = await api.startStudySession(restart ? { restart: true } : {});
      if (!mountedRef.current) return;
      setSession(data);
      if (data.total === 0) {
        setPhase('empty');
        return;
      }
      const resumeAt = Math.min(Math.max(data.position, 0), data.total);
      setIndex(resumeAt);
      setAnswered(data.answered_count);
      setCorrect(data.correct_count);
      setSelected(null);
      setRevealed(false);
      setPhase(resumeAt >= data.total ? 'finished' : 'running');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel abrir a sessao.'));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    const restart =
      typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('restart') === '1';
    void load(restart);
  }, [authState.status, load]);

  const items = session?.items ?? [];
  const total = items.length;
  const card = items[index] ?? null;
  const progressPercent = total > 0 ? Math.round((index / total) * 100) : 0;

  /** Saves the bookmark without blocking the child: a failed save is not fatal. */
  function saveProgress(nextIndex: number, nextAnswered: number, nextCorrect: number) {
    if (!session || session.id <= 0) return;
    void api
      .saveStudySessionProgress(session.id, {
        position: nextIndex,
        answered_count: nextAnswered,
        correct_count: nextCorrect,
      })
      .catch(() => {
        /* The queue is still on screen; the bookmark catches up on the next answer. */
      });
  }

  async function finish(nextAnswered: number, nextCorrect: number) {
    setPhase('finished');
    setCelebrate(nextAnswered > 0);
    if (!session || session.id <= 0) return;
    try {
      await api.finishStudySession(session.id, {
        answered_count: nextAnswered,
        correct_count: nextCorrect,
      });
    } catch {
      /* The answers are already recorded; only the day stamp is at stake. */
    }
  }

  function advance(wasCorrect: boolean) {
    const nextAnswered = answered + 1;
    const nextCorrect = correct + (wasCorrect ? 1 : 0);
    const nextIndex = index + 1;
    setAnswered(nextAnswered);
    setCorrect(nextCorrect);
    setSelected(null);
    setRevealed(false);
    setAttemptError('');

    if (nextIndex >= total) {
      saveProgress(nextIndex, nextAnswered, nextCorrect);
      void finish(nextAnswered, nextCorrect);
      return;
    }
    setIndex(nextIndex);
    saveProgress(nextIndex, nextAnswered, nextCorrect);
  }

  /**
   * Marks the lesson finished once its last teaching card is gone.
   *
   * That is what seeds the review items and the lesson's free question bank, so
   * a lesson studied inside a session feeds tomorrow's queue the same way the
   * lesson screen always did.
   */
  function completeLessonIfDone(currentCard: StudyQueueItem) {
    const lessonId = currentCard.lesson_id;
    if (currentCard.kind !== 'lesson_item' || !lessonId) return;
    if (completedLessonsRef.current.has(lessonId)) return;
    const remaining = items
      .slice(index + 1)
      .some((item) => item.kind === 'lesson_item' && item.lesson_id === lessonId);
    if (remaining) return;
    completedLessonsRef.current.add(lessonId);
    void api.completeLesson(lessonId).catch(() => {
      completedLessonsRef.current.delete(lessonId);
    });
  }

  async function answerCard(option: string | null, wasCorrect: boolean) {
    if (!card || saving) return;
    setSaving(true);
    setAttemptError('');
    try {
      if (card.kind === 'vocabulary') {
        await api.submitReviewAttempt({
          card_type: 'vocabulary',
          review_item_id: card.ref_id,
          word_en: card.word_en ?? card.audio_text ?? '',
          word_pt: card.word_pt ?? card.answer,
          correct: wasCorrect,
        });
      } else if (card.kind === 'lesson_question') {
        await api.submitReviewAttempt({
          card_type: 'lesson_question',
          lesson_question_id: card.ref_id,
          correct: wasCorrect,
        });
      } else if (card.kind === 'study_question' && option) {
        await api.submitStudyQuestionAttempt(card.ref_id, { selected_option: option });
      } else if (card.kind === 'lesson_item') {
        completeLessonIfDone(card);
      }
    } catch (err) {
      if (mountedRef.current) {
        setAttemptError(
          err instanceof Error
            ? err.message
            : 'Nao foi possivel salvar esta resposta. Ela continua valendo na tela.',
        );
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
    advance(wasCorrect);
  }

  async function playAudio(text: string) {
    if (!text || audioBusy) return;
    setAudioBusy(true);
    try {
      const data = await api.speak(text);
      await playAudioWithFallback(data.audio_url ? api.getAudioUrl(data.audio_url) : null, text);
    } catch {
      await playAudioWithFallback(null, text);
    } finally {
      if (mountedRef.current) setAudioBusy(false);
    }
  }

  function chooseOption(option: string) {
    if (selected || saving || !card) return;
    setSelected(option);
    const expected = card.kind === 'study_question' ? card.correct_option ?? '' : card.answer;
    const wasCorrect = option === expected;
    // The answer stays on screen for a beat so the child sees what was right
    // before the next card replaces it.
    window.setTimeout(() => {
      if (mountedRef.current) void answerCard(option, wasCorrect);
    }, 1100);
  }

  if (authState.status === 'loading' || phase === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="inline-flex items-center gap-2 text-base font-bold text-slate-500">
          <Loader2 className="animate-spin" size={20} /> Montando seus estudos
        </p>
      </main>
    );
  }

  if (authState.status === 'server_missing' || phase === 'error') {
    return (
      <main>
        <div>
          <StatusCard
            tone="error"
            title="Nao foi possivel abrir a sessao"
            message={error?.message || 'Tente novamente em instantes.'}
            primaryAction={
              <button
                type="button"
                onClick={() => void load(false)}
                className="rounded-full bg-primary px-6 py-3 text-base font-black text-white transition hover:brightness-110"
              >
                Tentar de novo
              </button>
            }
            secondaryHref="/"
            secondaryLabel="Voltar ao inicio"
          />
        </div>
      </main>
    );
  }

  if (phase === 'empty') {
    return (
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <div className="kid-surface border-emerald-200 p-8">
            <PartyPopper size={40} className="mx-auto text-emerald-500" />
            <h1 className="mt-4 text-2xl font-black text-slate-800">Tudo em dia!</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Nao ha revisao vencida nem questoes pendentes agora. Faca uma licao nova ou gere
              questoes para continuar praticando.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/lesson"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-sm font-black text-white hover:bg-sky-600"
              >
                <Sparkles size={16} /> Abrir licao
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                <Home size={16} /> Inicio
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'finished') {
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return (
      <main className="min-h-screen px-4 py-10">
        <CelebrationOverlay show={celebrate} />
        <div className="mx-auto max-w-xl">
          <div className="kid-surface border-emerald-200 p-8 text-center">
            <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
            <h1 className="mt-4 text-2xl font-black text-slate-800">Sessao concluida</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              {answered} {answered === 1 ? 'item respondido' : 'itens respondidos'} · {accuracy}% de acerto
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              O dia ja foi marcado como estudado. Nao precisa escrever nada.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void load(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-sm font-black text-white hover:bg-emerald-600"
              >
                <RotateCcw size={16} /> Estudar mais
              </button>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                <Home size={16} /> Voltar ao inicio
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!card) return null;

  return (
    <main className="min-h-screen px-3 py-4 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-2xl">
        {/* Progress: the only chrome on the screen */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 text-slate-500 transition hover:bg-slate-50"
            aria-label="Sair da sessao"
          >
            <Home size={18} />
          </Link>
          <div
            className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Progresso da sessao"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-black tabular-nums text-slate-500">
            {index + 1}/{total}
          </span>
        </div>

        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          {card.source_label || 'Estudo'}
          {card.topic_title ? ` · ${card.topic_title}` : ''}
        </p>

        <section className="kid-surface mt-2 border-sky-100 p-5 sm:p-7">
          {card.kind === 'lesson_item' && (
            <LessonItemCard
              card={card}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              onNext={() => void answerCard(null, true)}
              onPlay={() => void playAudio(card.audio_text || card.prompt)}
              audioBusy={audioBusy}
              saving={saving}
            />
          )}

          {(card.kind === 'vocabulary' || card.kind === 'study_question') && (
            <ChoiceCard
              card={card}
              selected={selected}
              onChoose={chooseOption}
              onPlay={() => void playAudio(card.audio_text || card.prompt)}
              audioBusy={audioBusy}
            />
          )}

          {card.kind === 'lesson_question' && (
            <SelfRatedCard
              card={card}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              onRate={(wasCorrect) => void answerCard(null, wasCorrect)}
              onPlay={() => void playAudio(card.audio_text || card.answer)}
              audioBusy={audioBusy}
              saving={saving}
            />
          )}

          {attemptError && (
            <p role="alert" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
              {attemptError}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function AudioButton({ onPlay, busy }: { onPlay: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={busy}
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 transition hover:bg-sky-100 disabled:opacity-50"
      aria-label="Ouvir"
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
    </button>
  );
}

/** Teaching card: the phrase, then its meaning, then on to the next one. */
function LessonItemCard({
  card,
  revealed,
  onReveal,
  onNext,
  onPlay,
  audioBusy,
  saving,
}: {
  card: StudyQueueItem;
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
  onPlay: () => void;
  audioBusy: boolean;
  saving: boolean;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xl font-black leading-tight text-slate-800 sm:text-3xl">{card.prompt}</p>
        <AudioButton onPlay={onPlay} busy={audioBusy} />
      </div>
      {card.example && <p className="mt-3 text-sm font-semibold text-slate-500">{card.example}</p>}

      {revealed ? (
        <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-4">
          <p className="text-lg font-black text-emerald-800">{card.answer}</p>
          {card.example_translation && (
            <p className="mt-1 text-sm font-semibold text-emerald-700">{card.example_translation}</p>
          )}
        </div>
      ) : null}

      <div className="mt-6">
        {revealed ? (
          <button
            type="button"
            onClick={onNext}
            disabled={saving}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-base font-black text-white transition hover:bg-emerald-600 disabled:opacity-50 sm:w-auto"
          >
            Entendi <ArrowRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onReveal}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-base font-black text-white transition hover:bg-sky-600 sm:w-auto"
          >
            Ver o significado
          </button>
        )}
      </div>
    </div>
  );
}

/** Multiple choice, for vocabulary review and for saved study questions. */
function ChoiceCard({
  card,
  selected,
  onChoose,
  onPlay,
  audioBusy,
}: {
  card: StudyQueueItem;
  selected: string | null;
  onChoose: (option: string) => void;
  onPlay: () => void;
  audioBusy: boolean;
}) {
  const expected = card.kind === 'study_question' ? card.correct_option ?? '' : card.answer;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xl font-black leading-snug text-slate-800 sm:text-2xl">{card.prompt}</p>
        {card.audio_text ? <AudioButton onPlay={onPlay} busy={audioBusy} /> : null}
      </div>

      <div className="mt-5 grid gap-2.5">
        {card.options.map((option) => {
          const isChosen = selected === option;
          const isRight = option === expected;
          const state = selected
            ? isRight
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
              : isChosen
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-white text-slate-400'
            : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50';
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChoose(option)}
              disabled={Boolean(selected)}
              className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-bold transition ${state}`}
            >
              <span>{option}</span>
              {selected && isRight && <CheckCircle2 size={18} className="shrink-0" />}
              {selected && isChosen && !isRight && <XCircle size={18} className="shrink-0" />}
            </button>
          );
        })}
      </div>

      {selected && card.explanation && (
        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
          {card.explanation}
        </p>
      )}
    </div>
  );
}

/** Lesson questions have no options, so the child says whether they knew it. */
function SelfRatedCard({
  card,
  revealed,
  onReveal,
  onRate,
  onPlay,
  audioBusy,
  saving,
}: {
  card: StudyQueueItem;
  revealed: boolean;
  onReveal: () => void;
  onRate: (correct: boolean) => void;
  onPlay: () => void;
  audioBusy: boolean;
  saving: boolean;
}) {
  return (
    <div>
      <p className="text-xl font-black leading-snug text-slate-800 sm:text-2xl">{card.prompt}</p>
      {card.prompt_translation && (
        <p className="mt-2 text-sm font-semibold text-slate-500">{card.prompt_translation}</p>
      )}

      {revealed ? (
        <>
          <div className="mt-5 flex items-start justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-4">
            <div>
              <p className="text-lg font-black text-emerald-800">{card.answer}</p>
              {card.supporting_example && (
                <p className="mt-1 text-sm font-semibold text-emerald-700">{card.supporting_example}</p>
              )}
            </div>
            <AudioButton onPlay={onPlay} busy={audioBusy} />
          </div>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onRate(false)}
              disabled={saving}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 text-base font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <XCircle size={18} /> Ainda nao sei
            </button>
            <button
              type="button"
              onClick={() => onRate(true)}
              disabled={saving}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-base font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              <CheckCircle2 size={18} /> Eu sabia
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onReveal}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-base font-black text-white transition hover:bg-sky-600 sm:w-auto"
        >
          Ver a resposta
        </button>
      )}
    </div>
  );
}
