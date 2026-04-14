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
      title="Something went wobbly"
      message="A page crashed while we were getting things ready. Try the page again or head back home."
      primaryAction={
        <button onClick={() => reset()} className="kid-button bg-kid-pink hover:bg-pink-500">
          Try Again
        </button>
      }
      secondaryHref="/"
      secondaryLabel="Back Home"
    />
  );
}
