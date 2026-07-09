'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, Clock, Code2, Loader2, Quiz } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api, type DailyActivitySummarySchema, ApiError } from '@/lib/api';
import { StatusCard } from './status-card';

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  lesson: <BookOpen className="text-blue-500" size={20} />,
  review: <CheckCircle2 className="text-green-500" size={20} />,
  quiz: <Quiz className="text-purple-500" size={20} />,
  coding: <Code2 className="text-orange-500" size={20} />,
};

const ACTIVITY_LABELS: Record<string, string> = {
  lesson: 'Lição',
  review: 'Revisão',
  quiz: 'Quiz',
  coding: 'Programação',
};

const ACTIVITY_COLORS: Record<string, string> = {
  lesson: 'bg-blue-50 border-blue-200',
  review: 'bg-green-50 border-green-200',
  quiz: 'bg-purple-50 border-purple-200',
  coding: 'bg-orange-50 border-orange-200',
};

interface DailyActivityLogProps {
  childId?: number;
  date?: Date;
}

export function DailyActivityLog({ date = new Date() }: DailyActivityLogProps) {
  const [activities, setActivities] = useState<DailyActivitySummarySchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use endpoint para hoje ou para uma data específica
        const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
        const data = isToday
          ? await api.get<DailyActivitySummarySchema>('/activity/today')
          : await api.get<DailyActivitySummarySchema>(`/activity/day/${format(date, 'yyyy-MM-dd')}`);

        setActivities(data);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(`Erro ao carregar atividades: ${err.message}`);
        } else {
          setError('Erro ao carregar atividades');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [date]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <StatusCard
        title="Erro ao carregar"
        message={error}
        tone="error"
      />
    );
  }

  if (!activities || activities.total_activities === 0) {
    return (
      <StatusCard
        title="Nenhuma atividade"
        message={`Nenhuma atividade registrada para ${format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        tone="empty"
      />
    );
  }

  const dateLabel = format(date, "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="w-full max-w-2xl rounded-2xl border-2 border-primary bg-white p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-600">
          <Clock size={16} />
          <span>{dateLabel}</span>
        </div>
        <h2 className="text-2xl font-black text-slate-800">Atividades do Dia</h2>
      </div>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
          <div className="text-2xl font-bold text-slate-800">{activities.total_activities}</div>
          <div className="text-xs font-medium text-slate-600">Total</div>
        </div>
        {Object.entries(activities.activities_by_type).map(([type, count]) => (
          <div key={type} className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
            <div className="text-2xl font-bold text-slate-800">{count}</div>
            <div className="text-xs font-medium text-slate-600">{ACTIVITY_LABELS[type] || type}</div>
          </div>
        ))}
      </div>

      {/* Activities List */}
      <div className="space-y-3">
        {activities.activities.map((activity) => (
          <div
            key={activity.id}
            className={`flex items-start gap-4 rounded-lg border-2 p-4 ${ACTIVITY_COLORS[activity.activity_type] || 'bg-gray-50 border-gray-200'}`}
          >
            {/* Icon */}
            <div className="mt-1 flex-shrink-0">
              {ACTIVITY_ICONS[activity.activity_type] || <AlertCircle size={20} />}
            </div>

            {/* Content */}
            <div className="flex-grow">
              <h3 className="font-semibold text-slate-800">{activity.activity_title}</h3>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded bg-white/60 px-2 py-1">
                  {ACTIVITY_LABELS[activity.activity_type]}
                </span>
                {activity.result_score !== null && (
                  <span className="rounded bg-white/60 px-2 py-1">
                    {activity.result_score.toFixed(0)}%
                  </span>
                )}
                {activity.duration_seconds && (
                  <span className="rounded bg-white/60 px-2 py-1">
                    {formatDuration(activity.duration_seconds)}
                  </span>
                )}
              </div>
            </div>

            {/* Time */}
            <div className="flex-shrink-0 text-right">
              <div className="text-sm font-medium text-slate-700">
                {format(new Date(activity.created_at), 'HH:mm')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs}s`;
  if (secs === 0) return `${minutes}m`;
  return `${minutes}m ${secs}s`;
}
