import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated } from './src/config/authGuard';

/**
 * Proxy (ex-"middleware", Next.js 16) — STUB TEMPORÁRIO (Épico 0, Story
 * 0.3, AC5).
 *
 * Redireciona qualquer rota de `(dashboard)` para `/login` quando o guard
 * stub `isAuthenticated()` retorna `false` (só acontece quando
 * `AUTH_GUARD_ENABLED` é ligado manualmente em `src/config/authGuard.ts`).
 * Por padrão (`AUTH_GUARD_ENABLED = false`), este proxy nunca redireciona —
 * não bloqueia nenhuma rota por engano.
 */
const DASHBOARD_SECTIONS = [
  '/aprovacoes',
  '/hubs',
  '/reembolsos',
  '/pedidos',
  '/clientes',
  '/lojistas',
  '/financeiro',
  '/qualidade-lojista',
];

export function proxy(request: NextRequest) {
  const isDashboardRoute = DASHBOARD_SECTIONS.some((section) => request.nextUrl.pathname.startsWith(section));

  if (isDashboardRoute && !isAuthenticated()) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/aprovacoes/:path*',
    '/hubs/:path*',
    '/reembolsos/:path*',
    '/pedidos/:path*',
    '/clientes/:path*',
    '/lojistas/:path*',
    '/financeiro/:path*',
    '/qualidade-lojista/:path*',
  ],
};
