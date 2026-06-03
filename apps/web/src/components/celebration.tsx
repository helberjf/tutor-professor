'use client';

import { useEffect, useRef, useState } from 'react';

interface Particle {
  id: number;
  left: number;
  duration: number;
  delay: number;
  size: number;
  color: string;
  emoji: string;
}

const COLORS = [
  '#facc15', // yellow
  '#38bdf8', // sky
  '#f472b6', // pink
  '#34d399', // emerald
  '#a78bfa', // violet
  '#fb923c', // orange
  '#f87171', // rose
];

const EMOJIS = ['⭐', '🎉', '✨', '🌟', '🎊', '🏆', '🎈', '💫'];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: 2 + (i / count) * 96 + (Math.random() * 4 - 2),
    duration: 1.2 + Math.random() * 0.8,
    delay: Math.random() * 0.7,
    size: 18 + Math.floor(Math.random() * 14),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
  }));
}

interface Props {
  show: boolean;
  count?: number;
}

export function CelebrationOverlay({ show, count = 22 }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!show) return;

    setParticles(generateParticles(count));
    setVisible(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, count]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="celebrate-fall"
          style={{
            left: `${p.left}%`,
            top: '-48px',
            fontSize: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
