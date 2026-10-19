import type { ClaimedDeletion, DeletionFailureCode, DeletionPhase, DeletionResult } from './types.ts';

export interface ProcessAccountDeletionDeps {
  reload(claim: ClaimedDeletion): Promise<ClaimedDeletion>;
  renew(claim: ClaimedDeletion): Promise<boolean>;
  purgeCards(claim: ClaimedDeletion): Promise<void>;
  applyData(claim: ClaimedDeletion): Promise<void>;
  purgeStorage(claim: ClaimedDeletion): Promise<void>;
  deleteAuth(claim: ClaimedDeletion): Promise<void>;
  advance(claim: ClaimedDeletion, phase: 'storage_purged' | 'auth_deleted'): Promise<void>;
  complete(claim: ClaimedDeletion): Promise<void>;
  fail(claim: ClaimedDeletion, code: DeletionFailureCode): Promise<void>;
}

const failureForPhase: Record<Exclude<DeletionPhase, 'completed'>, DeletionFailureCode> = {
  claimed: 'PURGA_CARTOES_FALHOU',
  cards_purged: 'REDACAO_DADOS_FALHOU',
  data_purged: 'PURGA_STORAGE_FALHOU',
  storage_purged: 'AUTH_EXCLUSAO_FALHOU',
  auth_deleted: 'CONCLUSAO_FALHOU',
};

/** Resumes the persisted deletion state machine; no phase is inferred in memory. */
export async function processAccountDeletion(
  initialClaim: ClaimedDeletion,
  deps: ProcessAccountDeletionDeps,
): Promise<DeletionResult> {
  let claim = initialClaim;
  while (claim.phase !== 'completed') {
    try {
      if (!await deps.renew(claim)) return lostLease();

      switch (claim.phase) {
        case 'claimed':
          await deps.purgeCards(claim);
          claim = await deps.reload(claim);
          break;
        case 'cards_purged':
          await deps.applyData(claim);
          claim = await deps.reload(claim);
          break;
        case 'data_purged':
          await deps.purgeStorage(claim);
          if (!await deps.renew(claim)) return lostLease();
          await deps.advance(claim, 'storage_purged');
          claim = await deps.reload(claim);
          break;
        case 'storage_purged':
          await deps.deleteAuth(claim);
          if (!await deps.renew(claim)) return lostLease();
          await deps.advance(claim, 'auth_deleted');
          claim = await deps.reload(claim);
          break;
        case 'auth_deleted':
          await deps.complete(claim);
          return { completed: true, retryable: false };
      }
    } catch {
      if (claim.phase === 'completed') return { completed: true, retryable: false };
      const code = failureForPhase[claim.phase];
      try {
        await deps.fail(claim, code);
      } catch {
        return { completed: false, retryable: true, code: 'FALHA_REGISTRO_FALHOU' };
      }
      return { completed: false, retryable: true, code };
    }
  }
  return { completed: true, retryable: false };
}

function lostLease(): DeletionResult {
  return { completed: false, retryable: true, code: 'LEASE_PERDIDA' };
}
