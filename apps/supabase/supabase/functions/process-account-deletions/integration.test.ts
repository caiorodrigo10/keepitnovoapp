/**
 * Real local-stack acceptance test.  It intentionally has no database mocks:
 * a prepared synthetic A/B/lojista/duplo fixture is consumed through the real
 * PostgREST, Storage and Auth services.
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { deleteAccountAuth } from '../_shared/account-deletion-auth.ts';
import { purgeClaimedAccountCards } from '../_shared/account-deletion-cards.ts';
import { purgeAccountStorage } from '../_shared/account-deletion-storage.ts';
import { processAccountDeletion } from './handler.ts';
import { AccountDeletionRepository } from './repository.ts';
import type { ClaimedDeletion } from './types.ts';

type IntegrationConfig = {
  url: string; serviceKey: string; anonKey: string; staleAccessToken: string;
  staleRefreshToken: string; requestIds: string[]; protectedOrderIds: string[];
  deletedStorageObjects: Array<{ bucket: string; path: string }>;
};

function localConfig(): IntegrationConfig | null {
  const required = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
    'TASK11_STALE_ACCESS_TOKEN', 'TASK11_STALE_REFRESH_TOKEN',
    'TASK11_REQUEST_IDS', 'TASK11_PROTECTED_ORDER_IDS', 'TASK11_DELETED_STORAGE_OBJECTS',
  ] as const;
  if (process.env.KEEPIT_DISPOSABLE_DB !== '1'
    || process.env.KEEPIT_EXTERNAL_GATEWAY_BLOCKED !== '1'
    || process.env.KEEPIT_TASK11_INTEGRATION !== '1'
    || required.some((key) => !process.env[key])) return null;
  const url = process.env.SUPABASE_URL!;
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(url)
    || /jhhbewnmnorhmsdvfppo|supabase\.co|keepit-dev/i.test(url)) {
    throw new Error('RECUSADO: integração exige gateway local isolado.');
  }
  const requestIds = process.env.TASK11_REQUEST_IDS!.split(',').filter(Boolean);
  const protectedOrderIds = process.env.TASK11_PROTECTED_ORDER_IDS!.split(',').filter(Boolean);
  const deletedStorageObjects = process.env.TASK11_DELETED_STORAGE_OBJECTS!.split(',').map((entry) => {
    const index = entry.indexOf(':');
    return { bucket: entry.slice(0, index), path: entry.slice(index + 1) };
  });
  if (requestIds.length !== 3 || protectedOrderIds.length === 0
    || deletedStorageObjects.some(({ bucket, path }) => !['fachadas', 'produtos'].includes(bucket) || !path || path.includes('..'))) {
    throw new Error('RECUSADO: fixture sintética A/lojista/duplo ou pedidos B ausente.');
  }
  return {
    url, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!, anonKey: process.env.SUPABASE_ANON_KEY!,
    staleAccessToken: process.env.TASK11_STALE_ACCESS_TOKEN!, staleRefreshToken: process.env.TASK11_STALE_REFRESH_TOKEN!,
    requestIds, protectedOrderIds, deletedStorageObjects,
  };
}

const config = localConfig();
const integration = config ? describe : describe.skip;

integration('process-account-deletions local acceptance', () => {
  it('completes client, merchant and dual identities without changing protected money', async () => {
    const service = createClient(config!.url, config!.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const repository = new AccountDeletionRepository(service as never);
    const before = await service.from('pedidos').select('id,total_pago_reais,cliente_id,estabelecimento_id')
      .in('id', config!.protectedOrderIds);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(config!.protectedOrderIds.length);

    const claims = await repository.claim(20);
    const selected = claims.filter((claim) => config!.requestIds.includes(claim.id));
    expect(selected).toHaveLength(3);
    for (const claim of selected) {
      const result = await processAccountDeletion(claim, realDeps(repository, service));
      expect(result).toEqual({ completed: true, retryable: false });
    }

    const completed = await service.from('account_deletion_requests').select('id,status')
      .in('id', config!.requestIds);
    expect(completed.error).toBeNull();
    expect(completed.data?.every((entry) => entry.status === 'completed')).toBe(true);
    const after = await service.from('pedidos').select('id,total_pago_reais,cliente_id,estabelecimento_id')
      .in('id', config!.protectedOrderIds);
    expect(after.error).toBeNull();
    expect(after.data).toEqual(before.data);
    for (const object of config!.deletedStorageObjects) {
      const slash = object.path.lastIndexOf('/');
      const { data, error } = await service.storage.from(object.bucket).list(slash < 0 ? '' : object.path.slice(0, slash), {
        search: slash < 0 ? object.path : object.path.slice(slash + 1),
      });
      expect(error).toBeNull();
      expect((data ?? []).some((entry) => entry.name === (slash < 0 ? object.path : object.path.slice(slash + 1)))).toBe(false);
    }
  });

  it('denies the token issued before claim, its refresh and the deleted Storage paths', async () => {
    const stale = createClient(config!.url, config!.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await stale.auth.setSession({ access_token: config!.staleAccessToken, refresh_token: config!.staleRefreshToken });
    const access = await stale.rpc('conta_tem_acesso');
    expect(access.error ?? access.data).not.toBe(true);
    const refresh = await stale.auth.refreshSession();
    expect(refresh.error).not.toBeNull();
  });
});

function realDeps(repository: AccountDeletionRepository, client: any) {
  return {
    reload: (claim: ClaimedDeletion) => repository.reload(claim),
    renew: (claim: ClaimedDeletion) => repository.renew(claim),
    purgeCards: (claim: ClaimedDeletion) => purgeClaimedAccountCards(claim, client as never),
    applyData: (claim: ClaimedDeletion) => repository.applyData(claim),
    purgeStorage: (claim: ClaimedDeletion) => purgeAccountStorage(claim, {
      next: (current, limit) => repository.listFiles(current, limit),
      ack: (current, ids) => repository.acknowledgeFiles(current, ids),
      renew: (current) => repository.renew(current),
      async remove(bucket, paths) {
        const { error } = await client.storage.from(bucket).remove(paths);
        if (error) throw error;
      },
      async exists(bucket, path) {
        const index = path.lastIndexOf('/');
        const { data, error } = await client.storage.from(bucket).list(index < 0 ? '' : path.slice(0, index), {
          search: index < 0 ? path : path.slice(index + 1),
        });
        if (error) throw error;
        return (data as Array<{ name: string }> | null ?? []).some((entry) => entry.name === (index < 0 ? path : path.slice(index + 1)));
      },
    }),
    async deleteAuth(claim: ClaimedDeletion) {
      await deleteAccountAuth(claim.userId, {
        async remove(userId) { const { error } = await client.auth.admin.deleteUser(userId, false); if (error) throw error; },
        async exists(userId) {
          const { data, error } = await client.auth.admin.getUserById(userId);
          if (error && error.status !== 404) throw error;
          return !!data.user;
        },
      });
    },
    advance: (claim: ClaimedDeletion, phase: 'storage_purged' | 'auth_deleted') => repository.advance(claim, phase),
    complete: (claim: ClaimedDeletion) => repository.complete(claim),
    fail: (claim: ClaimedDeletion, code: Parameters<AccountDeletionRepository['fail']>[1]) => repository.fail(claim, code),
  };
}
