import type { Metadata } from 'next';
import localFont from 'next/font/local';

import './globals.css';

/**
 * Fontes Hanken Grotesk locais (Story 1.3 + Story 0.1), servidas via
 * `next/font/local` — sem CDN externo, conforme decisão registrada no
 * comentário de `packages/ui-tokens/src/tailwind.js`.
 */
const hanken = localFont({
  src: [
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-Bold.woff2', weight: '700', style: 'normal' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-hanken',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Keepit Admin',
  description: 'Painel administrativo interno da Keepit',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={hanken.variable}>
      <body className="bg-bg-primary font-sans antialiased">{children}</body>
    </html>
  );
}
