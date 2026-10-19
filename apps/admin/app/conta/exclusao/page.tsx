import type { Metadata } from 'next';

import { AccountDeletionPublicFlow } from '../../../src/components/AccountDeletionPublicFlow';

export const metadata: Metadata = {
  title: 'Exclusão de conta | Keepit',
  description: 'Consulte, agende ou recupere uma solicitação de exclusão da sua conta Keepit.',
};

export default function AccountDeletionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-shell px-5 py-10 sm:p-10">
      <AccountDeletionPublicFlow />
    </main>
  );
}
