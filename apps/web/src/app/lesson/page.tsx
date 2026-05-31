'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Brain, CheckCircle2, ChevronRight, History, Loader2, PartyPopper, Sparkles, Volume2 } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type LevelAnalysis, type Lesson, type LessonItem, type PhraseBreakdown } from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';

export default function LessonPage() {
  return (
    <Suspense
      fallback={
        <StatusCard
          tone="loading"
          title="Abrindo a licao de hoje"
          message="Estamos preparando as frases, os sons e a miniatividade para voce."
          secondaryHref="/"
          secondaryLabel="Voltar ao inicio"
        />
      }
    >
      <LessonPageContent />
    </Suspense>
  );
}

function LessonPageContent() {
  const searchParams = useSearchParams();
  const lessonIdParam = searchParams.get('lessonId');

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelAnalysis | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<0.5 | 0.75 | 1.0>(1.0);

  async function loadLesson() {
    setLoading(true);
    setGenerating(false);
    try {
      const id = lessonIdParam ? parseInt(lessonIdParam, 10) : null;
      if (!id || isNaN(id)) {
        // No lesson yet — the backend will auto-generate; show generating state
        setGenerating(true);
      }
      const data = id && !isNaN(id) ? await api.getLessonById(id) : await api.getTodayLesson();
      setLesson(data);
      setCurrentIndex(0);
      setCompleted(false);
      setSelectedAnswer(null);
      setSaveError(null);
      setError(null);

      // Load level in background (non-blocking)
      void api.getChildLevel().then(setLevelInfo).catch(() => null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar a licao.'));
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }

  useEffect(() => {
    void loadLesson();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonIdParam]);

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

  async function playAudio(text: string, speed = audioSpeed) {
    setAudioLoading(true);
    try {
      const data = await api.speak(text);
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || text,
        speed,
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

  if (loading || generating) {
    return (
      <StatusCard
        tone="loading"
        title={generating ? 'Gerando sua licao com IA...' : 'Abrindo a licao de hoje'}
        message={
          generating
            ? 'O Gemini esta criando frases no nivel certo para voce. Pode demorar alguns segundos.'
            : 'Estamos preparando as frases, os sons e a miniatividade para voce.'
        }
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

  if (error?.status === 503 || error?.status === 502) {
    return (
      <StatusCard
        tone="error"
        title="Chave Gemini nao configurada"
        message="O backend nao encontrou licoes e o GEMINI_API_KEY nao esta configurado. Adicione a chave no arquivo .env do backend e reinicie a API para gerar licoes automaticamente."
        primaryAction={
          <button onClick={() => void loadLesson()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Tentar de novo
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
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
      <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">

          {/* Celebration card */}
          <div className="kid-surface w-full border-accent/60 p-7 text-center md:p-12">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-accent-light md:h-28 md:w-28">
              <PartyPopper className="text-accent-dark" size={52} />
            </div>
            <p className="kid-tag mb-3">Licao concluida! 🎉</p>
            <h1 className="text-3xl font-black text-slate-800 md:text-4xl">Voce terminou</h1>
            <p className="mt-1 text-2xl font-black text-primary md:text-3xl">{lesson.theme}!</p>
            <p className="mx-auto mt-4 max-w-sm text-base leading-7 text-slate-500">
              {lesson.items.length} frase{lesson.items.length !== 1 ? 's' : ''} aprendida{lesson.items.length !== 1 ? 's' : ''}!
            </p>

            {/* Primary CTA — Quiz */}
            <div className="relative mt-8 inline-flex">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />
              <Link
                href={`/quiz?lessonId=${lesson.id}`}
                className="relative inline-flex items-center gap-3 rounded-full bg-primary px-10 py-5 text-xl font-black text-white shadow-[0_12px_30px_rgba(14,165,233,0.45)] transition hover:scale-105 hover:bg-primary-dark md:text-2xl"
              >
                <ChevronRight size={24} />
                Faca o Quiz abaixo
              </Link>
            </div>

            {/* Secondary CTA — Next lesson */}
            <div className="mt-4">
              <Link
                href="/lesson"
                className="inline-flex items-center gap-2 rounded-full border-2 border-primary/30 bg-white px-8 py-3 text-base font-black text-primary transition hover:border-primary hover:bg-primary/5"
              >
                <Sparkles size={18} />
                Proxima licao
              </Link>
            </div>
          </div>

          {/* Secondary actions */}
          <div className="grid w-full grid-cols-2 gap-3">
            <Link
              href="/review"
              className="kid-surface flex flex-col items-center gap-2 border-emerald-200 p-5 text-center transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Brain size={28} className="text-emerald-600" />
              <p className="text-sm font-black text-slate-800">Praticar revisao</p>
              <p className="text-xs text-slate-500">Fixe o que aprendeu</p>
            </Link>
            <Link
              href="/"
              className="kid-surface flex flex-col items-center gap-2 border-slate-200 p-5 text-center transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <CheckCircle2 size={28} className="text-slate-400" />
              <p className="text-sm font-black text-slate-800">Voltar ao inicio</p>
              <p className="text-xs text-slate-500">Ver todas as atividades</p>
            </Link>
          </div>

        </div>
      </main>
    );
  }

  const currentItem = lesson.items[currentIndex];
  const progressWidth = ((currentIndex + 1) / lesson.items.length) * 100;
  const isLastPhrase = currentIndex >= lesson.items.length - 1;

  return (
    <>
      <main className="min-h-screen pb-32 px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-2xl">

          {/* Nav row */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary md:text-base">
              <ArrowLeft size={20} /> Sair
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/lesson/history" className="inline-flex items-center gap-1.5 rounded-full border-2 border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-primary hover:text-primary">
                <History size={14} /> Anteriores
              </Link>
              <p className="kid-tag text-xs md:text-sm">
                {currentIndex + 1} / {lesson.items.length}
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="kid-surface overflow-hidden border-primary/40">

            {/* Progress bar */}
            <div className="h-3 w-full bg-slate-100">
              <div className="h-full rounded-r-full bg-primary transition-all duration-500" style={{ width: `${progressWidth}%` }} />
            </div>

            <div className="p-5 md:p-8">

              {/* Phrase */}
              <div className="flex flex-wrap items-center gap-2">
                <p className="kid-tag text-xs">{lesson.title}</p>
                {levelInfo && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    <Sparkles size={12} />
                    Nivel {levelInfo.level} — {levelInfo.label}
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">{currentItem.word_en}</h1>
              <p className="mt-2 text-base leading-7 text-slate-500 md:text-lg md:leading-8">
                {lesson.content.daily_goal || lesson.objective}
              </p>

              {/* Play + Speed */}
              <div className="mt-5 flex items-center gap-4">
                <button
                  onClick={() => void playAudio(currentItem.word_en)}
                  disabled={audioLoading}
                  className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_12px_28px_rgba(14,165,233,0.30)] transition active:scale-95 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70 md:h-16 md:w-16"
                  aria-label={`Ouvir: ${currentItem.word_en}`}
                >
                  {audioLoading ? <Loader2 size={24} className="animate-spin" /> : <Volume2 size={24} />}
                </button>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Velocidade</span>
                  <div className="flex gap-2">
                    {([0.5, 0.75, 1.0] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setAudioSpeed(speed)}
                        className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                          audioSpeed === speed
                            ? 'bg-primary text-white'
                            : 'border border-slate-200 text-slate-500 hover:border-primary hover:text-primary'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="my-5 h-px bg-slate-100" />

              {/* Answer options */}
              <div className="grid gap-3">
                {options.map((option) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrectOption = option === currentItem.word_pt;
                  const stateClass = !selectedAnswer
                    ? 'border-slate-200 hover:border-primary hover:bg-primary-light active:scale-[.98]'
                    : isCorrectOption
                      ? 'border-accent bg-accent-light text-accent-dark'
                      : isSelected
                        ? 'border-kid-pink bg-rose-50 text-rose-700'
                        : 'border-slate-200 opacity-60';

                  return (
                    <button
                      key={option}
                      onClick={() => void handleAnswer(option)}
                      disabled={Boolean(selectedAnswer)}
                      className={`rounded-2xl border-2 px-5 py-4 text-left text-lg font-bold transition md:text-xl ${stateClass}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {/* After-answer feedback */}
              {selectedAnswer ? (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 md:p-5">
                  <p className={`text-xl font-black md:text-2xl ${answerCorrect ? 'text-accent-dark' : 'text-rose-600'}`}>
                    {answerCorrect ? 'Sim! Muito bem! 🎉' : 'Quase! Vamos lembrar. 💪'}
                  </p>
                  <p className="mt-2 text-base text-slate-700 md:text-lg">
                    <span className="font-black">{currentItem.word_en}</span> significa{' '}
                    <span className="font-black">{currentItem.word_pt}</span>.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base md:leading-7">{currentItem.example_sentence_en}</p>
                  <p className="text-xs leading-5 text-slate-500 md:text-sm md:leading-6">{currentItem.example_sentence_pt}</p>
                  {renderPhraseBreakdown(lesson, currentItem, currentIndex)}
                  {saveError ? <p className="mt-3 text-sm font-bold text-kid-pink">{saveError}</p> : null}
                </div>
              ) : (
                /* Miniatividade hint — fica no final do card antes de responder */
                <div className="mt-5 rounded-2xl bg-sky-50 p-4 md:p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Miniatividade</p>
                  <p className="mt-2 text-base font-black text-slate-800 md:text-lg">Toque no significado em portugues.</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Ouca a frase primeiro e depois escolha a traducao certa.</p>
                </div>
              )}

            </div>
          </div>

        </div>
      </main>

      {/* Sticky bottom bar — aparece depois de responder */}
      {selectedAnswer && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm md:px-8 md:py-4">
          <div className="mx-auto max-w-2xl">
            <button
              onClick={() => void handleNext()}
              disabled={savingLesson || submittingAnswer}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-lg font-black text-white shadow-[0_8px_24px_rgba(14,165,233,0.35)] transition active:scale-[.98] hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70 md:py-5 md:text-xl"
            >
              {isLastPhrase
                ? savingLesson
                  ? 'Salvando...'
                  : 'Finalizar licao'
                : 'Proxima frase'}
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function buildActivityOptions(items: LessonItem[], currentItem: LessonItem) {
  const distractors = items
    .filter((item) => item.word_pt !== currentItem.word_pt)
    .map((item) => item.word_pt)
    .slice(0, 3);

  const pool = [currentItem.word_pt, ...distractors];

  // Fisher-Yates shuffle para posição aleatória real
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool;
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
    <div className="mt-6 rounded-[1.25rem] bg-amber-50 p-4 md:rounded-[1.5rem] md:p-5">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Palavra por palavra</p>
      <p className="mt-3 text-xl font-black text-slate-800 md:text-2xl">
        Frase {currentIndex + 1} - {phraseBreakdown.phrase_en}
      </p>
      <div className="mt-4 space-y-3">
        {phraseBreakdown.word_by_word.map((pair) => (
          <div key={`${pair.en}-${pair.pt}`} className="flex flex-col gap-2 rounded-[1rem] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-base font-black text-slate-800 md:text-lg">{pair.en}</span>
            <span className="text-base font-bold text-slate-500">=</span>
            <span className="text-base font-bold text-slate-700 md:text-lg">{pair.pt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
