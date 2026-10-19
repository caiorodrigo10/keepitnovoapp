import type { Hub } from '@keepit/core-data';
import type { AsyncResourceState } from '@keepit/core-data/hooks';

import type { SelectOption } from '../../components/SelectField';

export type HubSelectState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error' }
  | { kind: 'ready'; options: SelectOption[] };

export function getHubSelectState({ data, loading, error }: AsyncResourceState<Hub[]>): HubSelectState {
  if (loading) return { kind: 'loading' };
  if (error) return { kind: 'error' };
  if (data.length === 0) return { kind: 'empty' };
  return {
    kind: 'ready',
    options: data.map((hub) => ({ value: hub.id, label: hub.nome })),
  };
}
