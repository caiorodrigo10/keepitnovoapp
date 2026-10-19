export type AccountDeletionAuthDeps = {
  remove(userId: string): Promise<void>;
  exists(userId: string): Promise<boolean>;
};

/** Deletes an Auth identity only when an administrative read proves absence. */
export async function deleteAccountAuth(
  userId: string,
  deps: AccountDeletionAuthDeps,
): Promise<void> {
  try {
    await deps.remove(userId);
  } catch {
    // A lost/failed response is not proof. The read below is authoritative.
  }
  if (await deps.exists(userId)) throw new Error('AUTH_EXCLUSAO_NAO_CONFIRMADA');
}
