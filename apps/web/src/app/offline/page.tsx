import { StatusCard } from '@/components/status-card';
import { t } from '@/lib/i18n';

export default function OfflinePage() {
  return (
    <StatusCard
      tone="offline"
      title={t("Sistema temporariamente indisponível")}
      message={t("Não foi possível carregar o tutor agora. Aguarde um momento e atualize a página.")}
      secondaryHref="/"
      secondaryLabel={t("Voltar ao início")}
    />
  );
}
