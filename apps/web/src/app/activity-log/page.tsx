'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { DailyActivityLog } from '@/components/daily-activity-log';
import { useRequireAuth } from '@/hooks/use-require-auth';

export default function ActivityLogPage() {
  useRequireAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-6">
      {/* Header */}
      <div className="mx-auto max-w-2xl">
        <Link
          href="/study"
          className="mb-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={18} />
          Voltar
        </Link>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl">
        <DailyActivityLog />
      </div>
    </div>
  );
}
