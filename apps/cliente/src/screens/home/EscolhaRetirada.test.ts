import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';

import EscolhaRetirada from './EscolhaRetirada';

const state = vi.hoisted(() => ({
  cart: {
    hubId: 'hub-selecionado',
    selectHub: vi.fn(async () => ({
      status: 'unchanged' as const,
      state: { estabelecimentoId: null, hubId: 'hub-selecionado', items: [], payment: null },
    })),
  },
}));

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (value: unknown) => value },
  View: 'View',
}));
vi.mock('@keepit/ui-tokens', async () => {
  const { default: tokens } = await import('../../../../../packages/ui-tokens/src/tokens.json');
  return { spacing: tokens.spacing };
});
vi.mock('../../components/checkout', () => ({ SelectableRow: 'SelectableRow' }));
vi.mock('../../components/discovery', () => ({ AsyncStateBlock: 'AsyncStateBlock' }));
vi.mock('../../components/discovery/FavoriteButton', () => ({ FavoriteButton: 'FavoriteButton' }));
vi.mock('../../components/ui', () => ({ AppHeader: 'AppHeader', Button: 'Button', FormScreen: 'FormScreen', TextField: 'TextField' }));
vi.mock('../../context/CartContext', () => ({ useCart: () => state.cart }));
vi.mock('../../context/QaScenarioContext', () => ({ useQaSimulation: () => undefined }));
vi.mock('../../hooks/useHubsList', () => ({
  useHubsList: () => ({
    data: [
      {
        id: 'hub-selecionado', ativo: true, nome: 'Hub Selecionado', endereco: 'Rua A', lat: -23.5, lng: -46.6, horarios: [],
      },
      {
        id: 'hub-outro', ativo: true, nome: 'Hub Outro', endereco: 'Rua B', lat: -23.6, lng: -46.7, horarios: [],
      },
    ],
    loading: false,
    error: null,
  }),
}));
vi.mock('../../lib/distance', () => ({ formatDistanceKm: vi.fn(), haversineKm: vi.fn() }));
vi.mock('../../lib/geocodeCep', () => ({ geocodeCep: vi.fn() }));
vi.mock('../../lib/geolocation', () => ({ getCurrentCoords: vi.fn(async () => null) }));
vi.mock('../../lib/qaSimulation', () => ({ isForcedLoading: () => false, simulationToAsyncCallOptions: () => undefined }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
const navigation = { goBack: vi.fn(), navigate: vi.fn() };

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  navigation.goBack.mockClear();
  navigation.navigate.mockClear();
  state.cart.selectHub.mockClear();
});

it('mantém a tela aberta ao tocar novamente no hub já selecionado', async () => {
  await act(async () => {
    renderer = create(React.createElement(EscolhaRetirada, { navigation: navigation as never, route: {} as never }));
  });

  const selectedRow = renderer!.root
    .findAllByType('SelectableRow' as never)
    .find((node) => (node.props as { title?: string }).title === 'Hub Selecionado');
  await act(async () => { await (selectedRow!.props as { onPress: () => void }).onPress(); });

  // Regressão do bug K: uma seleção sem mudança não deve desmontar/remontar a tela nativa.
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(state.cart.selectHub).not.toHaveBeenCalled();
});

function selectionWrappers() {
  return renderer!.root
    .findAllByType('View' as never)
    .filter((node) => (node.props as { pointerEvents?: string }).pointerEvents !== undefined);
}

async function pressRow(title: string) {
  const row = renderer!.root
    .findAllByType('SelectableRow' as never)
    .find((node) => (node.props as { title?: string }).title === title);
  expect(row).toBeDefined();
  await act(async () => {
    (row!.props as { onPress: () => void }).onPress();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it('volta sem reativar a lista ao confirmar a seleção de outro hub (bug Q)', async () => {
  state.cart.selectHub.mockResolvedValueOnce({
    status: 'committed',
    state: { estabelecimentoId: null, hubId: 'hub-outro', items: [], payment: null },
  } as never);
  await act(async () => {
    renderer = create(React.createElement(EscolhaRetirada, { navigation: navigation as never, route: {} as never }));
  });

  await pressRow('Hub Outro');

  expect(state.cart.selectHub).toHaveBeenCalledTimes(1);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  // Regressão do bug Q: no caminho committed, finishSelection chamava
  // setSelectionPending(false) imediatamente antes de goBack(), remontando
  // todas as linhas (pointerEvents/opacity/disabled) no mesmo frame em que o
  // native-stack desmonta a tela -> Fabric: "child already has a parent".
  // Ao sair, a lista deve continuar pending (sem remontagem da tela que sai).
  expect(selectionWrappers().length).toBeGreaterThan(0);
  expect(selectionWrappers().every((node) => (node.props as { pointerEvents?: string }).pointerEvents === 'none')).toBe(true);
});

it('reativa a lista quando a seleção falha e a tela permanece aberta', async () => {
  state.cart.selectHub.mockResolvedValueOnce({
    status: 'persistence_error',
    state: { estabelecimentoId: null, hubId: 'hub-selecionado', items: [], payment: null },
  } as never);
  await act(async () => {
    renderer = create(React.createElement(EscolhaRetirada, { navigation: navigation as never, route: {} as never }));
  });

  await pressRow('Hub Outro');

  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(selectionWrappers().every((node) => (node.props as { pointerEvents?: string }).pointerEvents === 'auto')).toBe(true);
});
