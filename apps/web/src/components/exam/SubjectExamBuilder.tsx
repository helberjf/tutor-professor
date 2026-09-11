'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';

import { api, type ExamSource, type ExamSourceArea } from '@/lib/api';

const AREA_LABELS: Record<ExamSourceArea, string> = {
  english: 'Inglês',
  diverse: 'Matérias',
  coding: 'Programação',
};

const AREA_ORDER: ExamSourceArea[] = ['english', 'diverse', 'coding'];

const QUESTION_COUNTS = [10, 20, 30, 50];

/** Programming subjects are identified by id; the other areas only have a name. */
export function examSourceKey(source: ExamSource): string {
  return source.area === 'coding' ? `coding:${source.subject_id}` : `${source.area}:${source.subject_name}`;
}

/** Turns any subject that already has questions into a simulado, or refreshes it. */
export function SubjectExamBuilder({ onCreated }: { onCreated: () => void }) {
  const [sources, setSources] = useState<ExamSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [questionCount, setQuestionCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const loadSources = useCallback(async () => {
    setLoadError('');
    try {
      const loaded = await api.getExamSources();
      setSources(loaded);
      setSelectedKey((current) =>
        loaded.some((source) => examSourceKey(source) === current)
          ? current
          : loaded[0]
            ? examSourceKey(loaded[0])
            : '',
      );
    } catch {
      setLoadError('Não foi possível carregar as matérias.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const selected = sources.find((source) => examSourceKey(source) === selectedKey) ?? null;

  async function buildExam() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.createExamFromSubject({
        area: selected.area,
        subject_id: selected.subject_id,
        subject_name: selected.subject_name,
        question_count: questionCount,
      });
      const skipped =
        result.skipped > 0
          ? ` ${result.skipped} questão${result.skipped !== 1 ? 'ões incompletas ficaram' : ' incompleta ficou'} de fora.`
          : '';
      setMessage({
        tone: 'ok',
        text: `${result.exam.name}: ${result.pool_size} questões no acervo (${result.imported} novas).${skipped}`,
      });
      onCreated();
      void loadSources();
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível montar o simulado.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border-2 border-indigo-100 bg-indigo-50/40 p-5">
      <h3 className="flex items-center gap-2 text-lg font-black text-slate-800">
        <ClipboardList size={18} className="text-indigo-500" />
        Simulado de uma matéria
      </h3>
      <p className="mt-1 text-sm font-medium text-slate-500">
        Qualquer matéria que já tem questões vira uma prova cronometrada. Gerou questões novas? Atualize o simulado para
        incluir.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Carregando matérias...
        </div>
      ) : loadError ? (
        <p role="alert" className="mt-4 text-sm font-bold text-rose-700">
          {loadError}
        </p>
      ) : sources.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">
          Nenhuma matéria tem questões ainda. Gere questões em Estudar e volte aqui para montar o simulado.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            Matéria
            <select
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
              className="mt-1 block min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-800"
            >
              {AREA_ORDER.map((area) => {
                const inArea = sources.filter((source) => source.area === area);
                if (inArea.length === 0) return null;
                return (
                  <optgroup key={area} label={AREA_LABELS[area]}>
                    {inArea.map((source) => (
                      <option key={examSourceKey(source)} value={examSourceKey(source)}>
                        {source.subject_name} · {source.question_count} questões
                        {source.exam_id !== null ? ' · já tem simulado' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 sm:w-36">
            Questões por prova
            <select
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
              className="mt-1 block min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-800"
            >
              {QUESTION_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void buildExam()}
            disabled={busy || !selected}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 font-black text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}
            {selected?.exam_id !== null && selected?.exam_id !== undefined ? 'Atualizar simulado' : 'Criar simulado'}
          </button>
        </div>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${
            message.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
