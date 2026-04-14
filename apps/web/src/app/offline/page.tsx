'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StatusCard } from '@/components/status-card';
import { getApiConnectionDetails, subscribeToApiBaseUrlChange } from '@/lib/api-config';

export default function OfflinePage() {
  const [connection, setConnection] = useState(() => getApiConnectionDetails());

  useEffect(() => {
    const syncConnection = () => setConnection(getApiConnectionDetails());
    syncConnection();
    return subscribeToApiBaseUrlChange(syncConnection);
  }, []);

  const isUnconfigured = !connection.baseUrl;
  const title = isUnconfigured ? 'Connect the tutor first' : 'Backend offline help';
  const message = isUnconfigured
    ? 'This device does not know your backend URL yet. On your computer, run cloudflared tunnel --url http://localhost:8001, copy the HTTPS URL, then save it on the connection page.'
    : `We tried ${connection.host} but could not reach the FastAPI backend. Make sure your computer, backend, and Cloudflare Tunnel are all running, or change the saved URL.`;

  return (
    <StatusCard
      tone="offline"
      title={title}
      message={message}
      primaryAction={
        <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
          Open Connection Setup
        </Link>
      }
      secondaryHref="/"
      secondaryLabel="Back Home"
    />
  );
}
