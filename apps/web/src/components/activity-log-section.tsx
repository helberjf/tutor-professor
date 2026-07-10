'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { DailyActivityWidget } from '@/components/daily-activity-widget';
import { WeeklyActivityChart } from '@/components/weekly-activity-chart';

export function ActivityLogSection() {
  return (
    <section className="space-y-4 rounded-[1.6rem] border-2 border-slate-100 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Hoje</p>
          <h2 className="mt-1 text-2xl font-black text-slate-800">Controle do que foi estudado</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Tudo que foi salvo ou concluído aparece aqui automaticamente.</p>
        </div>
        <Link
          href="/activity-log"
          className="inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-primary hover:text-primary"
        >
          Ver log completo <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <DailyActivityWidget />
        <WeeklyActivityChart />
      </div>

      <div className="flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
        <ClipboardList size={16} />
        O dashboard registra lições, quizzes, revisões, programação, flashcards e outras matérias.
      </div>
    </section>
  );
}
