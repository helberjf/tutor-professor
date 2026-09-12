'use client';

import { StatusCard } from '@/components/status-card';

export default function GlobalError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <StatusCard
      tone="error"
      title="Algo saiu do lugar"
      message="Uma página falhou enquanto estávamos preparando tudo. Tente novamente ou volte para o início."
      primaryAction={
        <button onClick={() => reset()} className="app-button bg-brand-pink hover:bg-pink-500">
          Tentar de novo
        </button>
      }
      secondaryHref="/"
      secondaryLabel="Voltar ao início"
    />
  );
}
