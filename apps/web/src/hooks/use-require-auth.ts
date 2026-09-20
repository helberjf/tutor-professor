'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ApiError, api, isSessionRejection, subscribeToUserProfileRevalidation } from '@/lib/api';
import type { UserProfile } from '@/lib/api';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: UserProfile }
  | { status: 'unauthenticated' }
  | { status: 'server_missing' };

export function useRequireAuth(): AuthState {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    // getUserMe pode responder com o perfil da última visita e conferir em
    // paralelo. Quando essa conferência recusa a sessão, é por aqui que a tela
    // fica sabendo — sem isso, ela continuaria desenhada enquanto todas as
    // chamadas de dados voltassem 401.
    const unsubscribe = subscribeToUserProfileRevalidation(({ profile, error }) => {
      if (cancelled) return;
      if (profile) {
        setState({ status: 'authenticated', user: profile });
        return;
      }
      if (!isSessionRejection(error)) return;
      setState({ status: 'unauthenticated' });
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
    });

    api
      .getUserMe()
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'unconfigured') {
          setState({ status: 'server_missing' });
          return;
        }
        // 401 or offline → redirect to login
        setState({ status: 'unauthenticated' });
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pathname, router]);

  return state;
}
