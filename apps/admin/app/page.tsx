import { redirect } from 'next/navigation';

import { isAuthenticated } from '../src/config/authGuard';

/**
 * Raiz do Admin — Épico 0, Story 0.3 (AC5).
 *
 * Redireciona para `/aprovacoes` (guard autenticado) ou `/login` (guard
 * desautenticado), conforme o guard stub `isAuthenticated()`. Substitui a
 * Home mínima estática da Story 0.1 (visual preservado nas telas de
 * destino, não aqui).
 */
export default function RootPage() {
  if (isAuthenticated()) {
    redirect('/aprovacoes');
  }

  redirect('/login');
}
