'use client';

import { progressToneClass } from './objective-areas';

/**
 * The percentage, drawn once and reused everywhere.
 *
 * It is a `progressbar` rather than a styled div because the number is the
 * whole point of the screen: a screen reader has to announce it too.
 */
export function ObjectiveProgressBar({
  percent,
  label,
  compact = false,
}: {
  percent: number;
  label: string;
  compact?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-slate-100 ${compact ? 'h-2' : 'h-3'}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${progressToneClass(clamped)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
