'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAdminSession } from '../providers/AdminSessionProvider';

/**
 * Guard client do `(dashboard)` — Story 10.1 (AC4, Task 4).
 *
 * A sessão é client-side (`sessionStorage`), então o gating não pode ser
 * feito em Server Component (`(dashboard)/layout.tsx` continua Server
 * Component — só este wrapper é client). Enquanto `loading`, mostra um
 * placeholder curto; sem sessão restaurada, redireciona para `/login` e não
 * renderiza os filhos.
 */
export function RequireAdminSession({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !admin) {
      router.replace('/login');
    }
  }, [loading, admin, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-bg-primary text-sm text-text-secondary">Carregando…</div>;
  }

  if (!admin) {
    return null;
  }

  return <>{children}</>;
}
