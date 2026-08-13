import { describe, expect, it } from 'vitest';

import { createAdminSupabase } from './admin.supabase';
import { createAnalyticsSupabase } from './analytics.supabase';
import { createAuthSupabase } from './auth.supabase';
import { NotImplementedError } from './not-implemented-error';
import { createOrderSupabase } from './order.supabase';
import { createStoreSupabase } from './store.supabase';
import { createWalletSupabase } from './wallet.supabase';

/**
 * Chama um método de port passando `undefined` para todos os parâmetros
 * exigidos — como todo stub lança `NotImplementedError` ANTES de tocar
 * qualquer argumento, isso é suficiente para o teste de contrato do
 * esqueleto (Story 1.9, Task 11). Não testa validação de argumento (isso é
 * responsabilidade dos épicos 2-9 quando o método for preenchido de verdade).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function expectNotImplemented(fn: (...args: any[]) => Promise<unknown>, argsCount: number): Promise<void> {
  const args = new Array(argsCount).fill(undefined);
  await expect(fn(...args)).rejects.toBeInstanceOf(NotImplementedError);
}

describe('supabase adapters (esqueleto — Story 1.9)', () => {
  // auth.supabase.ts — `updateCpf` é implementação real desde a Story 6.5,
  // coberta em `auth.supabase.test.ts`.
  it('auth.supabase.ts — todo método (exceto signUp, signIn, currentUser, signOut e updateCpf, implementados nas Stories 2.3/2.6/2.8/6.5) rejeita com NotImplementedError', async () => {
    const port = createAuthSupabase();
    await expectNotImplemented(port.confirmPhone.bind(port), 2);
    await expectNotImplemented(port.getById.bind(port), 1);
  });

  // hub.supabase.ts — `listNearby`/`getById` são implementações reais desde
  // a Story 5.1, cobertas em `hub.supabase.test.ts`.

  // store.supabase.ts — `getById` (Stories 4.7/4.8), `setPausadoManualmente`
  // (Story 4.8), `updateHorarios` (Story 4.7), `listByHub` (Story 5.2) e
  // `getState` (Story 5.3) já são implementações reais, cobertas em
  // `store.supabase.test.ts`.
  it('store.supabase.ts — getCatalog (método morto, sem consumidor real) rejeita com NotImplementedError', async () => {
    const port = createStoreSupabase();
    await expectNotImplemented(port.getCatalog.bind(port), 1);
  });

  // product.supabase.ts — esqueleto encerrado: `list`/`create`/`uploadFoto`
  // (Stories 4.3/4.4) e `getById`/`update`/`pause`/`delete` (Stories 4.5/4.6)
  // já são implementações reais, cobertas em `product.supabase.test.ts`.

  // order.supabase.ts — `create` (Story 6.6), `listMine` (Story 6.7),
  // `accept` (Story 6.9), `listByEstabelecimento` (Story 6.8),
  // `markReadyForHub` (Story 6.12), `confirmPin` (Story 6.15) e
  // `markArrivedAtHub` (Story 6.14) já são implementações reais, cobertas em
  // `order.supabase.test.ts`. `markClienteChegou` permanece `NotImplementedError`
  // — DEFERIDO (LATER), decisão explícita da Story 6.14 (ver Scope/Débito
  // conhecido no story file).
  it('order.supabase.ts — demais métodos rejeitam com NotImplementedError', async () => {
    const port = createOrderSupabase();
    await expectNotImplemented(port.getById.bind(port), 1);
    await expectNotImplemented(port.refuse.bind(port), 2);
    await expectNotImplemented(port.cancel.bind(port), 2);
    await expectNotImplemented(port.markCustomerNoShow.bind(port), 2);
    await expectNotImplemented(port.advanceStatus.bind(port), 2);
    await expectNotImplemented(port.markClienteChegou.bind(port), 1);
  });

  it('wallet.supabase.ts — todo método rejeita com NotImplementedError', async () => {
    const port = createWalletSupabase();
    await expectNotImplemented(port.getBalance.bind(port), 1);
    await expectNotImplemented(port.requestWithdrawal.bind(port), 2);
    await expectNotImplemented(port.statement.bind(port), 1);
  });

  it('analytics.supabase.ts — todo método rejeita com NotImplementedError', async () => {
    const port = createAnalyticsSupabase();
    await expectNotImplemented(port.salesSummary.bind(port), 2);
    await expectNotImplemented(port.topProducts.bind(port), 2);
    await expectNotImplemented(port.monthlyStatement.bind(port), 1);
  });

  it('admin.supabase.ts — todo método (exceto pendingStores/pendingStoreDetail, Story 3.7; approve/reject, Stories 3.8/3.9; e hubsCrud.*, Story 4.1) rejeita com NotImplementedError', async () => {
    const port = createAdminSupabase();
    await expectNotImplemented(port.refundQueue.list.bind(port.refundQueue), 0);
    await expectNotImplemented(port.refundQueue.process.bind(port.refundQueue), 1);
    await expectNotImplemented(port.listClientes.bind(port), 0);
    await expectNotImplemented(port.blockCliente.bind(port), 2);
    await expectNotImplemented(port.unblockCliente.bind(port), 1);
    await expectNotImplemented(port.listAllEstabelecimentos.bind(port), 0);
    await expectNotImplemented(port.suspendLojista.bind(port), 2);
    await expectNotImplemented(port.lojistaQualityView.bind(port), 1);
    await expectNotImplemented(port.financialDashboard.bind(port), 1);
    await expectNotImplemented(port.listAllOrders.bind(port), 0);
    await expectNotImplemented(port.forceCancelOrder.bind(port), 2);
  });

  it('mensagem de erro identifica port + método + épico correto (amostra por arquivo)', async () => {
    await expect(createStoreSupabase().getCatalog(undefined as never)).rejects.toThrow(
      '[core-data/supabase] store.getCatalog — implementar no Épico 5',
    );
    await expect(createOrderSupabase().getById(undefined as never)).rejects.toThrow(
      '[core-data/supabase] order.getById — implementar no Épico 6',
    );
    await expect(createAdminSupabase().refundQueue.list()).rejects.toThrow(
      '[core-data/supabase] admin.refundQueue.list — implementar no Épico 8',
    );
    await expect(createAdminSupabase().listAllOrders()).rejects.toThrow(
      '[core-data/supabase] admin.listAllOrders — implementar no Épico 8',
    );
  });
});
