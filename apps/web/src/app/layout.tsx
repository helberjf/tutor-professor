import type { Metadata } from 'next';
import { Baloo_2 } from 'next/font/google';

import './globals.css';

const baloo = Baloo_2({
  subsets: ['latin'],
  variable: '--font-baloo',
});

export const metadata: Metadata = {
  title: 'English Kids Tutor',
  description: 'A playful and safe English tutor for children.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={baloo.variable}>{children}</body>
    </html>
  );
}
