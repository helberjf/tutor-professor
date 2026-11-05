'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, GraduationCap, Loader2 } from 'lucide-react';

import { api, type ExamSource, type ExamSourceArea } from '@/lib/api';
import { useStudyLanguage } from '@/hooks/use-study-language';
import { t } from '@/lib/i18n';
import { studyLanguageName } from '@/lib/study-language';

// The 'english' area holds the lessons of whatever language the child studies;
// its label comes from that language instead of this table.
const AREA_LABELS: Record<Exclude<ExamSourceArea, 'english'>, string> = {
  general: "Matérias",
  diverse: "Matérias (antigas)",
  coding: "Programação",
};

const AREA_ORDER: ExamSourceArea[] = ['english', 'general', 'diverse', 'coding'];

const QUESTION_COUNTS = [10, 20, 30, 50];

/** Curriculum subjects (programming and general) are identified by id; the other areas only have a name. */
export function examSourceKey(source: ExamSource): string {
  return source.subject_id != null ? `${source.area}:${source.subject_id}` : `${source.area}:${source.subject_name}`;
}

/** Turns any subject that already has questions into a simulado, or refreshes it. */
export function SubjectExamBuilder({ onCreated }: { onCreated: () => void }) {
  const studyLanguage = useStudyLanguage();
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
      setLoadError(t("Não foi possível carregar as matérias."));
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
        text: err instanceof Error ? err.message : t("Não foi possível montar o simulado."),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[var(--line-strong)] bg-[var(--surface-strong)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
          <GraduationCap size={24} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-800">{t("Simulado de uma matéria")}</h3>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
            {t("Qualquer matéria que já tem questões vira uma prova cronometrada. Gerou questões novas? Atualize o simulado para incluir.")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
          <Loader2 size={16} className="animate-spin" /> {t("Carregando matérias...")}
        </div>
      ) : loadError ? (
        <p role="alert" className="mt-4 text-sm font-bold text-rose-700">
          {loadError}
        </p>
      ) : sources.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">
          {t("Nenhuma matéria tem questões ainda. Gere questões em Estudar e volte aqui para montar o simulado.")}
        </p>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 border-t border-[var(--line-soft)] pt-5 sm:grid-cols-[minmax(0,1fr)_10rem] xl:grid-cols-[minmax(0,1fr)_10rem_auto] xl:items-end">
          <label className="min-w-0 text-sm font-bold text-slate-700">
            {t("Matéria")}
            <select
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
              className="mt-1 block min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-800"
            >
              {AREA_ORDER.map((area) => {
                const inArea = sources.filter((source) => source.area === area);
                if (inArea.length === 0) return null;
                return (
                  <optgroup key={area} label={area === 'english' ? studyLanguageName(studyLanguage) : t(AREA_LABELS[area])}>
                    {inArea.map((source) => (
                      <option key={examSourceKey(source)} value={examSourceKey(source)}>
                        {source.subject_name} · {source.question_count} {t("questões")}
                        {source.exam_id !== null ? ' · já tem simulado' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <label className="min-w-0 text-sm font-bold text-slate-700">
            {t("Questões por prova")}
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
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50 sm:col-span-2 xl:col-span-1"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}
            {selected?.exam_id !== null && selected?.exam_id !== undefined ? t("Atualizar simulado") : t("Criar simulado")}
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
