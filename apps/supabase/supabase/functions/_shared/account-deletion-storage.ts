import type { ClaimedDeletion } from '../process-account-deletions/types.ts';

export type DeletionFile = { id: string; bucket: string; path: string };

export type AccountDeletionStorageDeps = {
  next(claim: ClaimedDeletion, limit: number): Promise<DeletionFile[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  exists(bucket: string, path: string): Promise<boolean>;
  ack(claim: ClaimedDeletion, ids: string[]): Promise<void>;
  renew(claim: ClaimedDeletion): Promise<boolean>;
};

/** Removes only paths supplied by the validated private manifest. */
export async function purgeAccountStorage(
  claim: ClaimedDeletion,
  deps: AccountDeletionStorageDeps,
): Promise<void> {
  while (true) {
    const files = await deps.next(claim, 100);
    if (files.length === 0) return;
    for (const [bucket, entries] of Object.entries(groupByBucket(files))) {
      if (!await deps.renew(claim)) throw new Error('LEASE_PERDIDA');
      await deps.remove(bucket, entries.map((entry) => entry.path));
    }
    for (const entry of files) {
      if (await deps.exists(entry.bucket, entry.path)) {
        throw new Error('STORAGE_EXCLUSAO_NAO_CONFIRMADA');
      }
    }
    await deps.ack(claim, files.map((entry) => entry.id));
  }
}

function groupByBucket(files: DeletionFile[]): Record<string, DeletionFile[]> {
  return files.reduce<Record<string, DeletionFile[]>>((groups, entry) => {
    (groups[entry.bucket] ??= []).push(entry);
    return groups;
  }, {});
}
