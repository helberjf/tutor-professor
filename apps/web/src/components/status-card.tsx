'use client';

import Link from 'next/link';
import { AlertCircle, Loader2, Sparkles, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'loading' | 'offline' | 'empty' | 'error';

const toneStyles: Record<Tone, string> = {
  loading: 'border-primary bg-white/95',
  offline: 'border-kid-orange bg-white/95',
  empty: 'border-accent bg-white/95',
  error: 'border-kid-pink bg-white/95',
};

const toneIcons: Record<Tone, ReactNode> = {
  loading: <Loader2 className="animate-spin text-primary" size={48} />,
  offline: <WifiOff className="text-kid-orange" size={48} />,
  empty: <Sparkles className="text-accent-dark" size={48} />,
  error: <AlertCircle className="text-kid-pink" size={48} />,
};

interface StatusCardProps {
  title: string;
  message: string;
  tone?: Tone;
  primaryAction?: ReactNode;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function StatusCard({
  title,
  message,
  tone = 'loading',
  primaryAction,
  secondaryHref,
  secondaryLabel,
}: StatusCardProps) {
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
        <div
          className={`w-full rounded-[2rem] border-4 p-10 text-center shadow-[0_30px_80px_rgba(14,165,233,0.18)] ${toneStyles[tone]}`}
        >
          <div className="mb-6 flex justify-center">{toneIcons[tone]}</div>
          <h1 className="mb-3 text-4xl font-black text-slate-800">{title}</h1>
          <p className="mx-auto mb-8 max-w-xl text-lg leading-8 text-slate-600">{message}</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {primaryAction}
            {secondaryHref && secondaryLabel ? (
              <Link
                href={secondaryHref}
                className="rounded-full border-2 border-slate-200 px-6 py-3 text-lg font-bold text-slate-600 transition hover:border-primary hover:text-primary"
              >
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
