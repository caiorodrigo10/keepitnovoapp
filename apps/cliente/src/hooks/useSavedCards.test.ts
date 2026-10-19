import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';

import { useSavedCards } from './useSavedCards';

const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock('../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));

const savedCards = vi.hoisted(() => ({
  listar: vi.fn(),
  definirPrincipal: vi.fn(),
  remover: vi.fn(),
}));

vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
}));
vi.mock('@keepit/core-data', () => ({
  createSupportOperationId: vi.fn(() => 'operation-stable'),
  getDataClient: () => ({ savedCards }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
let result: ReturnType<typeof useSavedCards>;

function Harness({ clienteId }: { clienteId: string | null }) {
  result = useSavedCards(clienteId);
  return null;
}

async function mount(clienteId = 'cliente-1') {
  await act(async () => { renderer = create(React.createElement(Harness, { clienteId })); });
}

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  flags.enabled = true;
  vi.clearAllMocks();
});

it('usa a lista devolvida pelo servidor ao definir o principal e mantém a operação no replay', async () => {
  savedCards.listar.mockResolvedValue([
    { id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true },
    { id: 'card-2', bandeira: 'Mastercard', ultimo4: '2222', principal: false },
  ]);
  savedCards.definirPrincipal
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce([
      { id: 'card-2', bandeira: 'Mastercard', ultimo4: '2222', principal: true },
      { id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: false },
    ]);

  await mount();
  await act(async () => { await result.definirPrincipal('card-2'); });
  expect(result.cards[0]).toMatchObject({ id: 'card-1', principal: true });
  await act(async () => { await result.definirPrincipal('card-2'); });
  expect(savedCards.definirPrincipal).toHaveBeenNthCalledWith(1, { cartaoId: 'card-2', operacaoId: 'operation-stable' });
  expect(savedCards.definirPrincipal).toHaveBeenNthCalledWith(2, { cartaoId: 'card-2', operacaoId: 'operation-stable' });
  expect(result.cards[0]).toMatchObject({ id: 'card-2', principal: true });
});

it('desligado não consulta nem muta cartões', async () => {
  flags.enabled = false;
  await mount();
  await act(async () => {
    await result.refresh();
    await result.definirPrincipal('card-1');
    await result.remover('card-1');
  });
  expect(result).toMatchObject({ cards: [], loading: false, error: null });
  expect(savedCards.listar).not.toHaveBeenCalled();
  expect(savedCards.definirPrincipal).not.toHaveBeenCalled();
  expect(savedCards.remover).not.toHaveBeenCalled();
});

it('não remove o cartão localmente antes da confirmação e promove somente a lista devolvida', async () => {
  savedCards.listar.mockResolvedValue([
    { id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true },
    { id: 'card-2', bandeira: 'Mastercard', ultimo4: '2222', principal: false },
  ]);
  savedCards.remover
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce([{ id: 'card-2', bandeira: 'Mastercard', ultimo4: '2222', principal: true }])
    .mockResolvedValueOnce([]);

  await mount();
  await act(async () => { await result.remover('card-1'); });
  expect(result.cards).toHaveLength(2);
  expect(result.error).toBe('Não foi possível atualizar seus cartões. Tente novamente.');
  await act(async () => { await result.remover('card-1'); });
  expect(result.cards).toEqual([{ id: 'card-2', bandeira: 'Mastercard', ultimo4: '2222', principal: true }]);
  await act(async () => { await result.remover('card-2'); });
  expect(result.cards).toEqual([]);
});

it('limpa a lista e ignora resposta de sessão anterior após logout durante listagem', async () => {
  let resolve!: (cards: Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>) => void;
  savedCards.listar.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));

  await mount();
  await act(async () => { renderer!.update(React.createElement(Harness, { clienteId: null })); });
  await act(async () => { resolve([{ id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true }]); });
  expect(result.cards).toEqual([]);
  expect(result.loading).toBe(false);
});

it('não mantém cartões da identidade anterior quando a nova listagem falha', async () => {
  savedCards.listar
    .mockResolvedValueOnce([{ id: 'card-a', bandeira: 'Visa', ultimo4: '1111', principal: true }])
    .mockRejectedValueOnce(new Error('network'));
  await mount('cliente-a');
  await act(async () => { renderer!.update(React.createElement(Harness, { clienteId: 'cliente-b' })); });
  expect(result.cards).toEqual([]);
  expect(result.error).toBe('Não foi possível atualizar seus cartões. Tente novamente.');
});

it('ignora uma listagem anterior que chega depois da remoção confirmada', async () => {
  let resolve!: (cards: Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>) => void;
  savedCards.listar
    .mockResolvedValueOnce([{ id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true }])
    .mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  savedCards.remover.mockResolvedValue([]);
  await mount();
  await act(async () => { void result.refresh(); });
  await act(async () => { await result.remover('card-1'); });
  await act(async () => { resolve([{ id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true }]); });
  expect(result.cards).toEqual([]);
});

it('faz a remoção confirmada prevalecer sobre atualização iniciada durante a mutação', async () => {
  let resolveRemoval!: (cards: Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>) => void;
  savedCards.listar
    .mockResolvedValueOnce([{ id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true }])
    .mockResolvedValueOnce([{ id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true }]);
  savedCards.remover.mockImplementationOnce(() => new Promise((done) => { resolveRemoval = done; }));
  await mount();
  await act(async () => { void result.remover('card-1'); await Promise.resolve(); });
  await act(async () => { await result.refresh(); });
  await act(async () => { resolveRemoval([]); });
  expect(result.cards).toEqual([]);
  expect(result.loading).toBe(false);
});

it('descarta atualização iniciada durante a remoção quando ela responde depois da confirmação', async () => {
  let resolveRemoval!: (cards: Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>) => void;
  let resolveRefresh!: (cards: Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>) => void;
  savedCards.listar
    .mockResolvedValueOnce([{ id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true }])
    .mockImplementationOnce(() => new Promise((done) => { resolveRefresh = done; }));
  savedCards.remover.mockImplementationOnce(() => new Promise((done) => { resolveRemoval = done; }));
  await mount();
  await act(async () => { void result.remover('card-1'); await Promise.resolve(); });
  await act(async () => { void result.refresh(); await Promise.resolve(); });
  await act(async () => { resolveRemoval([]); });
  await act(async () => { resolveRefresh([{ id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true }]); });
  expect(result.cards).toEqual([]);
});
