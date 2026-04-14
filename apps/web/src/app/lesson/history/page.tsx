'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Clock } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type LessonSummary } from '@/lib/api';

export default function LessonHistoryPage() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await api.getAllLessons();
        setLessons(data);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar as licoes.'));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Carregando licoes"
        message="Buscando todas as suas aventuras de ingles..."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (error) {
    return (
      <StatusCard
        tone="error"
        title="Erro ao carregar licoes"
        message={error.message}
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  const completed = lessons.filter((l) => l.is_completed);
  const pending = lessons.filter((l) => !l.is_completed);

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-4">
          <Link href="/lesson" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Voltar
          </Link>
        </div>

        <div className="mb-8">
          <span className="kid-tag mb-3">Todas as licoes</span>
          <h1 className="text-4xl font-black text-slate-800 md:text-5xl">Suas aventuras em ingles</h1>
          <p className="mt-3 text-lg text-slate-600">
            Escolha uma licao para rever o conteudo, treinar as frases ou refazer o quiz.
          </p>
        </div>

        {lessons.length === 0 && (
          <div className="kid-surface border-slate-200 p-10 text-center">
            <p className="text-xl font-bold text-slate-500">Nenhuma licao encontrada ainda.</p>
            <Link href="/lesson" className="kid-button mt-6 inline-flex bg-primary hover:bg-primary-dark">
              Comecar agora
            </Link>
          </div>
        )}

        {completed.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black text-slate-700">
              <CheckCircle2 className="text-accent-dark" size={22} /> Licoes concluidas
            </h2>
            <ul className="space-y-3">
              {completed.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/lesson?lessonId=${lesson.id}`}
                    className="kid-surface flex items-center justify-between border-accent/40 p-5 transition hover:border-accent hover:shadow-md"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-light">
                        <CheckCircle2 className="text-accent-dark" size={22} />
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-800">{lesson.title}</p>
                        <p className="text-sm text-slate-500">{lesson.theme}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/quiz?lessonId=${lesson.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-full border-2 border-secondary/40 px-4 py-2 text-sm font-bold text-secondary-dark transition hover:border-secondary hover:bg-secondary-light"
                      >
                        Quiz
                      </Link>
                      <ChevronRight className="text-slate-400" size={22} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black text-slate-700">
              <Clock className="text-primary-dark" size={22} /> Proximas licoes
            </h2>
            <ul className="space-y-3">
              {pending.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/lesson?lessonId=${lesson.id}`}
                    className="kid-surface flex items-center justify-between border-primary/30 p-5 transition hover:border-primary hover:shadow-md"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-light">
                        <BookOpen className="text-primary-dark" size={22} />
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-800">{lesson.title}</p>
                        <p className="text-sm text-slate-500">{lesson.theme}</p>
                      </div>
                    </div>
                    <ChevronRight className="text-slate-400" size={22} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
