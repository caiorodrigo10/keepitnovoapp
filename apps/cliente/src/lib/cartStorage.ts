import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CartItem, PaymentSelection } from '../context/CartContext';

/**
 * Persistência do carrinho (Story 6.1, AC3) — [IDS] CREATE reaproveitando o
 * MESMO padrão de `onboardingFlag.ts` (Story 2.1): chave-por-dispositivo,
 * fail-open (erro de leitura/escrita nunca trava a tela, só degrada para
 * "sem carrinho salvo"). O carrinho sobrevive a fechar/reabrir o app no
 * mesmo aparelho; não sincroniza entre dispositivos (decisão da Story 1.10,
 * Task 8, reafirmada pelo overlay do piloto — ver Dependencies da 6.1).
 *
 * Escopo: `items`/`estabelecimentoId`/`hubId`/`payment` — os 4 campos
 * listados nas Tasks da Story. `cpfCollected`/`cards` NÃO são persistidos
 * aqui: são estado de PERFIL do cliente, não do carrinho de compra atual.
 */
const CARRINHO_KEY = '@keepit/cliente:carrinho';

export interface PersistedCartState {
  estabelecimentoId: string | null;
  items: CartItem[];
  hubId: string | null;
  payment: PaymentSelection | null;
}

function isValidPersistedCartState(value: unknown): value is PersistedCartState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    (v.estabelecimentoId === null || typeof v.estabelecimentoId === 'string') &&
    Array.isArray(v.items) &&
    (v.hubId === null || typeof v.hubId === 'string') &&
    (v.payment === null || typeof v.payment === 'object')
  );
}

/**
 * Lê o carrinho salvo. Fail-open: erro de leitura, ausência de valor, ou
 * payload corrompido/com shape inesperado — todos retornam `null` (o
 * `CartProvider` mantém o estado inicial vazio nesses casos).
 */
export async function loadCartState(): Promise<PersistedCartState | null> {
  try {
    const raw = await AsyncStorage.getItem(CARRINHO_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return isValidPersistedCartState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Grava o carrinho. Fail-open: erro de escrita não propaga — a mudança fica
 * só em memória até a próxima escrita bem-sucedida, sem travar a tela.
 */
export async function saveCartState(state: PersistedCartState): Promise<void> {
  try {
    await AsyncStorage.setItem(CARRINHO_KEY, JSON.stringify(state));
  } catch {
    // Fail-open — ver JSDoc do módulo.
  }
}

/** Apaga o carrinho salvo. Fail-open: erro na remoção não propaga. */
export async function clearCartState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CARRINHO_KEY);
  } catch {
    // Fail-open — ver JSDoc do módulo.
  }
}
