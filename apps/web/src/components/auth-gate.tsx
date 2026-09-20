'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, WifiOff } from 'lucide-react';

import { ApiError, api, isSessionRejection, subscribeToUserProfileRevalidation, type UserProfile } from '@/lib/api';
import { AccountReviewNotice } from '@/components/account-review-notice';
import { isPrivateAppPath } from '@/lib/private-routes';
import { t } from '@/lib/i18n';

type GateStatus = 'checking' | 'allowed' | 'awaiting_review' | 'redirecting' | 'server_missing';

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
  const [user, setUser] = useState<UserProfile | null>(null);
  const [recheckCount, setRecheckCount] = useState(0);

  const recheck = useCallback(() => setRecheckCount((count) => count + 1), []);

  useEffect(() => {
    if (!requiresAuth) {
      setStatus('allowed');
      return;
    }

    let cancelled = false;
    setStatus('checking');

    const applyProfile = (profile: UserProfile) => {
      setUser(profile);
      setStatus(profile.status === 'approved' ? 'allowed' : 'awaiting_review');
    };
    const sendToLogin = () => {
      setStatus('redirecting');
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    };

    // getUserMe responde com o perfil da última visita quando existe um, e a
    // conferência corre em paralelo. É esta inscrição que fecha o portão de novo
    // se ela vier dizendo que a sessão acabou.
    const unsubscribe = subscribeToUserProfileRevalidation(({ profile, error }) => {
      if (cancelled) return;
      if (profile) {
        applyProfile(profile);
        return;
      }
      if (!isSessionRejection(error)) return;
      sendToLogin();
    });

    // The first pass reuses the shared /api/auth/me cache; a manual recheck from
    // the waiting screen must bypass it to notice a fresh approval.
    (recheckCount === 0 ? api.getUserMe() : api.refreshUserMe())
      .then((profile) => {
        if (cancelled) return;
        applyProfile(profile);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === 'unconfigured' || err.code === 'offline')) {
          setStatus('server_missing');
          return;
        }
        sendToLogin();
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentPath, recheckCount, requiresAuth, router]);

  if (!requiresAuth || status === 'allowed') {
    return <>{children}</>;
  }

  if (status === 'awaiting_review' && user) {
    return <AccountReviewNotice user={user} onRecheck={recheck} />;
  }

  if (status === 'server_missing') {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <WifiOff size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">{t("Servidor offline")}</h1>
          <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
          {t("Inicie a API e o Cloudflare Tunnel para entrar nesta área.")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="animate-spin text-primary" size={30} />
      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
        {status === 'redirecting' ? t("Abrindo login") : t("Verificando login")}
      </p>
    </main>
  );
}
