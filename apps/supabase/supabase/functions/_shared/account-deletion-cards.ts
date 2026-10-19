import type { ClaimedDeletion } from '../process-account-deletions/types.ts';

export interface AccountDeletionCardsRpc {
  rpc(name: 'purgar_cartoes_conta', args: { p_user_id: string; p_solicitacao_id: string }): Promise<{
    data: unknown;
    error: unknown;
  }>;
  rpc(name: 'purge_account_deletion_cards', args: {
    p_request_id: string;
    p_lease_token: string;
    p_generation: number;
  }): Promise<{
    data: unknown;
    error: unknown;
  }>;
}

function assertPurgeProof(data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data) || (data as Record<string, unknown>).purged !== true) {
    throw new Error('PURGA_CARTOES_INCOMPLETA');
  }
}

/** Calls the transactional DB purge; its response is deliberately token-free. */
export async function purgeAccountCards(
  input: { userId: string; solicitacaoId: string },
  deps: AccountDeletionCardsRpc,
): Promise<void> {
  const { data, error } = await deps.rpc('purgar_cartoes_conta', {
    p_user_id: input.userId,
    p_solicitacao_id: input.solicitacaoId,
  });
  if (error) throw error;
  assertPurgeProof(data);
}

/**
 * Uses the current claimant fence. The database records cards_purged in the
 * same transaction as its absence proof, so a stale worker cannot advance it.
 */
export async function purgeClaimedAccountCards(
  claim: ClaimedDeletion,
  client: AccountDeletionCardsRpc,
): Promise<void> {
  const { data, error } = await client.rpc('purge_account_deletion_cards', {
    p_request_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_generation: claim.generation,
  });
  if (error) throw error;
  assertPurgeProof(data);
}
