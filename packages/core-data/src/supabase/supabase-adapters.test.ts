import { describe, expect, it } from 'vitest';

import { createAdminSupabase } from './admin.supabase';
import { createAnalyticsSupabase } from './analytics.supabase';
import { createAuthSupabase } from './auth.supabase';
import { createHubSupabase } from './hub.supabase';
import { NotImplementedError } from './not-implemented-error';
import { createOrderSupabase } from './order.supabase';
import { createProductSupabase } from './product.supabase';
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
  it('auth.supabase.ts — todo método rejeita com NotImplementedError', async () => {
    const port = createAuthSupabase();
    await expectNotImplemented(port.signUp.bind(port), 1);
    await expectNotImplemented(port.signIn.bind(port), 1);
    await expectNotImplemented(port.currentUser.bind(port), 0);
    await expectNotImplemented(port.signOut.bind(port), 0);
    await expectNotImplemented(port.confirmPhone.bind(port), 2);
    await expectNotImplemented(port.getById.bind(port), 1);
    await expectNotImplemented(port.updateCpf.bind(port), 2);
  });

  it('hub.supabase.ts — todo método rejeita com NotImplementedError', async () => {
    const port = createHubSupabase();
    await expectNotImplemented(port.listNearby.bind(port), 0);
    await expectNotImplemented(port.getById.bind(port), 1);
  });

  it('store.supabase.ts — todo método rejeita com NotImplementedError', async () => {
    const port = createStoreSupabase();
    await expectNotImplemented(port.listByHub.bind(port), 1);
    await expectNotImplemented(port.getCatalog.bind(port), 1);
    await expectNotImplemented(port.getById.bind(port), 1);
    await expectNotImplemented(port.getState.bind(port), 1);
    await expectNotImplemented(port.setPausadoManualmente.bind(port), 2);
  });

  it('product.supabase.ts — todo método rejeita com NotImplementedError', async () => {
    const port = createProductSupabase();
    await expectNotImplemented(port.list.bind(port), 1);
    await expectNotImplemented(port.getById.bind(port), 1);
    await expectNotImplemented(port.create.bind(port), 1);
    await expectNotImplemented(port.update.bind(port), 2);
    await expectNotImplemented(port.pause.bind(port), 1);
    await expectNotImplemented(port.delete.bind(port), 1);
  });

  it('order.supabase.ts — todo método rejeita com NotImplementedError', async () => {
    const port = createOrderSupabase();
    await expectNotImplemented(port.create.bind(port), 1);
    await expectNotImplemented(port.listMine.bind(port), 1);
    await expectNotImplemented(port.getById.bind(port), 1);
    await expectNotImplemented(port.accept.bind(port), 2);
    await expectNotImplemented(port.refuse.bind(port), 2);
    await expectNotImplemented(port.confirmPin.bind(port), 2);
    await expectNotImplemented(port.cancel.bind(port), 2);
    await expectNotImplemented(port.listByEstabelecimento.bind(port), 1);
    await expectNotImplemented(port.markReadyForHub.bind(port), 1);
    await expectNotImplemented(port.markArrivedAtHub.bind(port), 1);
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

  it('admin.supabase.ts — todo método (incluindo hubsCrud/refundQueue) rejeita com NotImplementedError', async () => {
    const port = createAdminSupabase();
    await expectNotImplemented(port.pendingStores.bind(port), 0);
    await expectNotImplemented(port.approve.bind(port), 1);
    await expectNotImplemented(port.reject.bind(port), 2);
    await expectNotImplemented(port.hubsCrud.create.bind(port.hubsCrud), 1);
    await expectNotImplemented(port.hubsCrud.update.bind(port.hubsCrud), 2);
    await expectNotImplemented(port.hubsCrud.delete.bind(port.hubsCrud), 1);
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
    await expect(createHubSupabase().listNearby()).rejects.toThrow(
      '[core-data/supabase] hub.listNearby — implementar no Épico 5',
    );
    await expect(createOrderSupabase().create(undefined as never)).rejects.toThrow(
      '[core-data/supabase] order.create — implementar no Épico 6',
    );
    await expect(createAdminSupabase().pendingStores()).rejects.toThrow(
      '[core-data/supabase] admin.pendingStores — implementar no Épico 3',
    );
    await expect(createAdminSupabase().hubsCrud.create(undefined as never)).rejects.toThrow(
      '[core-data/supabase] admin.hubsCrud.create — implementar no Épico 4',
    );
    await expect(createAdminSupabase().listAllOrders()).rejects.toThrow(
      '[core-data/supabase] admin.listAllOrders — implementar no Épico 8',
    );
  });
});
