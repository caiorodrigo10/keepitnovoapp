import type { CartOrderState, CartTransition } from './cartRules';
import type { CartStorageWriteResult } from './cartStorage';

export type CartMutationResult =
  | { status: 'confirmation_required'; reason: 'hub_switch' | 'store_switch' }
  | { status: 'blocked'; reason: 'hub_unavailable' }
  | { status: 'unchanged'; state: CartOrderState }
  | { status: 'committed'; state: CartOrderState }
  | { status: 'persistence_error'; state: CartOrderState };

type PersistCartState = (state: CartOrderState) => Promise<CartStorageWriteResult>;

export async function executeCartTransition(
  current: CartOrderState,
  transition: CartTransition,
  persist: PersistCartState,
): Promise<CartMutationResult> {
  if (transition.kind === 'confirmation_required') {
    return { status: 'confirmation_required', reason: transition.reason };
  }

  if (transition.kind === 'blocked') {
    return { status: 'blocked', reason: transition.reason };
  }

  if (transition.kind === 'unchanged') {
    return { status: 'unchanged', state: current };
  }

  const writeResult = await persist(transition.next);
  return writeResult.status === 'saved'
    ? { status: 'committed', state: transition.next }
    : { status: 'persistence_error', state: current };
}
