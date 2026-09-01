'use client';

import { useCallback, useEffect, useState } from 'react';

/** mm:ss, or h:mm:ss once the clock reaches an hour. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export interface Countdown {
  /** False when no duration was given, so the caller renders no clock at all. */
  timed: boolean;
  remaining: number;
  elapsed: number;
  expired: boolean;
  restart: () => void;
}

/**
 * A countdown driven by a deadline rather than a decrementing counter.
 *
 * Browsers throttle timers in background tabs, so an interval that only
 * subtracts one second per tick hands back minutes that never existed. Storing
 * the instant the clock runs out and recomputing from it keeps the exam honest.
 */
export function useCountdown(durationSeconds: number | undefined, active: boolean): Countdown {
  const timed = typeof durationSeconds === 'number' && durationSeconds > 0;
  const total = durationSeconds ?? 0;
  const [deadline, setDeadline] = useState(() => Date.now() + total * 1000);
  const [remaining, setRemaining] = useState(total);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!timed || !active || expired) return;
    function tick() {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setExpired(true);
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timed, active, expired, deadline]);

  const restart = useCallback(() => {
    setExpired(false);
    setRemaining(total);
    setDeadline(Date.now() + total * 1000);
  }, [total]);

  return { timed, remaining, elapsed: Math.max(0, total - remaining), expired, restart };
}
