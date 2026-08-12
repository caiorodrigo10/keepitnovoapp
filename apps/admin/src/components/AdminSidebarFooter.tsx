'use client';

import { useRouter } from 'next/navigation';

import { useAdminSession } from '../providers/AdminSessionProvider';
import { Button } from './Button';

/**
 * Rodapé da sidebar do `(dashboard)` — Story 10.1 (AC6, Task 5).
 *
 * Mostra nome/e-mail do admin logado e botão "Sair" (`signOut()` + volta
 * para `/login`). Client boundary isolado — `(dashboard)/layout.tsx`
 * continua Server Component.
 */
export function AdminSidebarFooter() {
  const { admin, signOut } = useAdminSession();
  const router = useRouter();

  if (!admin) {
    return null;
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border-default pt-4">
      <div className="text-sm">
        <p className="font-semibold text-text-primary">{admin.nome}</p>
        <p className="text-xs text-text-secondary">{admin.email}</p>
      </div>
      <Button variant="secondary" onClick={handleSignOut}>
        Sair
      </Button>
    </div>
  );
}
