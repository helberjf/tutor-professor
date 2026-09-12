'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Loader2, RotateCcw, Sparkles } from 'lucide-react';

import { api, type StudyQuestion, type StudyQuestionTarget } from '@/lib/api';
import { buildPracticeQueue, countPending } from '@/lib/question-queue';

import { PracticeQuestionsModal } from './PracticeQuestionsModal';

/** Below this many unanswered questions, the topic is topped up in the background. */
const PREFETCH_THRESHOLD = 3;

/**
 * "Modo questões" for a study area outside the programming curriculum.
 *
 * Same contract as the programming simulado: questions are saved per subject and
 * topic, never repeat, and every answer shows the explanation for the correct
 * option. The panel owns loading, generation and the practice modal so a tab only
 * has to say which subject and topic it is looking at.
 *
 * Three things it does so the child does not have to:
 *
 * - **Fills itself.** An empty topic asks the API for the free, lesson-derived
 *   bank before showing an empty state, so "modo questões" works with no AI key,
 *   no credit left, and no provider.
 * - **Practises what is owed.** The session starts on what was never answered or
 *   was missed, and drops what was already mastered, instead of replaying the
 *   whole topic from the first question every time.
 * - **Stays stocked.** When the pile runs low, the next batch is requested in the
 *   background, so the child is not left watching a spinner to get a question.
 */
export function StudyQuestionsPanel({
  target,
  tone = 'amber',
  emptyHint,
  generationContext,
}: {
  target: StudyQuestionTarget;
  tone?: 'amber' | 'sky';
  emptyHint?: string;
  generationContext?: string;
}) {
  const [questions, setQuestions] = useState<StudyQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [replayAll, setReplayAll] = useState(false);
  const [showContextForm, setShowContextForm] = useState(false);
  const [context, setContext] = useState('');
  const loadRequestRef = useRef(0);
  const mountedRef = useRef(true);
  // One background top-up per topic per visit: the point is to stay ahead of the
  // child, not to queue a provider call after every answer.
  const prefetchedRef = useRef(false);

  const { area, subject_name: subjectName, topic_key: topicKey, topic_title: topicTitle } = target;
  const generationContextPrefix = generationContext?.trim() ?? '';
  const contextMaxLength = Math.max(0, 1000 - (generationContextPrefix ? generationContextPrefix.length + 2 : 0));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const target = {
        area,
        subject_name: subjectName,
        topic_key: topicKey,
        topic_title: topicTitle,
      };
      let loaded = await api.getStudyQuestions(target);
      if (loaded.length === 0) {
        // Nothing saved for this topic yet. The free bank is derived from the
        // lesson itself, so it costs nothing and arrives immediately — an empty
        // screen here was only ever a missing question, never a missing lesson.
        loaded = await api.ensureStudyQuestions(target).catch(() => loaded);
      }
      if (requestId !== loadRequestRef.current || !mountedRef.current) return;
      setQuestions(loaded);
    } catch {
      if (requestId !== loadRequestRef.current || !mountedRef.current) return;
      setLoadError('Não foi possível carregar as questões desta lição.');
    } finally {
      if (requestId === loadRequestRef.current && mountedRef.current) setLoading(false);
    }
  }, [area, subjectName, topicKey, topicTitle]);

  useEffect(() => {
    prefetchedRef.current = false;
    void load();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setActionError('');
    setSuccess('');
    try {
      const resolvedContext = [generationContextPrefix, context]
        .map((item) => item?.trim())
        .filter(Boolean)
        .join('\n\n');
      const created = await api.generateStudyQuestions(
        { area, subject_name: subjectName, topic_key: topicKey, topic_title: topicTitle },
        resolvedContext,
      );
      if (!mountedRef.current) return;
      setQuestions((current) => [...current, ...created]);
      setSuccess(`${created.length} questões criadas.`);
      setShowContextForm(false);
      setContext('');
    } catch (error) {
      if (!mountedRef.current) return;
      setActionError(error instanceof Error ? error.message : 'Não foi possível gerar as questões.');
    } finally {
      if (mountedRef.current) setGenerating(false);
    }
  }

  /** Ask for the next batch before the child needs it, and only once. */
  function topUpInBackground(remaining: number) {
    if (prefetchedRef.current || remaining > PREFETCH_THRESHOLD) return;
    prefetchedRef.current = true;
    void api
      .prefetchStudyQuestions(
        { area, subject_name: subjectName, topic_key: topicKey, topic_title: topicTitle },
        PREFETCH_THRESHOLD + 2,
      )
      .catch(() => {
        // A top-up nobody asked for must never surface as an error.
        prefetchedRef.current = false;
      });
  }

  async function handleAnswer(questionId: number, selectedOption: string) {
    const result = await api.submitStudyQuestionAttempt(questionId, { selected_option: selectedOption });
    setQuestions((current) => {
      const updated = current.map((item) =>
        item.id === questionId
          ? {
              ...item,
              attempt_count: result.attempt_count,
              correct_count: result.correct_count,
              error_count: result.error_count,
              last_selected_option: result.last_selected_option,
              last_answered_at: result.last_answered_at,
            }
          : item,
      );
      topUpInBackground(countPending(updated));
      return updated;
    });
    return result;
  }

  const palette =
    tone === 'sky'
      ? {
          shell: 'border-sky-100 bg-sky-50',
          title: 'text-sky-900',
          helper: 'text-sky-700',
          primary: 'bg-sky-500 hover:bg-sky-600',
          secondary: 'border-sky-200 text-sky-800 hover:bg-sky-100',
          field: 'border-sky-100 bg-sky-50/40 focus:border-sky-400',
        }
      : {
          shell: 'border-amber-100 bg-amber-50',
          title: 'text-amber-900',
          helper: 'text-amber-700',
          primary: 'bg-amber-500 hover:bg-amber-600',
          secondary: 'border-amber-200 text-amber-800 hover:bg-amber-100',
          field: 'border-amber-100 bg-amber-50/40 focus:border-amber-400',
        };

  const pendingCount = countPending(questions);
  const practiceList = buildPracticeQueue(questions, { includeMastered: replayAll });
  const countLabel = loading ? '...' : loadError ? 'erro' : String(questions.length);
  const busy = loading || generating;
  const hasQuestions = questions.length > 0;

  return (
    <div className={`rounded-3xl border-2 p-5 ${palette.shell}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className={`flex items-center gap-2 font-black ${palette.title}`}>
            <ClipboardList size={18} />
            Modo questões ({countLabel})
          </h3>
          <p className={`mt-1 text-xs font-bold ${palette.helper}`}>
            {!hasQuestions
              ? emptyHint || 'Gere questões de múltipla escolha para fazer o simulado desta lição.'
              : pendingCount > 0
                ? `${pendingCount} ${pendingCount === 1 ? 'questão' : 'questões'} para praticar. Começa pelas que você ainda não respondeu ou errou.`
                : 'Você já acertou todas duas vezes. Gere novas questões ou refaça as antigas.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setReplayAll(false);
              setPracticeOpen(true);
            }}
            disabled={busy || pendingCount === 0}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${palette.primary}`}
          >
            <ClipboardList size={15} />
            {pendingCount > 0 ? `Praticar o que falta (${pendingCount})` : 'Nada pendente'}
          </button>
          {hasQuestions && (
            <button
              type="button"
              onClick={() => {
                setReplayAll(true);
                setPracticeOpen(true);
              }}
              disabled={busy}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 bg-white px-4 py-2 text-sm font-black disabled:opacity-50 ${palette.secondary}`}
            >
              <RotateCcw size={15} />
              Refazer todas
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowContextForm((value) => !value);
              setActionError('');
              setSuccess('');
            }}
            disabled={busy}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 bg-white px-4 py-2 text-sm font-black disabled:opacity-50 ${palette.secondary}`}
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Gerar questões
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mt-2 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Recarregar questões
          </button>
        </div>
      )}

      {showContextForm && (
        <div className="mt-4 space-y-3 rounded-2xl border-2 border-white bg-white p-4">
          <label className="block">
            <span className={`text-sm font-black ${palette.title}`}>Foco das novas questões</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Ex.: questões estilo prova, cenários práticos, pegadinhas comuns..."
              maxLength={contextMaxLength}
              rows={3}
              className={`mt-2 w-full resize-none rounded-2xl border-2 px-3 py-2 text-sm text-slate-700 outline-none ${palette.field}`}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setShowContextForm(false);
                setContext('');
                setActionError('');
              }}
              disabled={generating}
              className={`rounded-2xl border-2 bg-white px-4 py-2 text-sm font-black disabled:opacity-50 ${palette.secondary}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={busy}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${palette.primary}`}
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? 'Gerando questões...' : 'Criar 5 questões'}
            </button>
          </div>
          {generationContextPrefix ? (
            <p className={`text-xs font-bold ${palette.helper}`}>
              Este modo ja inclui uma orientacao automatica. Voce ainda pode acrescentar ate {contextMaxLength} caracteres.
            </p>
          ) : null}
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {actionError}
        </p>
      )}
      {success && (
        <p role="status" className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {success}
        </p>
      )}

      {practiceOpen && practiceList.length > 0 && (
        <PracticeQuestionsModal
          subjectName={subjectName}
          topicTitle={topicTitle}
          questions={practiceList}
          onAnswer={handleAnswer}
          onClose={() => setPracticeOpen(false)}
        />
      )}
    </div>
  );
}
