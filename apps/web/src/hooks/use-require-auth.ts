'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ApiError, api, type UserProfile } from '@/lib/api';

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
    };
  }, [pathname, router]);

  return state;
}
