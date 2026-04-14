'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Volume2 } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type Lesson, type LessonItem, type PhraseBreakdown } from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';

export default function LessonPage() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);

  async function loadLesson() {
    setLoading(true);
    try {
      const data = await api.getTodayLesson();
      setLesson(data);
      setCurrentIndex(0);
      setCompleted(false);
      setSelectedAnswer(null);
      setSaveError(null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar a licao.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLesson();
  }, []);

  useEffect(() => {
    if (!lesson?.items.length) {
      return;
    }

    const currentItem = lesson.items[currentIndex];
    setOptions(buildActivityOptions(lesson.items, currentItem));
    setSelectedAnswer(null);
    setAnswerCorrect(false);
    setSaveError(null);
  }, [lesson, currentIndex]);

  async function playAudio(text: string) {
    setAudioLoading(true);
    try {
      const data = await api.speak(text);
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || text,
      );
    } catch (err) {
      console.error('Audio error:', err);
    } finally {
      setAudioLoading(false);
    }
  }

  async function handleAnswer(option: string) {
    if (!lesson || selectedAnswer || submittingAnswer) {
      return;
    }

    const currentItem = lesson.items[currentIndex];
    const isCorrect = option === currentItem.word_pt;
    setSelectedAnswer(option);
    setAnswerCorrect(isCorrect);
    setSubmittingAnswer(true);

    try {
      await api.submitReviewAttempt({
        word_en: currentItem.word_en,
        word_pt: currentItem.word_pt,
        correct: isCorrect,
      });
    } catch (err) {
      const nextError = err instanceof ApiError ? err : new ApiError('Nao foi possivel salvar a sua pratica.');
      setSaveError(nextError.message);
    } finally {
      setSubmittingAnswer(false);
    }
  }

  async function handleNext() {
    if (!lesson) {
      return;
    }

    if (currentIndex < lesson.items.length - 1) {
      setCurrentIndex((value) => value + 1);
      return;
    }

    setSavingLesson(true);
    try {
      await api.completeLesson(lesson.id);
      setCompleted(true);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel salvar a licao.'));
    } finally {
      setSavingLesson(false);
    }
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Abrindo a licao de hoje"
        message="Estamos preparando as frases, os sons e a miniatividade para voce."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title="Conecte o tutor primeiro"
        message="Este aparelho ainda nao tem a URL atual do backend. Abra a pagina de conexao e salve a URL HTTPS do tunnel do seu computador."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Abrir configuracao de conexao
          </Link>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="A licao nao conseguiu se conectar"
        message="O backend parece offline. Inicie a API e o Cloudflare Tunnel no seu computador e depois toque em tentar de novo."
        primaryAction={
          <button onClick={() => void loadLesson()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Tentar de novo
          </button>
        }
        secondaryHref="/connect"
        secondaryLabel="Trocar conexao"
      />
    );
  }

  if (error) {
    return (
      <StatusCard
        tone="error"
        title="A licao encontrou um problema"
        message={error.message}
        primaryAction={
          <button onClick={() => void loadLesson()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Recarregar licao
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (!lesson || lesson.items.length === 0) {
    return (
      <StatusCard
        tone="empty"
        title="Ainda nao ha licao"
        message="Nao encontramos a licao de hoje. Adicione o conteudo da licao ou popule o banco e volte depois."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (completed) {
    return (
      <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
        <div className="mx-auto flex max-w-3xl items-center justify-center">
          <div className="kid-surface w-full border-accent/60 p-10 text-center">
            <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-accent-light">
              <CheckCircle2 className="text-accent-dark" size={72} />
            </div>
            <p className="kid-tag mb-4">Licao concluida</p>
            <h1 className="text-5xl font-black text-slate-800">Voce terminou {lesson.theme}!</h1>
            <p className="mx-auto mt-5 max-w-xl text-xl leading-9 text-slate-600">
              Muito bem. Suas frases de revisao foram salvas e o quiz esta pronto quando voce quiser.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href={`/quiz?lessonId=${lesson.id}`} className="kid-button bg-primary hover:bg-primary-dark">
                Fazer o quiz
              </Link>
              <Link
                href="/"
                className="rounded-full border-2 border-slate-200 px-6 py-4 text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
              >
                Voltar ao inicio
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const currentItem = lesson.items[currentIndex];
  const progressWidth = ((currentIndex + 1) / lesson.items.length) * 100;

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={22} /> Sair
          </Link>
          <p className="kid-tag">
            Frase {currentIndex + 1} de {lesson.items.length}
          </p>
        </div>

        <div className="kid-surface overflow-hidden border-primary/40">
          <div className="h-4 w-full bg-slate-100">
            <div className="h-full rounded-r-full bg-primary transition-all duration-300" style={{ width: `${progressWidth}%` }} />
          </div>

          <div className="grid gap-8 p-8 md:p-10 lg:grid-cols-[1.1fr,0.9fr]">
            <section>
              <p className="kid-tag">{lesson.title}</p>
              <h1 className="mt-5 text-4xl font-black leading-tight text-slate-800 md:text-5xl">{currentItem.word_en}</h1>
              <p className="mt-4 text-xl leading-9 text-slate-600">
                {lesson.content.daily_goal || lesson.objective}
              </p>

              <button
                onClick={() => void playAudio(currentItem.word_en)}
                disabled={audioLoading}
                className="mt-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-[0_18px_40px_rgba(14,165,233,0.25)] transition hover:scale-105 hover:bg-primary-dark"
                aria-label={`Play ${currentItem.word_en}`}
              >
                <Volume2 size={34} />
              </button>

              <div className="mt-8 rounded-[1.75rem] bg-sky-50 p-6">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-700">Miniatividade</p>
                <p className="mt-3 text-2xl font-black text-slate-800">Toque no significado em portugues.</p>
                <p className="mt-2 text-lg leading-8 text-slate-600">Ouça a frase primeiro e depois escolha a traducao que voce acha certa.</p>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white p-6 shadow-inner ring-1 ring-slate-100">
              <div className="grid gap-4">
                {options.map((option) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrectOption = option === currentItem.word_pt;
                  const stateClass = !selectedAnswer
                    ? 'border-slate-200 hover:border-primary hover:bg-primary-light'
                    : isCorrectOption
                      ? 'border-accent bg-accent-light text-accent-dark'
                      : isSelected
                        ? 'border-kid-pink bg-rose-50 text-rose-700'
                        : 'border-slate-200 opacity-70';

                  return (
                    <button
                      key={option}
                      onClick={() => void handleAnswer(option)}
                      disabled={Boolean(selectedAnswer)}
                      className={`rounded-[1.5rem] border-2 px-5 py-4 text-left text-2xl font-bold transition ${stateClass}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {selectedAnswer ? (
                <div className="mt-6 rounded-[1.5rem] bg-slate-50 p-5">
                  <p className={`text-2xl font-black ${answerCorrect ? 'text-accent-dark' : 'text-rose-600'}`}>
                    {answerCorrect ? 'Sim! Muito bem!' : 'Quase! Vamos tentar lembrar.'}
                  </p>
                  <p className="mt-2 text-xl text-slate-700">
                    <span className="font-black">{currentItem.word_en}</span> significa{' '}
                    <span className="font-black">{currentItem.word_pt}</span>.
                  </p>
                  <p className="mt-4 text-lg leading-8 text-slate-600">{currentItem.example_sentence_en}</p>
                  <p className="text-base leading-7 text-slate-500">{currentItem.example_sentence_pt}</p>
                  {renderPhraseBreakdown(lesson, currentItem, currentIndex)}
                  {saveError ? <p className="mt-4 text-sm font-bold text-kid-pink">{saveError}</p> : null}
                  <button
                    onClick={() => void handleNext()}
                    disabled={savingLesson || submittingAnswer}
                    className="kid-button mt-6 bg-primary hover:bg-primary-dark"
                  >
                    {currentIndex < lesson.items.length - 1 ? 'Proxima frase' : savingLesson ? 'Salvando...' : 'Finalizar licao'}
                    <ChevronRight className="ml-2" size={20} />
                  </button>
                </div>
              ) : (
                <p className="mt-6 text-base font-bold uppercase tracking-[0.15em] text-slate-400">
                  Escolha uma resposta para mostrar as notas da frase e o guia palavra por palavra.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function buildActivityOptions(items: LessonItem[], currentItem: LessonItem) {
  const distractors = items
    .filter((item) => item.word_pt !== currentItem.word_pt)
    .map((item) => item.word_pt)
    .slice(0, 3);

  const pool = [currentItem.word_pt, ...distractors];
  return pool
    .map((value, index) => ({
      value,
      order: ((currentItem.word_en.length + 3) * (index + 1)) % 7,
    }))
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.value);
}

function getPhraseBreakdown(lesson: Lesson, currentItem: LessonItem, currentIndex: number): PhraseBreakdown | null {
  const phraseBreakdowns = Array.isArray(lesson.content.phrase_breakdowns) ? lesson.content.phrase_breakdowns : [];
  const matchedBreakdown = phraseBreakdowns.find((breakdown) => breakdown.phrase_en === currentItem.word_en);
  if (matchedBreakdown) {
    return matchedBreakdown;
  }

  return phraseBreakdowns[currentIndex] || null;
}

function renderPhraseBreakdown(lesson: Lesson, currentItem: LessonItem, currentIndex: number) {
  const phraseBreakdown = getPhraseBreakdown(lesson, currentItem, currentIndex);
  if (!phraseBreakdown || !Array.isArray(phraseBreakdown.word_by_word) || phraseBreakdown.word_by_word.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 rounded-[1.5rem] bg-amber-50 p-5">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Palavra por palavra</p>
      <p className="mt-3 text-2xl font-black text-slate-800">
        Frase {currentIndex + 1} - {phraseBreakdown.phrase_en}
      </p>
      <div className="mt-4 space-y-3">
        {phraseBreakdown.word_by_word.map((pair) => (
          <div key={`${pair.en}-${pair.pt}`} className="flex items-center justify-between gap-4 rounded-[1rem] bg-white px-4 py-3">
            <span className="text-lg font-black text-slate-800">{pair.en}</span>
            <span className="text-base font-bold text-slate-500">=</span>
            <span className="text-lg font-bold text-slate-700">{pair.pt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
