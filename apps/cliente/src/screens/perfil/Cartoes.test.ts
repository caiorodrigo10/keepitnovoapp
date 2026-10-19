import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';

import Cartoes from './Cartoes';
import AdicionarCartao from '../home/AdicionarCartao';
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));

const cardsState = vi.hoisted(() => ({
  cards: [
    { id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true },
    { id: 'card-2', bandeira: 'Mastercard', ultimo4: '2222', principal: false },
  ],
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
  definirPrincipal: vi.fn(),
  remover: vi.fn(),
  consultarConfiguracao: vi.fn(),
  consultarCadastro: vi.fn(),
  cadastrar: vi.fn(),
}));

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() }, Text: 'Text', View: 'View', StyleSheet: { create: (value: unknown) => value } }));
vi.mock('@keepit/ui-tokens', async () => { const { default: tokens } = await import('../../../../../packages/ui-tokens/src/tokens.json'); return { lightColors: tokens.colors.light, radii: tokens.radii, spacing: tokens.spacing, typography: tokens.typography }; });
vi.mock('../../components/ui', () => ({ AppHeader: 'AppHeader', Button: 'Button', FormScreen: 'FormScreen' }));
vi.mock('../../hooks/useCurrentCliente', () => ({ useCurrentCliente: () => ({ data: { id: 'cliente-1' } }) }));
vi.mock('../../hooks/useSavedCards', () => ({ useSavedCards: () => cardsState }));
vi.mock('../../hooks/useCurrentEmail', () => ({ useCurrentEmail: () => ({ data: 'cliente@example.invalid' }) }));
vi.mock('../../lib/dataSource', () => ({ isSupabaseDataSource: () => true }));
vi.mock('../../components/checkout/CardPaymentForm', () => ({ CardPaymentForm: 'CardPaymentForm' }));
vi.mock('@keepit/core-data', () => ({ createSupportOperationId: vi.fn(() => 'new-operation'), getDataClient: () => ({ savedCards: cardsState }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
const navigation = { canGoBack: () => true, goBack: vi.fn(), navigate: vi.fn() };

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  flags.enabled = true;
  vi.clearAllMocks();
  cardsState.cards = [
    { id: 'card-1', bandeira: 'Visa', ultimo4: '1111', principal: true },
    { id: 'card-2', bandeira: 'Mastercard', ultimo4: '2222', principal: false },
  ];
  cardsState.error = null;
  cardsState.consultarConfiguracao.mockResolvedValue({ disponivel: true, valorCentavos: 137 });
  cardsState.consultarCadastro.mockResolvedValue(null);
});

it('retoma operação pendente sem reabrir o formulário ou disparar nova validação', async () => {
  cardsState.consultarConfiguracao.mockResolvedValue({ disponivel: true, valorCentavos: 137 });
  cardsState.consultarCadastro.mockResolvedValue({ id: 'operation-1', estado: 'estorno_pendente', valorCentavos: 137 });
  await act(async () => { renderer = create(React.createElement(AdicionarCartao, { navigation, route: { params: { operacaoId: 'operation-1' } } })); });
  expect(cardsState.consultarCadastro).toHaveBeenCalledWith('operation-1');
  expect(renderer!.root.findAllByType('CardPaymentForm' as never)).toHaveLength(0);
  expect(renderer!.root.findAllByType('Text' as never).map((node) => node.children.join('')).join(' ')).toContain('Estorno pendente');
  expect(cardsState.cadastrar).not.toHaveBeenCalled();
});

it('rota antiga de cadastro não consulta nem abre formulário', async () => {
  flags.enabled = false;
  await act(async () => { renderer = create(React.createElement(AdicionarCartao, { navigation, route: { params: { operacaoId: 'operation-1' } } })); });
  expect(renderer!.root.findAllByType('CardPaymentForm' as never)).toHaveLength(0);
  expect(cardsState.consultarConfiguracao).not.toHaveBeenCalled();
  expect(cardsState.consultarCadastro).not.toHaveBeenCalled();
  expect(cardsState.cadastrar).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer!.toJSON())).toContain('Cartões salvos estão temporariamente indisponíveis');
});

it('não reabre o formulário quando a consulta já confirma a validação concluída', async () => {
  cardsState.consultarConfiguracao.mockResolvedValue({ disponivel: true, valorCentavos: 137 });
  cardsState.consultarCadastro.mockResolvedValue({ id: 'operation-1', estado: 'concluida', valorCentavos: 137 });
  await act(async () => { renderer = create(React.createElement(AdicionarCartao, { navigation, route: { params: { operacaoId: 'operation-1' } } })); });
  expect(renderer!.root.findAllByType('CardPaymentForm' as never)).toHaveLength(0);
  expect(renderer!.root.findAllByType('Text' as never).map((node) => node.children.join('')).join(' ')).toContain('concluída');
});

it('retoma pelo ID canônico devolvido pelo servidor quando há validação pendente', async () => {
  cardsState.consultarConfiguracao.mockResolvedValue({ disponivel: true, valorCentavos: 137 });
  cardsState.consultarCadastro
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'server-active', estado: 'estorno_pendente', valorCentavos: 137 });
  cardsState.cadastrar.mockResolvedValue({ id: 'server-active', estado: 'estorno_pendente', valorCentavos: 137 });
  await act(async () => { renderer = create(React.createElement(AdicionarCartao, { navigation, route: { params: { operacaoId: 'client-operation' } } })); });
  await act(async () => { await renderer!.root.findByType('CardPaymentForm' as never).props.onSubmit({ cartao: { holderName: 'A', number: '4444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' }, titular: { name: 'A', email: 'a@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '1', phone: '4738010919' }, salvarCartao: true }); });
  await act(async () => { renderer!.unmount(); renderer = create(React.createElement(AdicionarCartao, { navigation, route: {} })); });
  expect(cardsState.consultarCadastro).toHaveBeenLastCalledWith('server-active');
  expect(renderer!.root.findAllByType('CardPaymentForm' as never)).toHaveLength(0);
});

it('explica o cadastro recusado e prepara uma nova operação para a próxima tentativa', async () => {
  cardsState.consultarConfiguracao.mockResolvedValue({ disponivel: true, valorCentavos: 137 });
  cardsState.consultarCadastro.mockResolvedValue({ id: 'operation-1', estado: 'recusada', valorCentavos: 137 });
  cardsState.cadastrar.mockResolvedValue({ id: 'operation-1', estado: 'recusada', valorCentavos: 137 });
  await act(async () => { renderer = create(React.createElement(AdicionarCartao, { navigation, route: { params: { operacaoId: 'operation-1' } } })); });
  const form = renderer!.root.findByType('CardPaymentForm' as never);
  await act(async () => { await form.props.onSubmit({ cartao: { holderName: 'A', number: '4444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' }, titular: { name: 'A', email: 'a@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '1', phone: '4738010919' }, salvarCartao: true }); });
  expect(cardsState.cadastrar).toHaveBeenCalledWith(expect.objectContaining({ operacaoId: 'new-operation' }));
  expect(renderer!.root.findAllByType('Text' as never).map((node) => node.children.join('')).join(' ')).toContain('recusado');
});

it('mostra os dois cartões, identifica o principal e permite defini-lo pela lista real', async () => {
  await act(async () => { renderer = create(React.createElement(Cartoes, { navigation: navigation as never, route: {} as never })); });
  const text = renderer!.root.findAllByType('Text' as never).map((node) => node.children.join('')).join(' ');
  expect(text).toContain('Visa final 1111');
  expect(text).toContain('Mastercard final 2222');
  expect(text).toContain('Principal');
  const buttons = renderer!.root.findAllByType('Button' as never);
  await act(async () => { await buttons.find((button) => button.props.title === 'Definir como principal')!.props.onPress(); });
  expect(cardsState.definirPrincipal).toHaveBeenCalledWith('card-2');
});

it('confirma a remoção por bandeira e final, sem expor token, e mostra vazio após a lista confirmada', async () => {
  const { Alert } = await import('react-native');
  await act(async () => { renderer = create(React.createElement(Cartoes, { navigation: navigation as never, route: {} as never })); });
  const remove = renderer!.root.findAllByType('Button' as never).find((button) => button.props.title === 'Remover cartão')!;
  await act(async () => { remove.props.onPress(); });
  expect(Alert.alert).toHaveBeenCalledWith('Remover cartão', expect.stringContaining('Visa final 1111'), expect.any(Array));
  const [, , actions] = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0]!;
  await act(async () => { await actions[1].onPress(); });
  expect(cardsState.remover).toHaveBeenCalledWith('card-1');
  cardsState.cards = [];
  await act(async () => { renderer!.update(React.createElement(Cartoes, { navigation: navigation as never, route: {} as never })); });
  expect(renderer!.root.findAllByType('Text' as never).map((node) => node.children.join('')).join(' ')).toContain('Você ainda não tem cartões salvos.');
});
