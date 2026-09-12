'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, PartyPopper, Sparkles, XCircle } from 'lucide-react';

import { useRequireAuth } from '@/hooks/use-require-auth';
import { ApiError, api, type PlacementQuestion } from '@/lib/api';

/**
 * The guided first run: who is studying, which language, and where to start.
 *
 * A new account used to land on a dashboard of eight cards with nothing in it,
 * at level 1 regardless of what the person already knew. Three steps fix both:
 * the profile exists before the first lesson, and five questions place the
 * student on a level that matches them.
 *
 * The placement test is derived from a fixed bank in the API, so it works on the
 * very first minute of an account — before any content, any AI key, any credit.
 */

const LANGUAGES = [
  { value: 'English', flag: '🇺🇸', label: 'Inglês' },
  { value: 'Spanish', flag: '🇪🇸', label: 'Espanhol' },
  { value: 'French', flag: '🇫🇷', label: 'Francês' },
  { value: 'German', flag: '🇩🇪', label: 'Alemão' },
  { value: 'Italian', flag: '🇮🇹', label: 'Italiano' },
  { value: 'Russian', flag: '🇷🇺', label: 'Russo' },
];

// The band the generated content is written for. It is not a gate: it tunes
// vocabulary and tone, and the AI prompts keep the extra safety rules for the
// bands that are minors.
const AGE_GROUPS = [
  { value: '4-6', label: '4 a 6 anos' },
  { value: '7-9', label: '7 a 9 anos' },
  { value: '10-12', label: '10 a 12 anos' },
  { value: '13-17', label: '13 a 17 anos' },
  { value: '18+', label: '18 anos ou mais' },
];

type Step = 'profile' | 'language' | 'placement' | 'done';

export default function OnboardingPage() {
  const authState = useRequireAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('profile');
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('18+');
  const [language, setLanguage] = useState('English');

  const [questions, setQuestions] = useState<PlacementQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [correctLevels, setCorrectLevels] = useState<number[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [placedLevel, setPlacedLevel] = useState(1);
  const [levelPinned, setLevelPinned] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Somebody who already finished this has nothing to do here.
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let cancelled = false;
    api
      .getOnboardingState()
      .then((state) => {
        if (cancelled || !mountedRef.current) return;
        if (state.completed) {
          router.replace('/');
          return;
        }
        if (state.child_name) setName(state.child_name);
        if (state.target_language) setLanguage(state.target_language);
      })
      .catch(() => {
        /* The form still works; only the pre-filling is lost. */
      });
    return () => {
      cancelled = true;
    };
  }, [authState.status, router]);

  const loadPlacement = useCallback(async (targetLanguage: string) => {
    try {
      const loaded = await api.getPlacementQuestions(targetLanguage);
      if (mountedRef.current) setQuestions(loaded);
      return loaded;
    } catch {
      if (mountedRef.current) setQuestions([]);
      return [];
    }
  }, []);

  async function finish(levels: number[], skipped: boolean) {
    setSaving(true);
    setError('');
    try {
      const result = await api.completeOnboarding({
        child_name: name.trim() || 'Estudante',
        age_group: ageGroup,
        target_language: language,
        correct_levels: levels,
        skipped_placement: skipped,
      });
      if (!mountedRef.current) return;
      setPlacedLevel(result.level);
      setLevelPinned(result.level_pinned);
      setStep('done');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof ApiError
          ? (err.detail ?? err.message)
          : 'Não foi possível salvar. Tente novamente.',
      );
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  function answerPlacement(option: string) {
    const question = questions[questionIndex];
    if (!question || chosen) return;
    setChosen(option);
    const levels =
      option === question.correct_option ? [...correctLevels, question.level] : correctLevels;
    setCorrectLevels(levels);
    // A beat to see the right answer before the next question lands.
    window.setTimeout(() => {
      if (!mountedRef.current) return;
      setChosen(null);
      if (questionIndex + 1 >= questions.length) {
        void finish(levels, false);
        return;
      }
      setQuestionIndex(questionIndex + 1);
    }, 900);
  }

  if (authState.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="inline-flex items-center gap-2 text-base font-bold text-slate-500">
          <Loader2 className="animate-spin" size={20} /> Preparando tudo
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl">
        <StepDots step={step} />

        {step === 'profile' && (
          <section className="app-surface mt-4 border-sky-100 p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Passo 1 de 3</p>
            <h1 className="mt-2 text-2xl font-black text-slate-800">Quem vai estudar?</h1>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              O nome aparece nas telas de estudo e a faixa de idade ajusta o vocabulário e o tom das lições.
            </p>

            <label className="mt-6 block">
              <span className="text-sm font-black text-slate-700">Nome</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Ex.: Ana"
                className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-200 px-4 text-base font-bold text-slate-700 outline-none transition focus:border-primary"
              />
            </label>

            <div className="mt-5">
              <span className="text-sm font-black text-slate-700">Idade</span>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {AGE_GROUPS.map((group) => (
                  <button
                    key={group.value}
                    type="button"
                    onClick={() => setAgeGroup(group.value)}
                    className={`min-h-12 rounded-2xl border-2 px-3 text-sm font-black transition ${
                      ageGroup === group.value
                        ? 'border-sky-400 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200'
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep('language')}
              disabled={!name.trim()}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-base font-black text-white transition hover:bg-sky-600 disabled:opacity-40"
            >
              Continuar <ArrowRight size={18} />
            </button>
          </section>
        )}

        {step === 'language' && (
          <section className="app-surface mt-4 border-sky-100 p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Passo 2 de 3</p>
            <h1 className="mt-2 text-2xl font-black text-slate-800">Qual idioma vamos estudar?</h1>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Dá para mudar depois na área da conta.
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {LANGUAGES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setLanguage(item.value)}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 text-base font-black transition ${
                    language === item.value
                      ? 'border-sky-400 bg-sky-50 text-sky-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200'
                  }`}
                >
                  <span className="text-xl">{item.flag}</span>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const loaded = await loadPlacement(language);
                  if (loaded.length === 0) {
                    // No placement test for this language: start at the
                    // beginning rather than invent a level out of nothing.
                    void finish([], true);
                    return;
                  }
                  setQuestionIndex(0);
                  setCorrectLevels([]);
                  setChosen(null);
                  setStep('placement');
                }}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-base font-black text-white transition hover:bg-sky-600 disabled:opacity-40"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                Fazer o teste de nível
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void finish([], true)}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-slate-200 px-5 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Pular e começar do início
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {error}
              </p>
            )}
          </section>
        )}

        {step === 'placement' && questions[questionIndex] && (
          <section className="app-surface mt-4 border-violet-100 p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Passo 3 de 3 · pergunta {questionIndex + 1} de {questions.length}
            </p>
            <h1 className="mt-2 text-xl font-black leading-snug text-slate-800 sm:text-2xl">
              {questions[questionIndex].question}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Não tem problema errar: é isso que diz por onde começar.
            </p>

            <div className="mt-5 grid gap-2.5">
              {questions[questionIndex].options.map((option) => {
                const isChosen = chosen === option;
                const isRight = option === questions[questionIndex].correct_option;
                const state = chosen
                  ? isRight
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                    : isChosen
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-400'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50';
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => answerPlacement(option)}
                    disabled={Boolean(chosen)}
                    className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-bold transition ${state}`}
                  >
                    <span>{option}</span>
                    {chosen && isRight && <CheckCircle2 size={18} className="shrink-0" />}
                    {chosen && isChosen && !isRight && <XCircle size={18} className="shrink-0" />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void finish(correctLevels, false)}
              disabled={saving}
              className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 transition hover:text-slate-600 disabled:opacity-40"
            >
              Parar o teste por aqui
            </button>
          </section>
        )}

        {step === 'done' && (
          <section className="app-surface mt-4 border-emerald-200 p-6 text-center sm:p-8">
            <PartyPopper size={40} className="mx-auto text-emerald-500" />
            <h1 className="mt-4 text-2xl font-black text-slate-800">Tudo pronto, {name.trim()}!</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Começando no nível {placedLevel}.
              {levelPinned
                ? ' O nível ficou fixo nesse ponto; na área da conta dá para voltar ao automático quando quiser.'
                : ' O nível sobe sozinho conforme as questões vão sendo respondidas.'}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/session"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 px-6 text-base font-black text-white transition hover:scale-[1.02]"
              >
                Começar a estudar <ArrowRight size={18} />
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-slate-200 px-5 text-sm font-black text-slate-600 transition hover:bg-slate-50"
              >
                Ir para o início
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ['profile', 'language', 'placement', 'done'];
  const current = order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden>
      {order.slice(0, 3).map((item, position) => (
        <span
          key={item}
          className={`h-2 rounded-full transition-all ${
            position <= current ? 'w-8 bg-sky-400' : 'w-4 bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}
