import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

import './globals.css';
import { AuthGate } from '@/components/auth-gate';
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar';
import { Navbar } from '@/components/navbar';
import { BottomNav } from '@/components/bottom-nav';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeScript } from '@/components/theme-script';

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
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <a href="#main-content" className="skip-link">
          Pular para o conteúdo
        </a>
        <ThemeScript />
        <ServiceWorkerRegistrar />
        <ThemeProvider>
          <Navbar />
          <Suspense fallback={<div className="pt-16" />}>
            <AuthGate>
              <div id="main-content" className="pt-16 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
            </AuthGate>
          </Suspense>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
