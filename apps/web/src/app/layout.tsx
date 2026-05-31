import type { Metadata } from 'next';
import { Baloo_2 } from 'next/font/google';

import './globals.css';
import { Navbar } from '@/components/navbar';

const baloo = Baloo_2({
  subsets: ['latin'],
  variable: '--font-baloo',
});

export const metadata: Metadata = {
  title: 'Language Kids Tutor',
  description: 'Um tutor de idiomas seguro, leve e acolhedor.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={baloo.variable}>
        <Navbar />
        <div className="pt-16">{children}</div>
      </body>
    </html>
  );
}
