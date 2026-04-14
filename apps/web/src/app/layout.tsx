import type { Metadata } from 'next';
import { Baloo_2 } from 'next/font/google';

import './globals.css';

const baloo = Baloo_2({
  subsets: ['latin'],
  variable: '--font-baloo',
});

export const metadata: Metadata = {
  title: 'Tutor de Inglês Infantil',
  description: 'Um tutor de inglês infantil seguro, divertido e acolhedor.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={baloo.variable}>{children}</body>
    </html>
  );
}
