export type DeletionPhase = 'claimed' | 'cards_purged' | 'data_purged'
  | 'storage_purged' | 'auth_deleted' | 'completed';

export type ClaimedDeletion = {
  id: string; userId: string; policyVersion: string;
  leaseToken: string; generation: number; phase: DeletionPhase;
  hasCliente: boolean; hasLojista: boolean;
};

export type DeletionResult = { completed: boolean; retryable: boolean; code?: string };

export type DeletionFailureCode =
  | 'PURGA_CARTOES_FALHOU'
  | 'REDACAO_DADOS_FALHOU'
  | 'PURGA_STORAGE_FALHOU'
  | 'AUTH_EXCLUSAO_FALHOU'
  | 'CONCLUSAO_FALHOU'
  | 'FALHA_REGISTRO_FALHOU';

export type DeletionWorkerCounts = { claimed: number; completed: number; pending: number; expired: number };
export type RetentionExpiryCounts = { expired: number; pending: number };
export type DeletionWorkerService = { run(limit: number): Promise<DeletionWorkerCounts> };
