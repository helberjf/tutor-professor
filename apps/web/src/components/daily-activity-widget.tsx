'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Code2, Clock, Loader2, HelpCircle, RefreshCw } from 'lucide-react';
import { api, type DailyActivitySummarySchema } from '@/lib/api';

const ACTIVITY_ICONS = {
  lesson: <BookOpen className="text-blue-500" size={16} />,
  study: <BookOpen className="text-emerald-500" size={16} />,
  review: <CheckCircle2 className="text-green-500" size={16} />,
  quiz: <HelpCircle className="text-purple-500" size={16} />,
  coding: <Code2 className="text-orange-500" size={16} />,
  diverse: <BookOpen className="text-indigo-500" size={16} />,
  leetcode: <span aria-hidden="true">🏆</span>,
  flashcard: <span aria-hidden="true">🃏</span>,
  coding_review: <Code2 className="text-cyan-500" size={16} />,
  question: <HelpCircle className="text-amber-500" size={16} />,
  exam: <CheckCircle2 className="text-indigo-500" size={16} />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  lesson: 'bg-blue-50',
  study: 'bg-emerald-50',
  review: 'bg-green-50',
  quiz: 'bg-purple-50',
  coding: 'bg-orange-50',
  diverse: 'bg-indigo-50',
  leetcode: 'bg-amber-50',
  flashcard: 'bg-violet-50',
  coding_review: 'bg-cyan-50',
  question: 'bg-amber-50',
  exam: 'bg-indigo-50',
};

function getActivityLabel(type: string) {
  const labels: Record<string, string> = {
    lesson: 'Lição',
    study: 'Estudo',
    review: 'Revisão',
    quiz: 'Quiz',
    coding: 'Programação',
    diverse: 'Outras matérias',
    leetcode: 'LeetCode',
    flashcard: 'Flashcards',
    coding_review: 'Revisão de programação',
    question: 'Questões',
    exam: 'Simulados',
  };

  return labels[type] || type.replace(/_/g, ' ');
}

export function DailyActivityWidget() {
  const [activities, setActivities] = useState<DailyActivitySummarySchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchActivities = async () => {
      try {
        const data = await api.getTodayActivities();
        if (!cancelled) {
          setActivities(data);
          setUpdatedAt(new Date());
        }
      } catch (err) {
        console.error('Failed to load daily activities:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchActivities();
    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchActivities();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={20} />
        </div>
      </div>
    );
  }

  if (!activities || activities.total_activities === 0) {
    return (
      <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
        <p className="text-center text-sm font-medium text-slate-600">
          Nenhuma atividade hoje. Comece a estudar! 📚
        </p>
      </div>
    );
  }

  // A timeline mostra todos os eventos do dia; o container mantém a altura
  // previsível mesmo quando há muitas revisões.
  const recentActivities = activities.activities.slice().reverse();
  const durationMinutes = Math.floor((activities.total_duration_seconds ?? 0) / 60);
  const durationLabel = durationMinutes > 0 ? `${durationMinutes}m` : '—';
  const scoreLabel = activities.average_score === null || activities.average_score === undefined
    ? '—'
    : `${Math.round(activities.average_score)}%`;

  return (
    <div className="rounded-xl border-2 border-primary bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Atividades de Hoje</h3>
        <Link
          href="/activity-log"
          className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-primary hover:underline"
        >
          Ver tudo <ArrowRight size={14} />
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-3 flex gap-2">
        {Object.entries(activities.activities_by_type).map(([type, count]) => (
          <div key={type} className={`rounded-lg px-2 py-1 text-xs font-medium ${ACTIVITY_COLORS[type] || 'bg-gray-50'}`}>
            {count} {getActivityLabel(type)}
          </div>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <p className="text-base font-black text-slate-800">{activities.total_activities}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Eventos</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <p className="flex items-center justify-center gap-1 text-base font-black text-slate-800"><Clock size={13} /> {durationLabel}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tempo registrado</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <p className="text-base font-black text-slate-800">{scoreLabel}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Média c/ nota</p>
        </div>
      </div>

      {/* Activities List */}
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {recentActivities.map((activity) => (
          <div key={activity.id} className={`flex items-center gap-2 rounded-lg p-2 ${ACTIVITY_COLORS[activity.activity_type] || 'bg-gray-50'}`}>
            <div className="flex-shrink-0">
              {ACTIVITY_ICONS[activity.activity_type as keyof typeof ACTIVITY_ICONS] || '•'}
            </div>
            <div className="flex-grow">
              <p className="truncate text-xs font-medium text-slate-800">{activity.activity_title}</p>
            </div>
            {activity.result_score !== null && (
              <div className="flex-shrink-0 text-right">
                <p className="text-xs font-bold text-slate-700">{activity.result_score.toFixed(0)}%</p>
              </div>
            )}
            <time className="flex-shrink-0 text-[10px] font-semibold text-slate-400" dateTime={activity.created_at}>
              {formatActivityTime(activity.created_at)}
            </time>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 border-t border-slate-200 pt-2">
        <p className="text-center text-xs text-slate-600">
          <strong>{activities.total_activities}</strong> atividades registradas hoje
        </p>
        {updatedAt && (
          <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-slate-400">
            <RefreshCw size={10} /> Atualizado às {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

function formatActivityTime(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  return new Date(normalized).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
