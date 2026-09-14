import { StatusCard } from '@/components/status-card';

export default function OfflinePage() {
  return (
    <StatusCard
      tone="offline"
      title="Sistema temporariamente indisponível"
      message="Não foi possível carregar o tutor agora. Aguarde um momento e atualize a página."
      secondaryHref="/"
      secondaryLabel="Voltar ao início"
    />
  );
}
