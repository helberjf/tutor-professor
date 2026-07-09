'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, Clock, Code2, Loader2, HelpCircle, X } from 'lucide-react';
import { api, type DailyActivitySummarySchema, ApiError } from '@/lib/api';
import { StatusCard } from './status-card';

// Utility functions to replace date-fns
const formatDate = (date: Date, format: string): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (format === 'yyyy-MM-dd') return `${year}-${month}-${day}`;
  if (format === 'HH:mm') return `${hours}:${minutes}`;
  return date.toLocaleDateString('pt-BR');
};

const getPortugueseDateLabel = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formatter = new Intl.DateTimeFormat('pt-BR', options);
  return formatter.format(date);
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  lesson: <BookOpen className="text-blue-500" size={20} />,
  review: <CheckCircle2 className="text-green-500" size={20} />,
  quiz: <HelpCircle className="text-purple-500" size={20} />,
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

type ActivityType = 'lesson' | 'review' | 'quiz' | 'coding';

interface DailyActivityLogProps {
  childId?: number;
  date?: Date;
  showFilters?: boolean;
}

export function DailyActivityLog({ date = new Date(), showFilters = true }: DailyActivityLogProps) {
  const [activities, setActivities] = useState<DailyActivitySummarySchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Set<ActivityType>>(new Set());

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use endpoint para hoje ou para uma data específica
        const isToday = formatDate(date, 'yyyy-MM-dd') === formatDate(new Date(), 'yyyy-MM-dd');
        const data = isToday
          ? await api.getTodayActivities()
          : await api.getDayActivities(formatDate(date, 'yyyy-MM-dd'));

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
        message={`Nenhuma atividade registrada para ${getPortugueseDateLabel(date)}`}
        tone="empty"
      />
    );
  }

  const dateLabel = getPortugueseDateLabel(date);

  // Filtrar atividades
  const filteredActivities = selectedFilters.size === 0
    ? activities.activities
    : activities.activities.filter((activity) => selectedFilters.has(activity.activity_type as ActivityType));

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

      {/* Filters */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(ACTIVITY_LABELS).map(([type, label]) => {
            const isSelected = selectedFilters.size === 0 || selectedFilters.has(type as ActivityType);
            const count = activities.activities_by_type[type] || 0;

            return (
              <button
                key={type}
                onClick={() => {
                  const newFilters = new Set(selectedFilters);
                  if (isSelected) {
                    // Se estava selecionado, desseleciona
                    newFilters.delete(type as ActivityType);
                  } else {
                    // Se estava deselecionado, seleciona
                    newFilters.add(type as ActivityType);
                  }
                  setSelectedFilters(newFilters);
                }}
                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                  isSelected
                    ? 'border-primary bg-blue-50 text-slate-800'
                    : 'border-slate-200 bg-white text-slate-600 opacity-50'
                }`}
              >
                {label}
                <span className="rounded bg-white px-1.5 py-0.5 text-xs font-bold">
                  {count}
                </span>
              </button>
            );
          })}
          {selectedFilters.size > 0 && (
            <button
              onClick={() => setSelectedFilters(new Set())}
              className="inline-flex items-center gap-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Limpar <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Activities List */}
      <div className="space-y-3">
        {filteredActivities.map((activity) => (
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
                {formatDate(new Date(activity.created_at), 'HH:mm')}
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
