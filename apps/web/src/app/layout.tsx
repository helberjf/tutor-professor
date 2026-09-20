import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

import './globals.css';
import { AuthGate } from '@/components/auth-gate';
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar';
import { Navbar } from '@/components/navbar';
import { BottomNav } from '@/components/bottom-nav';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeScript } from '@/components/theme-script';
import { LocaleProvider } from '@/components/locale-provider';
import { LocaleScript } from '@/components/locale-script';
import { SkipLink } from '@/components/skip-link';

export const metadata: Metadata = {
  metadataBase: new URL('https://tutorprofessor.vercel.app'),
  title: 'Tutor and Professor',
  description: 'Tutor and Professor: aulas, revisão espaçada e estudo guiado para quem quiser aprender.',
  openGraph: {
    title: 'Tutor and Professor',
    description: 'Tutor and Professor: aulas, revisão espaçada e estudo guiado para quem quiser aprender.',
    url: 'https://tutorprofessor.vercel.app',
    siteName: 'Tutor and Professor',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: '/icons/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Tutor and Professor',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tutor and Professor',
    description: 'Tutor and Professor: aulas, revisão espaçada e estudo guiado para quem quiser aprender.',
    images: ['/icons/icon-512.png'],
  },
  applicationName: 'Tutor and Professor',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    // What makes "Adicionar a Tela de Início" open without Safari's chrome.
    capable: true,
    title: 'Tutor',
    // Deliberately not 'black-translucent': that pushes content under the iOS
    // status bar, and the fixed navbar would end up sitting behind the clock.
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  other: {
    // Next 15 so emite o nome padronizado (mobile-web-app-capable). O Safari
    // so passou a entende-lo no iOS 17, então o nome antigo fica junto para o
    // iPhone e o iPad mais velhos também abrirem em tela cheia.
    'apple-mobile-web-app-capable': 'yes',
  },
};

/**
 * The origin every API call goes to, when the build already knows it.
 *
 * Nothing on the first paint comes from the backend, so the browser only starts
 * resolving DNS and negotiating TLS with it when the first fetch fires — after
 * hydration. Announcing the origin here gets that handshake out of the way while
 * React is still booting, which is most of what the first request used to cost
 * on a phone. When the backend is a rotating tunnel there is no address to
 * announce at build time and this is simply absent.
 */
function getApiPreconnectOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    return new URL(configuredUrl).origin;
  } catch {
    return null;
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0EA5E9' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiPreconnectOrigin = getApiPreconnectOrigin();

  return (
    /* lang is the server default here; LocaleScript rewrites it before the
       first paint, from the stored choice or from the system. */
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        {/* React hoists these into <head> on its own. */}
        {apiPreconnectOrigin ? (
          <>
            <link rel="preconnect" href={apiPreconnectOrigin} crossOrigin="use-credentials" />
            <link rel="dns-prefetch" href={apiPreconnectOrigin} />
          </>
        ) : null}
        <LocaleScript />
        <ThemeScript />
        <ServiceWorkerRegistrar />
        <LocaleProvider>
          <SkipLink />
          <ThemeProvider>
            <Navbar />
            <Suspense fallback={<div className="pt-16" />}>
              <AuthGate>
                <div id="main-content" className="pt-16 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
              </AuthGate>
            </Suspense>
            <BottomNav />
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
