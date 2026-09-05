'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';

import { StudyQuestionsPanel } from '@/components/questions/StudyQuestionsPanel';
import { api, type LessonSummary } from '@/lib/api';

const SUBJECT_NAME = 'Inglês';

/**
 * "Modo questões" for English: pick one of the child's lessons and practise a
 * simulado built from it. Lessons are the only stable English topic, so the
 * lesson id is what the saved questions are keyed by.
 */
export function EnglishQuestionsSection() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await api.getAllLessons();
        if (!active) return;
        setLessons(loaded);
        setSelectedId((current) => current ?? loaded[0]?.id ?? null);
      } catch {
        if (active) setError('Não foi possível carregar as lições de inglês.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
    <section id="english-questions" className="kid-surface scroll-mt-24 border-sky-100 p-5 md:p-7">
      <div className="flex items-center gap-2">
        <ClipboardList size={18} className="text-sky-600" />
        <h2 className="text-xl font-black text-slate-800">Modo questões</h2>
      </div>
      <p className="mt-1 text-sm font-bold text-slate-500">
        Escolha uma lição e faça um simulado de múltipla escolha sobre ela.
      </p>

      {loading ? (
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500">
          <Loader2 className="animate-spin" size={16} /> Carregando lições
        </p>
      ) : error ? (
        <p role="alert" className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </p>
      ) : lessons.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
          Nenhuma lição de inglês ainda. Gere uma lição para poder montar o simulado.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-black text-slate-700">Lição</span>
            <select
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(Number(event.target.value) || null)}
              className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none transition focus:border-primary"
            >
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <StudyQuestionsPanel
              key={selected.id}
              tone="sky"
              target={{
                area: 'english',
                subject_name: SUBJECT_NAME,
                topic_key: String(selected.id),
                topic_title: selected.title,
              }}
              emptyHint="Gere questões de múltipla escolha a partir desta lição para fazer o simulado."
            />
          )}
        </div>
      )}
    </section>

    <section id="english-grammar" className="kid-surface scroll-mt-24 border-violet-100 p-5 md:p-7">
      <div className="flex items-center gap-2">
        <ClipboardList size={18} className="text-violet-600" />
        <h2 className="text-xl font-black text-slate-800">Modo gramática</h2>
      </div>
      <p className="mt-1 text-sm font-bold text-slate-500">
        Escolha uma lição e treine as estruturas das 3 frases do dia.
      </p>

      {loading ? (
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500">
          <Loader2 className="animate-spin" size={16} /> Carregando lições
        </p>
      ) : error ? (
        <p role="alert" className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </p>
      ) : lessons.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
          Nenhuma lição de inglês ainda. Gere uma lição para poder praticar gramática.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-black text-slate-700">Lição</span>
            <select
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(Number(event.target.value) || null)}
              className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none transition focus:border-primary"
            >
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <StudyQuestionsPanel
              key={`grammar-${selected.id}`}
              tone="sky"
              target={{
                area: 'english',
                subject_name: 'Inglês - Gramática',
                topic_key: `grammar:${selected.id}`,
                topic_title: `Gramática: ${selected.title}`,
              }}
              emptyHint="Gere questões focadas em gramática a partir desta lição."
              generationContext="Crie questões focadas em gramática, estrutura das frases, ordem das palavras, tempos verbais e padrões de uso presentes nesta lição."
            />
          )}
        </div>
      )}
    </section>
    </div>
  );
}
