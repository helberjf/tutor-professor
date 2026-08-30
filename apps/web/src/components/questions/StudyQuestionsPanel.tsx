'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Loader2, Sparkles } from 'lucide-react';

import { api, type StudyQuestion, type StudyQuestionTarget } from '@/lib/api';

import { PracticeQuestionsModal } from './PracticeQuestionsModal';

/**
 * "Modo questões" for a study area outside the programming curriculum.
 *
 * Same contract as the programming simulado: questions are saved per subject and
 * topic, never repeat, and every answer shows the explanation for the correct
 * option. The panel owns loading, generation and the practice modal so a tab only
 * has to say which subject and topic it is looking at.
 */
export function StudyQuestionsPanel({
  target,
  tone = 'amber',
  emptyHint,
}: {
  target: StudyQuestionTarget;
  tone?: 'amber' | 'sky';
  emptyHint?: string;
}) {
  const [questions, setQuestions] = useState<StudyQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [showContextForm, setShowContextForm] = useState(false);
  const [context, setContext] = useState('');
  const loadRequestRef = useRef(0);
  const mountedRef = useRef(true);

  const { area, subject_name: subjectName, topic_key: topicKey, topic_title: topicTitle } = target;

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
      const loaded = await api.getStudyQuestions({
        area,
        subject_name: subjectName,
        topic_key: topicKey,
        topic_title: topicTitle,
      });
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
      const created = await api.generateStudyQuestions(
        { area, subject_name: subjectName, topic_key: topicKey, topic_title: topicTitle },
        context,
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

  async function handleAnswer(questionId: number, selectedOption: string) {
    const result = await api.submitStudyQuestionAttempt(questionId, { selected_option: selectedOption });
    setQuestions((current) =>
      current.map((item) =>
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
      ),
    );
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

  const countLabel = loading ? '...' : loadError ? 'erro' : String(questions.length);
  const busy = loading || generating;

  return (
    <div className={`rounded-3xl border-2 p-5 ${palette.shell}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className={`flex items-center gap-2 font-black ${palette.title}`}>
            <ClipboardList size={18} />
            Modo questões ({countLabel})
          </h3>
          <p className={`mt-1 text-xs font-bold ${palette.helper}`}>
            {questions.length > 0
              ? 'Cada resposta mostra a explicação da alternativa correta. Questões criadas não se repetem.'
              : emptyHint || 'Gere questões de múltipla escolha para fazer o simulado desta lição.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setPracticeOpen(true)}
            disabled={busy || questions.length === 0}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${palette.primary}`}
          >
            <ClipboardList size={15} />
            Fazer simulado
          </button>
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
              maxLength={1000}
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

      {practiceOpen && questions.length > 0 && (
        <PracticeQuestionsModal
          subjectName={subjectName}
          topicTitle={topicTitle}
          questions={questions}
          onAnswer={handleAnswer}
          onClose={() => setPracticeOpen(false)}
        />
      )}
    </div>
  );
}
