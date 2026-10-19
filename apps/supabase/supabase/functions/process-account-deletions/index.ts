/// <reference path="../_shared/deno-globals.d.ts" />

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { deleteAccountAuth } from '../_shared/account-deletion-auth.ts';
import { purgeClaimedAccountCards } from '../_shared/account-deletion-cards.ts';
import { purgeAccountStorage } from '../_shared/account-deletion-storage.ts';
import { processAccountDeletion } from './handler.ts';
import { handleDeletionWorker } from './http.ts';
import { AccountDeletionRepository } from './repository.ts';
import type { DeletionWorkerCounts } from './types.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const auth = { persistSession: false, autoRefreshToken: false };

Deno.serve((request) => handleDeletionWorker(request, {
  enabled: Deno.env.get('ACCOUNT_DELETION_ENABLED') === 'true',
  authorized: (candidate) => secretMatches(
    candidate.headers.get('x-account-deletion-worker-secret') ?? '',
    Deno.env.get('ACCOUNT_DELETION_WORKER_SECRET') ?? '',
  ),
  createService: () => createService(),
}));

function createService() {
  const client = createClient<Database>(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth });
  return createServiceForClient(client);
}

export function createServiceForClient(client: ReturnType<typeof createClient<Database>>) {
  const repository = new AccountDeletionRepository(client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> });
  return {
    async run(limit: number): Promise<DeletionWorkerCounts> {
      const retention = await repository.expireRetention(limit);
      const claims = await repository.claim(limit);
      let completed = 0;
      for (const claim of claims) {
        const outcome = await processAccountDeletion(claim, {
          reload: (value) => repository.reload(value),
          renew: (value) => repository.renew(value),
          purgeCards: (value) => purgeClaimedAccountCards(value, client as never),
          applyData: (value) => repository.applyData(value),
          purgeStorage: (value) => purgeAccountStorage(value, {
            next: (current, page) => repository.listFiles(current, page),
            ack: (current, ids) => repository.acknowledgeFiles(current, ids),
            renew: (current) => repository.renew(current),
            async remove(bucket, paths) {
              const { error } = await client.storage.from(bucket).remove(paths);
              if (error) throw error;
            },
            async exists(bucket, path) {
              const slash = path.lastIndexOf('/');
              const { data, error } = await client.storage.from(bucket).list(slash < 0 ? '' : path.slice(0, slash), { search: slash < 0 ? path : path.slice(slash + 1) });
              if (error) throw error;
              return data.some((entry) => entry.name === (slash < 0 ? path : path.slice(slash + 1)));
            },
          }),
          async deleteAuth(value) {
            await deleteAccountAuth(value.userId, {
              async remove(userId) { const { error } = await client.auth.admin.deleteUser(userId); if (error) throw error; },
              async exists(userId) {
                const { data, error } = await client.auth.admin.getUserById(userId);
                if (error && error.status !== 404) throw error;
                return !!data.user;
              },
            });
          },
          advance: (value, phase) => repository.advance(value, phase),
          complete: (value) => repository.complete(value),
          fail: (value, code) => repository.fail(value, code),
        });
        if (outcome.completed) completed += 1;
      }
      return {
        claimed: claims.length,
        completed,
        pending: retention.pending + claims.length - completed,
        expired: retention.expired,
      };
    },
  };
}

async function secretMatches(received: string, configured: string): Promise<boolean> {
  if (!configured) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([received, configured].map(async (value) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
  ));
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}
