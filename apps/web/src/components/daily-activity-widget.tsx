'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Code2, Loader2, HelpCircle } from 'lucide-react';
import { api, type DailyActivitySummarySchema } from '@/lib/api';

const ACTIVITY_ICONS = {
  lesson: <BookOpen className="text-blue-500" size={16} />,
  review: <CheckCircle2 className="text-green-500" size={16} />,
  quiz: <HelpCircle className="text-purple-500" size={16} />,
  coding: <Code2 className="text-orange-500" size={16} />,
  diverse: <BookOpen className="text-indigo-500" size={16} />,
  leetcode: <span aria-hidden="true">🏆</span>,
  flashcard: <span aria-hidden="true">🃏</span>,
  coding_review: <Code2 className="text-cyan-500" size={16} />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  lesson: 'bg-blue-50',
  review: 'bg-green-50',
  quiz: 'bg-purple-50',
  coding: 'bg-orange-50',
  diverse: 'bg-indigo-50',
  leetcode: 'bg-amber-50',
  flashcard: 'bg-violet-50',
  coding_review: 'bg-cyan-50',
};

function getActivityLabel(type: string) {
  const labels: Record<string, string> = {
    lesson: 'Lição',
    review: 'Revisão',
    quiz: 'Quiz',
    coding: 'Programação',
    diverse: 'Outras matérias',
    leetcode: 'LeetCode',
    flashcard: 'Flashcards',
    coding_review: 'Revisão de programação',
  };

  return labels[type] || type.replace(/_/g, ' ');
}

export function DailyActivityWidget() {
  const [activities, setActivities] = useState<DailyActivitySummarySchema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const data = await api.getTodayActivities();
        setActivities(data);
      } catch (err) {
        console.error('Failed to load daily activities:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
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

  // Pega últimas 3 atividades
  const recentActivities = activities.activities.slice(-3).reverse();

  return (
    <div className="rounded-xl border-2 border-primary bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Atividades de Hoje</h3>
        <Link
          href="/activity-log"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
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

      {/* Activities List */}
      <div className="space-y-2">
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
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 border-t border-slate-200 pt-2">
        <p className="text-center text-xs text-slate-600">
          <strong>{activities.total_activities}</strong> atividades registradas hoje
        </p>
      </div>
    </div>
  );
}
