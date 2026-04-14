'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronRight, Star, Trophy, XCircle } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { ApiError, api, type Quiz, type QuizSubmitResponse } from '@/lib/api';

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <StatusCard
          tone="loading"
          title="Preparando o quiz"
          message="O tutor esta separando as perguntas de hoje e as estrelas da pontuacao."
          secondaryHref="/"
          secondaryLabel="Voltar ao inicio"
        />
      }
    >
      <QuizPageContent />
    </Suspense>
  );
}

function QuizPageContent() {
  const searchParams = useSearchParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<QuizSubmitResponse | null>(null);

  async function loadQuiz() {
    setLoading(true);
    try {
      const lessonIdParam = searchParams.get('lessonId');
      const lessonId = lessonIdParam ? Number(lessonIdParam) : undefined;
      const data = await api.getTodayQuiz(Number.isFinite(lessonId) ? lessonId : undefined);
      setQuiz(data);
      setCurrentIndex(0);
      setSelectedOption(null);
      setScore(0);
      setFinished(false);
      setSubmitMessage(null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar o quiz.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuiz();
  }, [searchParams]);

  async function handleNext() {
    if (!quiz || !selectedOption) {
      return;
    }

    const question = quiz.questions[currentIndex];
    const nextScore = selectedOption === question.correct_option ? score + 1 : score;
    setScore(nextScore);

    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((value) => value + 1);
      setSelectedOption(null);
      return;
    }

    setSavingResult(true);
    try {
      const response = await api.submitQuiz({
        lesson_id: quiz.lesson_id,
        score: nextScore,
        total_questions: quiz.questions.length,
      });
      setSubmitMessage(response);
      setFinished(true);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel salvar o resultado do quiz.'));
    } finally {
      setSavingResult(false);
    }
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Preparando o quiz"
        message="O tutor esta separando as perguntas de hoje e as estrelas da pontuacao."
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
        message="Este aparelho precisa da URL atual do backend antes de carregar os quizzes. Abra a pagina de conexao e salve a URL HTTPS do tunnel do seu computador."
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
        title="O quiz nao conseguiu se conectar"
        message="O backend esta offline agora. Inicie a API e o Cloudflare Tunnel no seu computador e tente de novo."
        primaryAction={
          <button onClick={() => void loadQuiz()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
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
        title="O quiz se enrolou"
        message={error.message}
        primaryAction={
          <button onClick={() => void loadQuiz()} className="kid-button bg-kid-pink hover:bg-pink-500">
            Recarregar quiz
          </button>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (!quiz || quiz.questions.length === 0) {
    return (
      <StatusCard
        tone="empty"
        title="Ainda nao ha quiz"
        message="Nao encontramos perguntas de quiz. Adicione o conteudo do quiz e volte depois."
        secondaryHref="/lesson"
        secondaryLabel="Ir para a licao"
      />
    );
  }

  if (finished) {
    const total = quiz.questions.length;
    const percentage = Math.round((score / total) * 100);
    const stars = percentage === 100 ? 3 : percentage >= 60 ? 2 : 1;

    return (
      <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="kid-surface border-secondary/60 p-6 text-center md:p-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-secondary-light md:h-28 md:w-28">
              <Trophy className="text-secondary-dark" size={54} />
            </div>
            <h1 className="mt-5 text-3xl font-black text-slate-800 md:mt-6 md:text-5xl">Quiz completo!</h1>
            <p className="mt-4 text-lg text-slate-600 md:text-2xl">
              Voce fez <span className="font-black text-slate-800">{score}</span> de{' '}
              <span className="font-black text-slate-800">{total}</span>.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Star
                  key={index}
                  className={index < stars ? 'fill-secondary text-secondary-dark' : 'text-slate-300'}
                  size={34}
                />
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-600 md:text-xl md:leading-9">
              {submitMessage?.encouragement || buildFallbackMessage(percentage)}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/review" className="kid-button bg-primary hover:bg-primary-dark">
                Praticar revisao de frases
              </Link>
              <Link
                href="/"
                className="rounded-full border-2 border-slate-200 px-5 py-3.5 text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary md:px-6 md:py-4 md:text-lg"
              >
                Voltar ao inicio
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const question = quiz.questions[currentIndex];
  const isCorrect = selectedOption === question.correct_option;

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-base font-bold text-primary-dark hover:text-primary md:text-lg">
            <ArrowLeft size={22} /> Voltar
          </Link>
          <p className="kid-tag">
            Pergunta {currentIndex + 1} de {quiz.questions.length}
          </p>
        </div>

        <div className="kid-surface border-secondary/50 p-5 md:p-10">
          <p className="kid-tag">Hora do quiz</p>
          <h1 className="mt-4 text-3xl font-black leading-tight text-slate-800 md:mt-5 md:text-5xl">{question.question}</h1>
          <div className="mt-6 grid gap-4 md:mt-8">
            {question.options.map((option) => {
              const isChosen = selectedOption === option;
              const optionClass = !selectedOption
                ? 'border-slate-200 hover:border-secondary hover:bg-secondary-light'
                : option === question.correct_option
                  ? 'border-accent bg-accent-light text-accent-dark'
                  : isChosen
                    ? 'border-kid-pink bg-rose-50 text-rose-700'
                    : 'border-slate-200 opacity-70';

              return (
                <button
                  key={option}
                  onClick={() => setSelectedOption(option)}
                  disabled={Boolean(selectedOption)}
                  className={`rounded-[1.25rem] border-2 px-4 py-3.5 text-left text-lg font-bold transition md:rounded-[1.5rem] md:px-5 md:py-4 md:text-2xl ${optionClass}`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {selectedOption ? (
            <div className="mt-6 rounded-[1.25rem] bg-slate-50 p-4 md:rounded-[1.5rem] md:p-6">
              <div className="flex items-center gap-3">
                {isCorrect ? (
                  <CheckCircle2 className="text-accent-dark" size={32} />
                ) : (
                  <XCircle className="text-rose-600" size={32} />
                )}
                <p className={`text-xl font-black md:text-2xl ${isCorrect ? 'text-accent-dark' : 'text-rose-600'}`}>
                  {isCorrect ? 'Acertou!' : 'Boa tentativa!'}
                </p>
              </div>
              <p className="mt-4 text-base leading-7 text-slate-700 md:text-xl md:leading-9">{question.explanation}</p>
              <button
                onClick={() => void handleNext()}
                disabled={savingResult}
                className="kid-button mt-6 bg-secondary-dark hover:bg-secondary"
              >
                {currentIndex < quiz.questions.length - 1 ? 'Proxima pergunta' : savingResult ? 'Salvando...' : 'Ver minha pontuacao'}
                <ChevronRight className="ml-2" size={20} />
              </button>
            </div>
          ) : (
            <p className="mt-6 text-base font-bold uppercase tracking-[0.15em] text-slate-400">
              Escolha uma resposta para liberar a explicacao.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function buildFallbackMessage(percentage: number) {
  if (percentage === 100) {
    return 'Trabalho incrivel! Todas as respostas foram certeiras.';
  }
  if (percentage >= 60) {
    return 'Muito bem! Voce lembrou bastante coisa. Um pouco de revisao vai te deixar ainda melhor.';
  }
  return 'Bom esforco! Revise as frases mais uma vez e volte para tentar de novo.';
}
