'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock, Code2, Loader2, HelpCircle, MessageCircle, Target, X } from 'lucide-react';
import { api, type DailyActivitySummarySchema, ApiError } from '@/lib/api';
import { StatusCard } from './status-card';
import { ActivityDetails } from './activity-details';

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
  coding: <Code2 className="text-orange-500" size={20} />,
  leetcode: <span aria-hidden="true">🏆</span>,
  question: <HelpCircle className="text-amber-500" size={20} />,
  exam: <CheckCircle2 className="text-indigo-500" size={20} />,
  objective: <Target className="text-sky-600" size={20} />,
  chat: <MessageCircle className="text-teal-500" size={20} />,
};

const ACTIVITY_LABELS: Record<string, string> = {
  lesson: 'Lição',
  review: 'Revisão',
  coding: 'Programação',
  leetcode: 'LeetCode',
  question: 'Questão',
  exam: 'Simulado',
  objective: 'Objetivo',
  chat: 'Conversa',
};

const ACTIVITY_COLORS: Record<string, string> = {
  lesson: 'bg-blue-50 border-blue-200',
  review: 'bg-green-50 border-green-200',
  coding: 'bg-orange-50 border-orange-200',
  leetcode: 'bg-amber-50 border-amber-200',
  question: 'bg-amber-50 border-amber-200',
  exam: 'bg-indigo-50 border-indigo-200',
  objective: 'bg-sky-50 border-sky-200',
  chat: 'bg-teal-50 border-teal-200',
};

interface DailyActivityLogProps {
  childId?: number;
  date?: Date;
  showFilters?: boolean;
}

function getActivityLabel(type: string) {
  return ACTIVITY_LABELS[type] || type.replace(/_/g, ' ');
}

function getActivityIcon(type: string) {
  return ACTIVITY_ICONS[type] || <AlertCircle size={20} />;
}

export function DailyActivityLog({ date: dateProp, showFilters = true }: DailyActivityLogProps) {
  // dateProp defaults to undefined when the caller omits it; deriving `new Date()`
  // via useMemo (instead of a default parameter) keeps a stable reference across
  // re-renders so the fetch effect below doesn't re-run on every render.
  const initialDate = useMemo(() => dateProp ?? new Date(), [dateProp]);
  // Every day has been recorded since the feed existed, and the API already
  // serves any of them. Holding the day here is what finally lets somebody read
  // what they did last Tuesday instead of only what they did today.
  const [date, setDate] = useState<Date>(initialDate);
  const [activities, setActivities] = useState<DailyActivitySummarySchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDate(initialDate);
  }, [initialDate]);

  const todayKey = formatDate(new Date(), 'yyyy-MM-dd');
  const dateKey = formatDate(date, 'yyyy-MM-dd');
  const isToday = dateKey === todayKey;

  const shiftDay = (days: number) => {
    setDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + days);
      // Tomorrow has nothing to show and no way back other than this button, so
      // the walk simply stops at today.
      return formatDate(next, 'yyyy-MM-dd') > todayKey ? current : next;
    });
    setSelectedFilters(new Set());
  };

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use endpoint para hoje ou para uma data específica
        const data = formatDate(date, 'yyyy-MM-dd') === formatDate(new Date(), 'yyyy-MM-dd')
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

  const dateLabel = getPortugueseDateLabel(date);

  // The day picker stays mounted through loading, errors and empty days: it is
  // the only way back out of a day with nothing in it.
  const dayNavigation = (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <Clock size={16} />
        <span>{dateLabel}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-2xl font-black text-slate-800">
          {isToday ? 'Atividades do Dia' : 'Atividades do dia escolhido'}
        </h2>
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          aria-label="Dia anterior"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-slate-200 text-slate-700 transition hover:bg-slate-50"
        >
          <ChevronLeft size={18} />
        </button>
        <input
          type="date"
          value={dateKey}
          max={todayKey}
          onChange={(event) => {
            const [year, month, day] = event.target.value.split('-').map(Number);
            if (!year || !month || !day) return;
            setDate(new Date(year, month - 1, day));
            setSelectedFilters(new Set());
          }}
          aria-label="Escolher o dia"
          className="h-11 rounded-lg border-2 border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => shiftDay(1)}
          disabled={isToday}
          aria-label="Próximo dia"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronRight size={18} />
        </button>
        {isToday ? null : (
          <button
            type="button"
            onClick={() => {
              setDate(new Date());
              setSelectedFilters(new Set());
            }}
            className="h-11 rounded-lg border-2 border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Hoje
          </button>
        )}
      </div>
    </div>
  );

  const frame = (children: React.ReactNode) => (
    <div className="w-full max-w-2xl rounded-2xl border-2 border-primary bg-white p-6">
      {dayNavigation}
      {children}
    </div>
  );

  if (loading) {
    return frame(
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>,
    );
  }

  if (error) {
    return frame(<StatusCard title="Erro ao carregar" message={error} tone="error" />);
  }

  if (!activities || activities.total_activities === 0) {
    return frame(
      <StatusCard
        title="Nenhuma atividade"
        message={`Nenhuma atividade registrada para ${dateLabel}`}
        tone="empty"
      />,
    );
  }

  // Filtrar atividades
  const filteredActivities = selectedFilters.size === 0
    ? activities.activities
    : activities.activities.filter((activity) => selectedFilters.has(activity.activity_type));

  return frame(
    <>
      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
          <div className="text-2xl font-bold text-slate-800">{activities.total_activities}</div>
          <div className="text-xs font-medium text-slate-600">Total</div>
        </div>
        <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
          <div className="text-2xl font-bold text-slate-800">{formatDuration(activities.total_duration_seconds ?? 0)}</div>
          <div className="text-xs font-medium text-slate-600">Tempo registrado</div>
        </div>
        <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
          <div className="text-2xl font-bold text-slate-800">
            {activities.average_score === null || activities.average_score === undefined ? '—' : `${Math.round(activities.average_score)}%`}
          </div>
          <div className="text-xs font-medium text-slate-600">Média c/ nota</div>
        </div>
        {Object.entries(activities.activities_by_type).map(([type, count]) => (
          <div key={type} className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
            <div className="text-2xl font-bold text-slate-800">{count}</div>
            <div className="text-xs font-medium text-slate-600">{getActivityLabel(type)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.keys(activities.activities_by_type).map((type) => {
            const label = getActivityLabel(type);
            const isSelected = selectedFilters.size === 0 || selectedFilters.has(type);
            const count = activities.activities_by_type[type] || 0;

            return (
              <button
                key={type}
                onClick={() => {
                  const newFilters = new Set(selectedFilters);
                  if (isSelected) {
                    newFilters.delete(type);
                  } else {
                    newFilters.add(type);
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
              {getActivityIcon(activity.activity_type)}
            </div>

            {/* Content */}
            <div className="flex-grow">
              <h3 className="font-semibold text-slate-800">{activity.activity_title}</h3>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded bg-white/60 px-2 py-1">
                  {getActivityLabel(activity.activity_type)}
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
              <ActivityDetails details={activity.result_details} />
            </div>

            {/* Time */}
            <div className="flex-shrink-0 text-right">
              <div className="text-sm font-medium text-slate-700">
                {formatDate(parseActivityTimestamp(activity.created_at), 'HH:mm')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>,
  );
}

function parseActivityTimestamp(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs}s`;
  if (secs === 0) return `${minutes}m`;
  return `${minutes}m ${secs}s`;
}
