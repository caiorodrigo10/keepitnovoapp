import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';

import Perfil from './Perfil';

const flags = vi.hoisted(() => ({ enabled: true }));
const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  getParent: vi.fn(() => ({ navigate: vi.fn() })),
}));

vi.mock('../../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() }, Pressable: 'Pressable', StyleSheet: { create: (value: unknown) => value }, Text: 'Text', View: 'View',
}));
vi.mock('@keepit/ui-tokens', async () => {
  const { default: tokens } = await import('../../../../../packages/ui-tokens/src/tokens.json');
  return { lightColors: tokens.colors.light, radii: tokens.radii, spacing: tokens.spacing, typography: tokens.typography };
});
vi.mock('@keepit/core-data', () => ({ getDataClient: () => ({ demoScenario: null, auth: { signOut: vi.fn(), updateEmail: vi.fn(), updateProfile: vi.fn() } }) }));
vi.mock('../../components/qa/BuildMetadata', () => ({ BuildMetadata: 'BuildMetadata' }));
vi.mock('../../components/ui', () => ({ Button: 'Button', FormScreen: 'FormScreen', Screen: 'Screen', TextField: 'TextField' }));
vi.mock('../../config/buildInfo', () => ({ QA_BUILD_ENABLED: false }));
vi.mock('../../context/QaScenarioContext', () => ({ useQaSimulation: () => null }));
vi.mock('../../context/FavoritesContext', () => ({ useFavorites: () => ({ favoriteHubCount: 0, favoriteStoreCount: 0 }) }));
vi.mock('../../hooks/useCurrentCliente', () => ({ useCurrentCliente: () => ({ data: { id: 'cliente-1', nome: 'Ada', telefone: null }, loading: false, error: null }) }));
vi.mock('../../hooks/useCurrentEmail', () => ({ useCurrentEmail: () => ({ data: 'ada@example.invalid', loading: false, error: null }) }));
vi.mock('../../hooks/usePedidosMine', () => ({ usePedidosMine: () => ({ data: [], error: null }) }));
vi.mock('../../lib/pedidoStatus', () => ({ partitionPedidos: () => ({ total: 0 }) }));
vi.mock('../../lib/qaAccess', () => ({ isQaRuntimeEnabled: () => false, registerVersionTap: () => ({ nextCount: 0, shouldOpen: false }) }));
vi.mock('../../lib/qaSimulation', () => ({ isForcedLoading: () => false, simulationToAsyncCallOptions: () => ({ forceEmpty: false, forceError: false }) }));
vi.mock('../../lib/telefoneMask', () => ({ isTelefoneBRValido: () => true, maskTelefoneBR: (value: string) => value }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
const navigation = { navigate: state.navigate, getParent: state.getParent };

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  flags.enabled = true;
  vi.clearAllMocks();
});

it('esconde Formas de pagamento por padrão', async () => {
  flags.enabled = false;

  await act(async () => { renderer = create(React.createElement(Perfil, { navigation: navigation as never, route: {} as never })); });

  const labels = renderer!.root.findAllByType('Text' as never).map((node) => node.children.join(''));
  expect(labels).not.toContain('Formas de pagamento');
});

it('mostra Formas de pagamento e navega para Cartoes quando a flag está ligada', async () => {
  flags.enabled = true;

  await act(async () => { renderer = create(React.createElement(Perfil, { navigation: navigation as never, route: {} as never })); });

  const paymentLabel = renderer!.root.findAllByType('Text' as never)
    .find((node) => node.children.join('') === 'Formas de pagamento')!;
  expect(paymentLabel).toBeDefined();
  await act(async () => { paymentLabel.parent!.props.onPress(); });
  expect(state.navigate).toHaveBeenCalledWith('Cartoes');
});
