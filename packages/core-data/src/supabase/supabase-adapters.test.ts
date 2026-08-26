import { describe, expect, it } from 'vitest';

import { createAuthSupabase } from './auth.supabase';
import { NotImplementedError } from './not-implemented-error';
import { createOrderSupabase } from './order.supabase';
import { createStoreSupabase } from './store.supabase';

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

  // wallet.supabase.ts — `getBalance`/`statement` (Story 7.7) e
  // `requestWithdrawal` (Story 7.8) já são implementações reais, cobertas em
  // `wallet.supabase.test.ts`. Esqueleto encerrado (nenhum método restante).

  // analytics.supabase.ts — `salesSummary`/`topProducts` (Story 7.10) e
  // `monthlyStatement` (Story 7.9) já são implementações reais, cobertas em
  // `analytics.supabase.test.ts`. Esqueleto encerrado (nenhum método
  // restante).

  // admin.supabase.ts — esqueleto ENCERRADO (Bloco 09, Épico 8): todos os
  // métodos que ainda lançavam `NotImplementedError` (`refundQueue.*`,
  // `payoutQueue.*`, `listClientes`, `blockCliente`, `unblockCliente`,
  // `listAllEstabelecimentos`, `suspendLojista`, `reactivateLojista`,
  // `lojistaQualityView`, `lojistaOrderCounts`, `financialDashboard`,
  // `listAllOrders`, `forceCancelOrder`) são implementações reais desde as
  // Stories 8.1-8.9, cobertas em `admin.supabase.test.ts`. Nenhum método
  // restante — este describe fica só com o histórico dos demais arquivos.

  it('mensagem de erro identifica port + método + épico correto (amostra por arquivo)', async () => {
    await expect(createStoreSupabase().getCatalog(undefined as never)).rejects.toThrow(
      '[core-data/supabase] store.getCatalog — implementar no Épico 5',
    );
    await expect(createOrderSupabase().getById(undefined as never)).rejects.toThrow(
      '[core-data/supabase] order.getById — implementar no Épico 6',
    );
  });
});
