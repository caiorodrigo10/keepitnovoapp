import type { ClaimedDeletion, DeletionFailureCode, RetentionExpiryCounts } from './types.ts';
import type { DeletionFile } from '../_shared/account-deletion-storage.ts';

export type AccountDeletionRpc = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

/** Service-role adapter for the fenced manifest/checkpoint RPCs. */
export class AccountDeletionRepository {
  constructor(private readonly client: AccountDeletionRpc) {}

  async expireRetention(limit: number): Promise<RetentionExpiryCounts> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('LIMITE_INVALIDO');
    const { data, error } = await this.client.rpc('expire_account_deletion_retention', { p_limit: limit });
    if (error) throw error;
    if (!isRetentionExpiryCounts(data)) throw new Error('CONTAGENS_RETENCAO_INVALIDAS');
    return data;
  }

  async listFiles(claim: ClaimedDeletion, limit = 100): Promise<DeletionFile[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('LIMITE_INVALIDO');
    const { data, error } = await this.client.rpc('list_account_deletion_files', claimArgs(claim, { p_limit: limit }));
    if (error) throw error;
    if (!Array.isArray(data) || !data.every((entry) => isDeletionFile(entry, claim.userId))) {
      throw new Error('MANIFESTO_STORAGE_INVALIDO');
    }
    return data;
  }

  async acknowledgeFiles(claim: ClaimedDeletion, ids: string[]): Promise<void> {
    if (ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      throw new Error('MANIFESTO_STORAGE_INVALIDO');
    }
    const { error } = await this.client.rpc('ack_account_deletion_files', claimArgs(claim, { p_file_ids: ids }));
    if (error) throw error;
  }

  async advance(claim: ClaimedDeletion, phase: 'storage_purged' | 'auth_deleted'): Promise<void> {
    const { error } = await this.client.rpc('advance_account_deletion', claimArgs(claim, { p_phase: phase }));
    if (error) throw error;
  }

  async renew(claim: ClaimedDeletion): Promise<boolean> {
    const { data, error } = await this.client.rpc('renew_account_deletion', claimArgs(claim));
    if (error) throw error;
    if (typeof data !== 'boolean') throw new Error('RESPOSTA_LEASE_INVALIDA');
    return data;
  }

  async claim(limit: number): Promise<ClaimedDeletion[]> {
    const { data, error } = await this.client.rpc('claim_account_deletions', { p_limit: limit });
    if (error) throw error;
    if (!Array.isArray(data) || !data.every(isClaimedDeletion)) throw new Error('CLAIM_EXCLUSAO_INVALIDO');
    return data;
  }

  async reload(claim: ClaimedDeletion): Promise<ClaimedDeletion> {
    const { data, error } = await this.client.rpc('reload_account_deletion', claimArgs(claim));
    if (error) throw error;
    if (!isClaimedDeletion(data) || data.id !== claim.id || data.leaseToken !== claim.leaseToken || data.generation !== claim.generation) {
      throw new Error('CLAIM_EXCLUSAO_INVALIDO');
    }
    return data;
  }

  async applyData(claim: ClaimedDeletion): Promise<void> {
    const { data, error } = await this.client.rpc('apply_account_deletion_data', claimArgs(claim));
    if (error || !isPurgeProof(data, 'data_purged')) throw error ?? new Error('REDACAO_DADOS_INCOMPLETA');
  }

  async complete(claim: ClaimedDeletion): Promise<void> {
    const { data, error } = await this.client.rpc('complete_account_deletion', claimArgs(claim));
    if (error || !data || typeof data !== 'object' || (data as Record<string, unknown>).completed !== true) {
      throw error ?? new Error('CONCLUSAO_INCOMPLETA');
    }
  }

  async fail(claim: ClaimedDeletion, code: DeletionFailureCode): Promise<void> {
    const { error } = await this.client.rpc('fail_account_deletion', claimArgs(claim, { p_code: code }));
    if (error) throw error;
  }
}

function claimArgs(claim: ClaimedDeletion, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { p_request_id: claim.id, p_lease_token: claim.leaseToken, p_generation: claim.generation, ...extra };
}

function isDeletionFile(value: unknown, userId: string): value is DeletionFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && entry.id.length > 0
    && (entry.bucket === 'fachadas' || entry.bucket === 'produtos')
    && typeof entry.path === 'string' && entry.path.startsWith(`${userId}/`)
    && !entry.path.includes('..');
}

function isPurgeProof(value: unknown, phase: string): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (value as Record<string, unknown>).purged === true
    && (value as Record<string, unknown>).phase === phase;
}

function isRetentionExpiryCounts(value: unknown): value is RetentionExpiryCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const counts = value as Record<string, unknown>;
  return ['expired', 'pending'].every((key) =>
    typeof counts[key] === 'number' && Number.isInteger(counts[key]) && counts[key] >= 0);
}

function isClaimedDeletion(value: unknown): value is ClaimedDeletion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const claim = value as Record<string, unknown>;
  return typeof claim.id === 'string' && typeof claim.userId === 'string'
    && typeof claim.policyVersion === 'string' && typeof claim.leaseToken === 'string'
    && typeof claim.generation === 'number' && Number.isInteger(claim.generation)
    && ['claimed', 'cards_purged', 'data_purged', 'storage_purged', 'auth_deleted', 'completed'].includes(String(claim.phase))
    && typeof claim.hasCliente === 'boolean' && typeof claim.hasLojista === 'boolean';
}
