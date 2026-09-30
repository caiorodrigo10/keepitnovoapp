import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { CardPaymentForm } from './AdicionarCartao';
const listeners = vi.hoisted(() => ({ auth: (_value: unknown) => {}, app: (_value: string) => {} }));
vi.mock('@keepit/ui-tokens', async () => { const { default: t } = await import('../../../../../packages/ui-tokens/src/tokens.json'); return { lightColors: t.colors.light, radii: t.radii, spacing: t.spacing, typography: t.typography }; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (v: unknown) => v }, AppState: { addEventListener: (_e: string, cb: (v: string) => void) => { listeners.app = cb; return { remove() {} }; } } }));
vi.mock('@react-navigation/native', () => ({ useFocusEffect: (cb: () => void) => React.useEffect(cb, []) }));
vi.mock('@keepit/core-data', () => ({ getDataClient: () => ({ auth: { onAuthStateChange: (cb: (v: unknown) => void) => { listeners.auth = cb; return () => {}; } } }) }));
vi.mock('../../components/ui', () => ({ AppHeader: 'Header', FormScreen: 'FormScreen', Button: 'Button', TextField: 'TextField' }));
vi.mock('../../context/CartContext', () => ({ useCart: () => ({}) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => { if (renderer) await act(async () => renderer?.unmount()); renderer = undefined; });
const values: Record<string, string> = { 'Número do cartão': '4444444444444444', 'Nome no cartão': 'Marcelo Almeida', 'Validade (MM/AA)': '12/28', CVV: '123', 'Nome completo do titular': 'Marcelo Almeida', 'E-mail do titular': 'sandbox@example.invalid', 'CPF/CNPJ do titular': '24971563792', 'CEP de cobrança': '89223005', 'Número do endereço': '277', 'Telefone do titular': '4738010919' };
async function fill() { expect(renderer!.root.findAllByType('TextField' as never)).toHaveLength(10); await act(async () => { for (const field of renderer!.root.findAllByType('TextField' as never)) field.props.onChangeText(values[field.props.label]); }); }
it('só envia formulário completo à vista e apaga dados imediatamente, mesmo antes da resposta', async () => {
  const submit = vi.fn(() => new Promise<void>(() => {}));
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { onSubmit: submit, disabled: false })); });
  expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(true);
  await fill(); expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(false);
  await act(async () => { renderer!.root.findByType('Button' as never).props.onPress(); });
  expect(submit).toHaveBeenCalledWith({ holderName: 'Marcelo Almeida', number: '4444444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' }, { name: 'Marcelo Almeida', email: 'sandbox@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' });
  expect(renderer!.root.findAllByType('TextField' as never).every((field) => field.props.value === '')).toBe(true);
});
it.each(['logout','background'])('descarta formulário ao receber %s', async (event) => {
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, { onSubmit: async () => {}, disabled: false })); });
  await fill();
  await act(async () => { if (event === 'logout') listeners.auth(null); else listeners.app('background'); });
  expect(renderer!.root.findAllByType('TextField' as never).every((field) => field.props.value === '')).toBe(true);
});
