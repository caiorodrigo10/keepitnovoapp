import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Proxy (ex-"middleware", Next.js 16) — Épico 0, Story 0.3 (AC5) + Story
 * 10.1 (Task 6).
 *
 * O guard stub `src/config/authGuard.ts` foi removido nesta story: a sessão
 * do Admin agora vive em `sessionStorage` (mock local, `adminAuth.ts`), que
 * não é acessível no Edge Runtime deste proxy (nem em nenhum middleware/SSR
 * — decisão registrada nos Dev Notes da Story 10.1: "backend simples", sem
 * cookies/edge auth). O gating efetivo acontece no client, via
 * `RequireAdminSession` em `(dashboard)/layout.tsx`. Este proxy segue
 * registrado (não bloqueia nada) para não deixar `config.matcher` órfão e
 * para eventual uso futuro (ex.: headers, analytics) sem reintroduzir auth
 * server-side fora de escopo.
 */
export function proxy(_request: NextRequest) {
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
