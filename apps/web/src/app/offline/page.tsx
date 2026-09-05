import { StatusCard } from '@/components/status-card';

export default function OfflinePage() {
  return (
    <StatusCard
      tone="offline"
      title="Sistema temporariamente indisponivel"
      message="Nao foi possivel carregar o tutor agora. Aguarde um momento e atualize a pagina."
      secondaryHref="/"
      secondaryLabel="Voltar ao inicio"
    />
  );
}
