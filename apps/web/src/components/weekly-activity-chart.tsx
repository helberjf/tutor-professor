'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, type DailyActivitySummarySchema, ApiError } from '@/lib/api';

// Utility function to get Portuguese day abbreviation
const getDayLabel = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
  return formatter.format(date).substring(0, 3);
};

const COLORS_BY_TYPE: Record<string, string> = {
  lesson: 'bg-blue-500',
  study: 'bg-emerald-500',
  review: 'bg-green-500',
  quiz: 'bg-purple-500',
  coding: 'bg-orange-500',
  diverse: 'bg-indigo-500',
  leetcode: 'bg-amber-500',
  flashcard: 'bg-violet-500',
  coding_review: 'bg-cyan-500',
};

function getTypeLabel(type: string) {
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
  };

  return labels[type] || type.replace(/_/g, ' ');
}

interface ActivityBar {
  date: string;
  dayLabel: string;
  activities: Array<{ type: string; count: number }>;
  total: number;
}

export function WeeklyActivityChart() {
  const [weekData, setWeekData] = useState<ActivityBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeekData = async () => {
      try {
        setLoading(true);
        const data = await api.getWeekActivities();

        const bars: ActivityBar[] = data.map((day) => {
          const [year, month, dayNum] = day.activity_date.split('-').map(Number);
          const date = new Date(year, month - 1, dayNum);
          const dayLabel = getDayLabel(date);

          const activities = Object.entries(day.activities_by_type).map(([type, count]) => ({
            type,
            count,
          }));

          return {
            date: day.activity_date,
            dayLabel,
            activities,
            total: day.total_activities,
          };
        });

        setWeekData(bars);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(`Erro: ${err.message}`);
        } else {
          setError('Erro ao carregar dados');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchWeekData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-700">{error}</p>
      </div>
    );
  }

  // Encontra o máximo de atividades em um dia para escala
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-800">Atividades da Semana</h2>
        <p className="text-sm text-slate-600">Últimos 7 dias</p>
      </div>

      {/* Chart */}
      <div className="flex items-end justify-between gap-2">
        {weekData.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
            {/* Bar */}
            <div className="relative h-32 w-full rounded-t-lg border-2 border-slate-200 bg-slate-50">
              {day.total > 0 && (
                <div className="absolute inset-0 flex flex-col-reverse overflow-hidden rounded-t-lg">
                  {/* Stacked bar por tipo */}
                  {day.activities.map((activity) => {
                    const heightPercent = (activity.count / day.total) * 100;
                    return (
                      <div
                        key={activity.type}
                        className={`w-full transition-all hover:opacity-80 ${COLORS_BY_TYPE[activity.type] || 'bg-slate-400'}`}
                        style={{
                          height: `${heightPercent}%`,
                        }}
                        title={`${activity.type}: ${activity.count}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Label */}
            <div className="text-center">
              <p className="text-xs font-bold text-slate-800">{day.dayLabel}</p>
              <p className="text-xs text-slate-600">{day.total}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4">
        {Object.entries(COLORS_BY_TYPE).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded ${color}`} />
            <span className="text-xs font-medium text-slate-600">{getTypeLabel(type)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
