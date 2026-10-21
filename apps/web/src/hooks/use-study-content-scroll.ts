'use client';

import { useEffect, useRef } from 'react';

/** Position a new study destination after its content has rendered. */
export function useStudyContentScroll<T extends HTMLElement>(destination: string, ready = true) {
  const targetRef = useRef<T>(null);

  useEffect(() => {
    if (!ready) return;
    const frame = window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [destination, ready]);

  return targetRef;
}
