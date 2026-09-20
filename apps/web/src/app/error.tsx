'use client';

import { StatusCard } from '@/components/status-card';
import { t } from '@/lib/i18n';

export default function GlobalError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <StatusCard
      tone="error"
      title={t("Algo saiu do lugar")}
      message={t("Uma página falhou enquanto estávamos preparando tudo. Tente novamente ou volte para o início.")}
      primaryAction={
        <button onClick={() => reset()} className="app-button bg-brand-pink hover:bg-pink-500">
          {t("Tentar de novo")}
        </button>
      }
      secondaryHref="/"
      secondaryLabel={t("Voltar ao início")}
    />
  );
}
