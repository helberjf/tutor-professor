'use client';

import Link from 'next/link';
import { ArrowLeft, SpellCheck2 } from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useStudyLanguage } from '@/hooks/use-study-language';
import { t, tf } from '@/lib/i18n';
import { studyLanguageInSentence } from '@/lib/study-language';
import { EnglishQuestionsSection } from '../study/_components/EnglishQuestionsSection';

export default function GrammarPage() {
  const auth = useRequireAuth();
  const studyLanguage = useStudyLanguage();

  if (auth.status !== 'authenticated') {
    return <StatusCard title={t("Verificando login")} message={t("Carregando")} tone="loading" />;
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary">
          <ArrowLeft size={18} /> {t("Voltar")}
        </Link>
        <header className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <SpellCheck2 size={28} aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl font-black text-slate-800">{t("Gramática")}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {tf("Treine estruturas das frases de {language}.", { language: studyLanguageInSentence(studyLanguage) })}
            </p>
          </div>
        </header>
        <EnglishQuestionsSection studyLanguage={studyLanguage} mode="grammar" />
      </div>
    </main>
  );
}
