'use client';

import { useEffect, useState } from 'react';
import {
  formatTimer,
  parseStoredPomodoroState,
  POMODORO_STORAGE_KEY,
  resolvePomodoroState,
} from '@/lib/pomodoro';

interface CornerState {
  seconds: number;
  mode: 'focus' | 'break';
}

function readCorner(): CornerState | null {
  try {
    const stored = parseStoredPomodoroState(window.localStorage.getItem(POMODORO_STORAGE_KEY));
    const resolved = resolvePomodoroState(stored, Date.now());
    if (!stored.running || !resolved.running) return null;
    return { seconds: resolved.seconds, mode: resolved.mode };
  } catch {
    return null;
  }
}

/** Contagem minúscula e quase invisível no canto superior direito enquanto o pomodoro roda. */
export function PomodoroCorner() {
  const [corner, setCorner] = useState<CornerState | null>(null);

  useEffect(() => {
    const tick = () => {
      const next = readCorner();
      setCorner((prev) =>
        prev?.seconds === next?.seconds && prev?.mode === next?.mode ? prev : next,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!corner) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-2 top-1 z-[9999] select-none font-mono text-[10px] leading-none tabular-nums text-slate-400/50 dark:text-slate-300/40"
    >
      {corner.mode === 'break' ? '☕ ' : ''}
      {formatTimer(corner.seconds)}
    </div>
  );
}
