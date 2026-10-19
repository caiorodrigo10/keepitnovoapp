import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';

import type { Pedido } from '@keepit/core-data';

import { usePedidoDetail } from './usePedidoDetail';

const state = vi.hoisted(() => ({
  getById: vi.fn(),
  list: [] as Pedido[],
  refresh: vi.fn(),
}));

vi.mock('@keepit/core-data', () => ({
  getDataClient: () => ({ order: { getById: state.getById } }),
}));
vi.mock('@keepit/core-data/hooks', async () => {
  const ReactModule = await import('react');
  return {
    useAsyncResource: <T,>(fetcher: () => Promise<T>, initialValue: T, deps: ReadonlyArray<unknown>) => {
      const [resource, setResource] = ReactModule.useState({ data: initialValue, loading: true, error: null as Error | null });
      ReactModule.useEffect(() => {
        let cancelled = false;
        setResource((previous) => ({ ...previous, loading: true, error: null }));
        fetcher().then(
          (data) => { if (!cancelled) setResource({ data, loading: false, error: null }); },
          (error: unknown) => {
            if (!cancelled) setResource((previous) => ({
              ...previous, loading: false, error: error instanceof Error ? error : new Error(String(error)),
            }));
          },
        );
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps);
      return resource;
    },
  };
});
vi.mock('./usePedidosMine', () => ({
  usePedidosMine: () => ({ data: state.list, loading: false, error: null, refresh: state.refresh }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
let result: ReturnType<typeof usePedidoDetail>;

function pedido(id: string, status: Pedido['status']): Pedido {
  return { id, status } as Pedido;
}

function Harness({ pedidoId }: { pedidoId: string }) {
  result = usePedidoDetail('cliente-1', pedidoId);
  return null;
}

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  state.list = [];
  vi.clearAllMocks();
});

it('não devolve o detalhe do ID anterior enquanto o novo ID carrega ou falha', async () => {
  let rejectB!: (error: Error) => void;
  state.getById.mockImplementation((id: string) => {
    if (id === 'pedido-a') return Promise.resolve(pedido(id, 'aceito'));
    return new Promise<Pedido | null>((_resolve, reject) => { rejectB = reject; });
  });

  await act(async () => { renderer = create(React.createElement(Harness, { pedidoId: 'pedido-a' })); });
  expect(result.data?.id).toBe('pedido-a');

  state.list = [pedido('pedido-b', 'aguardando_aceite')];
  await act(async () => { renderer!.update(React.createElement(Harness, { pedidoId: 'pedido-b' })); });
  expect(result.data).toBeNull();
  expect(result.loading).toBe(true);

  await act(async () => { rejectB(new Error('falha-b')); });
  expect(result.data).toBeNull();
  expect(result.error?.message).toBe('falha-b');
});

it('prefere o detalhe recém-lido à versão mais velha presente na lista', async () => {
  state.list = [pedido('pedido-a', 'aguardando_aceite')];
  state.getById.mockResolvedValue(pedido('pedido-a', 'aceito'));

  await act(async () => { renderer = create(React.createElement(Harness, { pedidoId: 'pedido-a' })); });

  expect(result.data).toMatchObject({ id: 'pedido-a', status: 'aceito' });
});
