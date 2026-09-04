'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker que torna o app instalavel e sobrevivente a uma
 * queda de rede.
 *
 * Em desenvolvimento ele faz o contrario: remove qualquer registro anterior.
 * Sem isso, um service worker instalado numa build de producao continuaria
 * servindo arquivos em cache por cima do servidor de desenvolvimento, e a
 * pessoa editaria o codigo sem ver a mudanca.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch(() => {
          /* nada a fazer: o app funciona sem service worker */
        });
      return;
    }

    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* instalacao e um extra; falhar aqui nao pode derrubar o app */
      });
    };

    // Depois do load para a instalacao nao competir com o primeiro render.
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
