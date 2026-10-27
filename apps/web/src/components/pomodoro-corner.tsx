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
export function PomodoroCorner({ embedded = false }: { embedded?: boolean }) {
  const [corner, setCorner] = useState<CornerState | null>(null);

  useEffect(() => {
    const tick = () => {
      // A leitura mostra o seu próprio contador dentro do cartão; o global some.
      const next =
        !embedded && document.querySelector('[aria-labelledby="reading-study-title"]')
          ? null
          : readCorner();
      setCorner((prev) =>
        prev?.seconds === next?.seconds && prev?.mode === next?.mode ? prev : next,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [embedded]);

  if (!corner) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none z-[9999] select-none font-mono text-[18px] leading-none ${embedded ? 'absolute right-2 top-0' : 'fixed right-1.5 top-px'} tabular-nums text-slate-500/60 [text-shadow:0_0_2px_rgba(15,23,42,0.35)] dark:text-slate-300/50`}
    >
      {corner.mode === 'break' ? '☕ ' : ''}
      {formatTimer(corner.seconds)}
    </div>
  );
}
