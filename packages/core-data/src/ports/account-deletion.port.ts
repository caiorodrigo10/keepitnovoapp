export type AccountDeletionStatus =
  | 'scheduled'
  | 'cancelled'
  | 'processing'
  | 'completed'
  | 'failed';

export interface AccountDeletionRecord {
  status: AccountDeletionStatus;
  requestedAt: string;
  deleteAt: string;
}

export interface AccountDeletionPort {
  status(): Promise<AccountDeletionRecord | null>;
  schedule(currentPassword: string): Promise<AccountDeletionRecord>;
  cancel(): Promise<AccountDeletionRecord | null>;
}
