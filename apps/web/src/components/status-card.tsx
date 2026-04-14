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
    <div className="min-h-screen px-4 py-6 md:px-6 md:py-10">
      <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center md:min-h-[70vh]">
        <div
          className={`w-full rounded-[1.5rem] border-4 p-6 text-center shadow-[0_30px_80px_rgba(14,165,233,0.18)] md:rounded-[2rem] md:p-10 ${toneStyles[tone]}`}
        >
          <div className="mb-4 flex justify-center md:mb-6">{toneIcons[tone]}</div>
          <h1 className="mb-3 text-3xl font-black text-slate-800 md:text-4xl">{title}</h1>
          <p className="mx-auto mb-6 max-w-xl text-base leading-7 text-slate-600 md:mb-8 md:text-lg md:leading-8">{message}</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {primaryAction}
            {secondaryHref && secondaryLabel ? (
              <Link
                href={secondaryHref}
                className="rounded-full border-2 border-slate-200 px-5 py-3 text-base font-bold text-slate-600 transition hover:border-primary hover:text-primary md:px-6 md:text-lg"
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
