'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, WifiOff } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { isPrivateAppPath } from '@/lib/private-routes';

type GateStatus = 'checking' | 'allowed' | 'redirecting' | 'server_missing';

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const currentPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const requiresAuth = isPrivateAppPath(currentPath);
  const [status, setStatus] = useState<GateStatus>(requiresAuth ? 'checking' : 'allowed');

  useEffect(() => {
    if (!requiresAuth) {
      setStatus('allowed');
      return;
    }

    let cancelled = false;
    setStatus('checking');
    api
      .getUserMe()
      .then(() => {
        if (!cancelled) {
          setStatus('allowed');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === 'unconfigured' || err.code === 'offline')) {
          setStatus('server_missing');
          return;
        }
        setStatus('redirecting');
        router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPath, requiresAuth, router]);

  if (!requiresAuth || status === 'allowed') {
    return <>{children}</>;
  }

  if (status === 'server_missing') {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <WifiOff size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Servidor offline</h1>
          <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
            Inicie a API e o Cloudflare Tunnel para entrar nesta area.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="animate-spin text-primary" size={30} />
      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
        {status === 'redirecting' ? 'Abrindo login' : 'Verificando login'}
      </p>
    </main>
  );
}
