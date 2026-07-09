'use client';

import { useState } from 'react';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { DailyActivityWidget } from '@/components/daily-activity-widget';
import { WeeklyActivityChart } from '@/components/weekly-activity-chart';

export function StudyStatisticsPanel() {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <TrendingUp size={18} />
        Ver Estatísticas
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Estatísticas</h3>
        <button
          onClick={() => setIsExpanded(false)}
          className="inline-flex rounded p-1 text-slate-600 transition hover:bg-slate-100"
        >
          <ChevronDown size={20} className="rotate-180" />
        </button>
      </div>

      {/* Widget */}
      <DailyActivityWidget />

      {/* Gráfico */}
      <div className="mt-4">
        <WeeklyActivityChart />
      </div>
    </div>
  );
}
