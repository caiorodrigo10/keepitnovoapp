import { redirect } from 'next/navigation';

/**
 * Raiz do Admin — Épico 0, Story 0.3 (AC5) + Story 10.1 (Task 4).
 *
 * A sessão agora é client-side (`sessionStorage`, mock local do Admin —
 * `adminAuth.ts`), então esta rota (Server Component) não pode mais checar
 * autenticação diretamente. Redireciona sempre para `/login`, que por sua
 * vez encaminha quem já tem sessão para `/aprovacoes` (ver
 * `(auth)/login/page.tsx`). Substitui o guard stub sempre-true
 * (`src/config/authGuard.ts`, removido nesta story).
 */
export default function RootPage() {
  redirect('/login');
}
