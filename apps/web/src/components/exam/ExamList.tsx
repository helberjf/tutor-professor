'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, Play, Timer, Trophy } from 'lucide-react';

import { api, type ExamAttemptStart, type ExamOverview } from '@/lib/api';

import { ExamRunner } from './ExamRunner';

/** The simulado mode: pick an exam, sit it, see the percentage at the end. */
export function ExamList() {
  const [exams, setExams] = useState<ExamOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [startError, setStartError] = useState('');
  const [startingId, setStartingId] = useState<number | null>(null);
  const [session, setSession] = useState<ExamAttemptStart | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setExams(await api.getExams());
    } catch {
      setLoadError('Não foi possível carregar os simulados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(examId: number) {
    setStartingId(examId);
    setStartError('');
    try {
      setSession(await api.startExamAttempt(examId));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Não foi possível começar o simulado.');
    } finally {
      setStartingId(null);
    }
  }

  if (session) {
    return (
      <ExamRunner
        start={session}
        onClose={() => {
          setSession(null);
          void load();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-indigo-500" size={30} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-700"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
        <p className="font-black text-slate-600">Nenhum simulado ainda.</p>
        <p className="mt-1 text-sm text-slate-400">
          Um simulado é um banco de questões separado do modo questões, feito para você medir como está indo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {startError && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {startError}
        </p>
      )}

      {exams.map(({ exam, pool_size: poolSize, best_score_percent: best, attempts_count: attempts }) => {
        const drawn = Math.min(poolSize, exam.question_count);
        const thin = poolSize < exam.question_count;
        return (
          <article key={exam.id} className="rounded-3xl border-2 border-slate-100 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-lg font-black text-slate-800">
                  <ClipboardList size={18} className="text-indigo-500" />
                  {exam.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Play size={14} /> {drawn} questões
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Timer size={14} /> {exam.duration_minutes} min
                  </span>
                  {best !== null && (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <Trophy size={14} /> melhor: {best}%
                    </span>
                  )}
                  {attempts > 0 && <span>{attempts} tentativa{attempts !== 1 ? 's' : ''}</span>}
                </div>
                {thin && (
                  <p className="mt-2 text-xs font-bold text-amber-700">
                    O acervo tem {poolSize} questões, menos que as {exam.question_count} do formato — a prova sai com {drawn}.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void start(exam.id)}
                disabled={startingId !== null || poolSize === 0}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 font-black text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {startingId === exam.id ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                Fazer simulado
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
