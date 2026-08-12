import type { Metadata } from 'next';
import localFont from 'next/font/local';

import { AdminSessionProvider } from '../src/providers/AdminSessionProvider';

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

/**
 * BUILD-001 (@architect Aria, 2026-08-12) — render dinâmico forçado para
 * TODAS as rotas do Admin.
 *
 * `force-dynamic` num layout propaga para todos os segmentos filhos (`/`,
 * `(auth)/*`, `(dashboard)/*`), desligando o static prerender dessas rotas.
 * É necessário porque os hooks do Admin (`useAdminHubs`,
 * `useAdminPendingStores`) chamam `getDataClient()` no corpo do render — em
 * `DATA_SOURCE=supabase` isso instancia os adapters supabase (grafo
 * gotrue/postgrest/realtime) durante o prerender, e o Next.js 16.x
 * (Turbopack E webpack, 16.2.12 e 16.3.0) corrompe as vendored react-ssr
 * hooks nesse cenário (`TypeError: Cannot read properties of null (reading
 * 'useState')`) nas rotas do dashboard.
 *
 * O painel Admin é ferramenta interna auth-gated (`RequireAdminSession`),
 * intrinsecamente dinâmica (depende da sessão do navegador) — NÃO deve ser
 * prerenderizada estaticamente. `force-dynamic` é a estratégia de render
 * correta para este app, não um workaround: não toca a API síncrona
 * compartilhada de `packages/core-data` (consumida pelas 3 apps) nem o modo
 * mock (default), e resolve o prerender das 12 rotas reais do Admin.
 *
 * ⚠️ DÉBITO REMANESCENTE (BUILD-001 parcial): a rota especial
 * `/_global-error` do Next.js 16 NÃO herda segment config e é sempre
 * prerenderizada estaticamente. O grafo supabase, avaliado no worker de
 * static-generation ao coletar os módulos das rotas do dashboard, corrompe o
 * singleton react-ssr do processo, quebrando o prerender do `/_global-error`
 * com `useContext` null (bug de framework upstream sem workaround —
 * vercel/next.js #84994 / #85668 / #86178, reproduzido em 16.2.12 e 16.3.0).
 * A única correção de código é remover o grafo supabase do módulo estático
 * (dynamic import dos adapters em `packages/core-data`, tornando
 * `getDataClient()` async) — mudança BREAKING nas 3 apps, fora do escopo
 * desta rodada (requer checkpoint). Ver `docs/qa/gates/3.7-*.yaml` (BUILD-001).
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={hanken.variable}>
      <body className="bg-bg-primary font-sans antialiased">
        <AdminSessionProvider>{children}</AdminSessionProvider>
      </body>
    </html>
  );
}
