import { describe, expect, it, vi } from 'vitest';
import { getOrCreateCardCustomer, type CardCustomerStore } from './card-customer';

const ambiente = 'sandbox' as const;
const clienteA = '00000000-0000-0000-0000-0000000000a1';
const clienteB = '00000000-0000-0000-0000-0000000000b2';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('getOrCreateCardCustomer', () => {
  it('persiste um único customer para duas chamadas simultâneas do mesmo cliente', async () => {
    const creating = deferred<void>();
    const customers = new Map<string, string>();
    let claimed = false;
    const store: CardCustomerStore = {
      getClientIdentity: vi.fn(async ({ clienteId }) => ({ id: clienteId, nome: 'Cliente da conta', cpf: '12345678901' })),
      claim: vi.fn(async () => {
        if (customers.has(clienteA)) return { kind: 'ready' as const, customerId: customers.get(clienteA)! };
        if (!claimed) { claimed = true; return { kind: 'acquired' as const, claimToken: 'claim-a' }; }
        return { kind: 'busy' as const };
      }),
      waitForReady: vi.fn(async () => { await creating.promise; return customers.get(clienteA) ?? null; }),
      finish: vi.fn(async ({ customerId }) => { customers.set(clienteA, customerId); creating.resolve(); }),
      recover: vi.fn(),
      reconcile: vi.fn(),
    };
    const asaas = {
      criarCliente: vi.fn(async () => ({ ok: true as const, data: { id: 'cus_a', name: 'Cliente da conta', cpfCnpj: '12345678901' } })),
      listarClientesPorReferencia: vi.fn(),
    };

    const [first, second] = await Promise.all([
      getOrCreateCardCustomer({ clienteId: clienteA, ambiente, store, asaas }),
      getOrCreateCardCustomer({ clienteId: clienteA, ambiente, store, asaas }),
    ]);

    expect(first).toEqual({ ok: true, customerId: 'cus_a' });
    expect(second).toEqual({ ok: true, customerId: 'cus_a' });
    expect(asaas.criarCliente).toHaveBeenCalledTimes(1);
    expect(asaas.criarCliente).toHaveBeenCalledWith({ name: 'Cliente da conta', cpfCnpj: '12345678901', externalReference: clienteA });
  });

  it('usa a identidade persistida de cada cliente, nunca o titular do cartão', async () => {
    const identities = new Map([
      [clienteA, { id: clienteA, nome: 'Ana da conta', cpf: '11111111111' }],
      [clienteB, { id: clienteB, nome: 'Bruno da conta', cpf: '22222222222' }],
    ]);
    const store: CardCustomerStore = {
      getClientIdentity: vi.fn(async ({ clienteId }) => identities.get(clienteId)!),
      claim: vi.fn(async ({ clienteId }) => ({ kind: 'acquired' as const, claimToken: `claim-${clienteId}` })),
      waitForReady: vi.fn(),
      finish: vi.fn(),
      recover: vi.fn(),
      reconcile: vi.fn(),
    };
    const asaas = {
      criarCliente: vi.fn(async (input) => ({ ok: true as const, data: { id: `cus_${input.externalReference}`, name: input.name, cpfCnpj: input.cpfCnpj } })),
      listarClientesPorReferencia: vi.fn(),
    };

    await getOrCreateCardCustomer({ clienteId: clienteA, ambiente, store, asaas });
    await getOrCreateCardCustomer({ clienteId: clienteB, ambiente, store, asaas });

    expect(asaas.criarCliente).toHaveBeenNthCalledWith(1, { name: 'Ana da conta', cpfCnpj: '11111111111', externalReference: clienteA });
    expect(asaas.criarCliente).toHaveBeenNthCalledWith(2, { name: 'Bruno da conta', cpfCnpj: '22222222222', externalReference: clienteB });
  });

  it('recupera uma criação cuja resposta foi perdida pela referência estável, sem repetir POST', async () => {
    const store: CardCustomerStore = {
      getClientIdentity: vi.fn(async () => ({ id: clienteA, nome: 'Cliente da conta', cpf: '12345678901' })),
      claim: vi.fn(async () => ({ kind: 'acquired' as const, claimToken: 'claim-a' })),
      waitForReady: vi.fn(),
      finish: vi.fn(),
      recover: vi.fn(),
      reconcile: vi.fn(),
    };
    const asaas = {
      criarCliente: vi.fn(async () => ({ ok: false as const, error: { status: 0, message: 'resposta perdida' } })),
      listarClientesPorReferencia: vi.fn(async () => ({ ok: true as const, data: { data: [{ id: 'cus_recuperado', name: 'Cliente da conta', cpfCnpj: '12345678901' }], hasMore: false } })),
    };

    await expect(getOrCreateCardCustomer({ clienteId: clienteA, ambiente, store, asaas })).resolves.toEqual({ ok: true, customerId: 'cus_recuperado' });
    expect(store.finish).toHaveBeenCalledWith({ clienteId: clienteA, ambiente, claimToken: 'claim-a', customerId: 'cus_recuperado' });
    expect(store.reconcile).not.toHaveBeenCalled();
    expect(asaas.criarCliente).toHaveBeenCalledTimes(1);
  });

  it('recupera customer único pela referência após lease expirada, sem novo POST', async () => {
    const store: CardCustomerStore = {
      getClientIdentity: vi.fn(),
      claim: vi.fn(async () => ({ kind: 'reconciliation' as const })),
      waitForReady: vi.fn(),
      finish: vi.fn(),
      recover: vi.fn(),
      reconcile: vi.fn(),
    };
    const asaas = {
      criarCliente: vi.fn(),
      listarClientesPorReferencia: vi.fn(async () => ({ ok: true as const, data: { data: [{ id: 'cus_recuperado', name: 'Cliente', cpfCnpj: '12345678901' }], hasMore: false } })),
    };

    await expect(getOrCreateCardCustomer({ clienteId: clienteA, ambiente, store, asaas })).resolves.toEqual({ ok: true, customerId: 'cus_recuperado' });
    expect(store.recover).toHaveBeenCalledWith({ clienteId: clienteA, ambiente, customerId: 'cus_recuperado' });
    expect(asaas.criarCliente).not.toHaveBeenCalled();
  });

  it('does not call the gateway when the durable deletion block rejects the customer claim', async () => {
    const store: CardCustomerStore = {
      getClientIdentity: vi.fn(),
      claim: vi.fn(async () => ({ kind: 'blocked' as const })),
      waitForReady: vi.fn(), finish: vi.fn(), recover: vi.fn(), reconcile: vi.fn(),
    };
    const asaas = { criarCliente: vi.fn(), listarClientesPorReferencia: vi.fn() };

    await expect(getOrCreateCardCustomer({ clienteId: clienteA, ambiente, store, asaas }))
      .resolves.toEqual({ ok: false, code: 'CLIENTE_INDISPONIVEL' });
    expect(asaas.criarCliente).not.toHaveBeenCalled();
    expect(asaas.listarClientesPorReferencia).not.toHaveBeenCalled();
  });
});
