import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { CardPaymentForm } from '../../components/checkout/CardPaymentForm';
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));
const listeners = vi.hoisted(() => ({ auth: (_value: unknown) => {}, app: (_value: string) => {}, blur: () => {} }));
vi.mock('@keepit/ui-tokens', async () => { const { default: t } = await import('../../../../../packages/ui-tokens/src/tokens.json'); return { lightColors: t.colors.light, radii: t.radii, spacing: t.spacing, typography: t.typography }; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (v: unknown) => v }, AppState: { addEventListener: (_e: string, cb: (v: string) => void) => { listeners.app = cb; return { remove() {} }; } } }));
vi.mock('@react-navigation/native', () => ({ useFocusEffect: (cb: () => (() => void)) => React.useEffect(() => { const cleanup = cb(); listeners.blur = cleanup; return cleanup; }, []) }));
vi.mock('@keepit/core-data', () => ({ getDataClient: () => ({ auth: { onAuthStateChange: (cb: (v: unknown) => void) => { listeners.auth = cb; return () => {}; } } }) }));
vi.mock('../../components/ui', () => ({ AppHeader: 'Header', FormScreen: 'FormScreen', Button: 'Button', Checkbox: 'Checkbox', TextField: 'TextField' }));
vi.mock('../../context/CartContext', () => ({ useCart: () => ({}) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => { if (renderer) await act(async () => renderer?.unmount()); renderer = undefined; flags.enabled = true; });
const values: Record<string, string> = { 'Número do cartão': '4444444444444444', 'Nome no cartão': 'Marcelo Almeida', 'Validade (MM/AA)': '12/28', CVV: '123', 'Nome completo do titular': 'Marcelo Almeida', 'E-mail do titular': 'sandbox@example.invalid', 'CPF/CNPJ do titular': '24971563792', 'CEP de cobrança': '89223005', 'Número do endereço': '277', 'Telefone do titular': '4738010919' };
async function fill() { expect(renderer!.root.findAllByType('TextField' as never)).toHaveLength(10); await act(async () => { for (const field of renderer!.root.findAllByType('TextField' as never)) field.props.onChangeText(values[field.props.label]); }); }
it('compra começa com consentimento para salvar e desmarcar só altera a autorização', async () => {
  const submit = vi.fn(() => new Promise<void>(() => {}));
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { mode: 'compra', initialHolder: {}, valorValidacaoCentavos: null, onSubmit: submit, disabled: false })); });
  const checkbox = renderer!.root.findAllByType('Checkbox' as never).find((field) => field.props.label === 'Salvar este cartão')!;
  expect(checkbox.props.label).toBe('Salvar este cartão');
  expect(checkbox.props.checked).toBe(true);
  await act(async () => { checkbox.props.onToggle(); });
  expect(renderer!.root.findAllByType('Checkbox' as never).find((field) => field.props.label === 'Salvar este cartão')!.props.checked).toBe(false);
  expect(renderer!.root.findByType('Button' as never).props.title).toBe('Pagar');
  expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(true);
  await fill(); expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(false);
  await act(async () => { renderer!.root.findByType('Button' as never).props.onPress(); });
  expect(submit).toHaveBeenCalledWith({ cartao: { holderName: 'Marcelo Almeida', number: '4444444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' }, titular: { name: 'Marcelo Almeida', email: 'sandbox@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' }, salvarCartao: false });
  expect(renderer!.root.findAllByType('TextField' as never).every((field) => field.props.value === '')).toBe(true);
});
it('oculta salvar e paga digitado com consentimento falso', async () => {
  flags.enabled = false;
  const submit = vi.fn(async () => {});
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { mode: 'compra', initialHolder: {}, valorValidacaoCentavos: null, onSubmit: submit, disabled: false })); });
  expect(renderer!.root.findAllByType('Checkbox' as never).some((node) => node.props.label === 'Salvar este cartão')).toBe(false);
  await fill();
  expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(false);
  await act(async () => { renderer!.root.findByType('Button' as never).props.onPress(); });
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ salvarCartao: false }));
});
it('só envia formulário completo à vista e apaga dados imediatamente, mesmo antes da resposta', async () => {
  const submit = vi.fn(() => new Promise<void>(() => {}));
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { mode: 'compra', initialHolder: {}, valorValidacaoCentavos: null, onSubmit: submit, disabled: false })); });
  expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(true);
  await fill(); expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(false);
  await act(async () => { renderer!.root.findByType('Button' as never).props.onPress(); });
  expect(submit).toHaveBeenCalledWith({ cartao: { holderName: 'Marcelo Almeida', number: '4444444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' }, titular: { name: 'Marcelo Almeida', email: 'sandbox@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' }, salvarCartao: true });
  expect(renderer!.root.findAllByType('TextField' as never).every((field) => field.props.value === '')).toBe(true);
});
it('ao desmarcar Sou o titular limpa o cadastro próprio e envia os dados editáveis do terceiro', async () => {
  const submit = vi.fn(async () => {});
  const ownHolder = { name: 'Ana Proprietária', email: 'ana@example.invalid', cpfCnpj: '12345678901', postalCode: '01001000', addressNumber: '10', phone: '11999999999' };
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { mode: 'compra', initialHolder: ownHolder, valorValidacaoCentavos: null, onSubmit: submit, disabled: false })); });
  expect(renderer!.root.findAllByType('TextField' as never).find((field) => field.props.label === 'Nome completo do titular')!.props.value).toBe('Ana Proprietária');
  const holderCheckbox = renderer!.root.findAllByType('Checkbox' as never).find((field) => field.props.label === 'Sou o titular')!;
  expect(holderCheckbox.props.checked).toBe(true);
  await act(async () => { holderCheckbox.props.onToggle(); });
  for (const label of ['Nome no cartão', 'Nome completo do titular', 'E-mail do titular', 'CPF/CNPJ do titular', 'CEP de cobrança', 'Número do endereço', 'Telefone do titular']) {
    expect(renderer!.root.findAllByType('TextField' as never).find((field) => field.props.label === label)!.props.value).toBe('');
  }
  await fill();
  await act(async () => { renderer!.root.findByType('Button' as never).props.onPress(); });
  expect(submit).toHaveBeenCalledWith({ cartao: { holderName: 'Marcelo Almeida', number: '4444444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' }, titular: { name: 'Marcelo Almeida', email: 'sandbox@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' }, salvarCartao: true });
});
it('perfil informa a validação, salva explicitamente e bloqueia o envio sem valor', async () => {
  const submit = vi.fn(async () => {});
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { mode: 'perfil', initialHolder: {}, valorValidacaoCentavos: 123, onSubmit: submit, disabled: false })); });
  const validationText = renderer!.root.findAllByType('Text' as never).map((field) => field.children.join('')).join(' ');
  expect(validationText).toContain('Será feita uma cobrança de validação de R$ 1,23, estornada em seguida. O prazo de aparecer na fatura depende do emissor.');
  expect(renderer!.root.findByType('Button' as never).props.title).toBe('Salvar e validar cartão');
  await fill();
  await act(async () => { renderer!.root.findByType('Button' as never).props.onPress(); });
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ salvarCartao: true }));
  await act(async () => { renderer!.update(React.createElement(CardPaymentForm, { mode: 'perfil', initialHolder: {}, valorValidacaoCentavos: null, onSubmit: async () => {}, disabled: false })); });
  await fill();
  expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(true);
});
it.each(['logout','background','blur'])('descarta formulário ao receber %s', async (event) => {
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { mode: 'compra', initialHolder: {}, valorValidacaoCentavos: null, onSubmit: async () => {}, disabled: false })); });
  await fill();
  await act(async () => { if (event === 'logout') listeners.auth(null); else if (event === 'background') listeners.app('background'); else listeners.blur(); });
  expect(renderer!.root.findAllByType('TextField' as never).every((field) => field.props.value === '')).toBe(true);
});
