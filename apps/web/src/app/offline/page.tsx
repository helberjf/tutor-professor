'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StatusCard } from '@/components/status-card';
import { getApiConnectionDetails, refreshRuntimeBackendConfig, subscribeToApiBaseUrlChange } from '@/lib/api-config';

export default function OfflinePage() {
  const [connection, setConnection] = useState(() => getApiConnectionDetails());

  useEffect(() => {
    const syncConnection = () => setConnection(getApiConnectionDetails());
    syncConnection();
    void refreshRuntimeBackendConfig().then(syncConnection);
    return subscribeToApiBaseUrlChange(syncConnection);
  }, []);

  const isUnconfigured = !connection.baseUrl;
  const title = isUnconfigured ? 'Conecte o tutor primeiro' : 'Ajuda para backend offline';
  const message = isUnconfigured
    ? 'Este aparelho ainda nao conhece a URL do seu backend. No seu computador, rode cloudflared tunnel --url http://127.0.0.1:8001. Se o launcher ja sincronizou a URL global, recarregue esta pagina; se preferir, voce ainda pode salvar manualmente na pagina de conexao.'
    : `Tentamos usar ${connection.host}, mas nao conseguimos acessar o backend FastAPI. Verifique se o seu computador, o backend e o Cloudflare Tunnel estao ligados, ou troque a URL salva.`;

  return (
    <StatusCard
      tone="offline"
      title={title}
      message={message}
      primaryAction={
        <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
          Abrir configuracao de conexao
        </Link>
      }
      secondaryHref="/"
      secondaryLabel="Voltar ao inicio"
    />
  );
}
