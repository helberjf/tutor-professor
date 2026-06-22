import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Navbar } from '@/components/navbar';
import { BottomNav } from '@/components/bottom-nav';

export const metadata: Metadata = {
  title: 'Language&Tutor',
  description: 'Um tutor de idiomas seguro, leve e acolhedor.',
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
    <html lang="pt-BR">
      <body>
        <Navbar />
        <div className="pt-16 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
