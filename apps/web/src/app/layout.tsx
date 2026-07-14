import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

import './globals.css';
import { AuthGate } from '@/components/auth-gate';
import { Navbar } from '@/components/navbar';
import { BottomNav } from '@/components/bottom-nav';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeScript } from '@/components/theme-script';

export const metadata: Metadata = {
  title: 'Tutor and Professor',
  description: 'Tutor and Professor: aulas, revisoes e estudos guiados em um app seguro e acolhedor.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ThemeProvider>
          <Navbar />
          <Suspense fallback={<div className="pt-16" />}>
            <AuthGate>
              <div className="pt-16 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
            </AuthGate>
          </Suspense>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
