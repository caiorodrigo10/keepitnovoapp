/** Resolução durável do customer Asaas vinculado à conta, nunca ao titular do cartão. */

export type CardEnvironment = 'sandbox' | 'producao';

export interface CardCustomerIdentity {
  id: string;
  nome: string;
  cpf: string;
}

export type CardCustomerClaim =
  | { kind: 'ready'; customerId: string }
  | { kind: 'acquired'; claimToken: string }
  | { kind: 'busy' }
  | { kind: 'reconciliation' }
  | { kind: 'blocked' };

export interface CardCustomerStore {
  getClientIdentity(input: { clienteId: string }): Promise<CardCustomerIdentity | null>;
  claim(input: { clienteId: string; ambiente: CardEnvironment }): Promise<CardCustomerClaim>;
  waitForReady(input: { clienteId: string; ambiente: CardEnvironment }): Promise<string | null>;
  finish(input: { clienteId: string; ambiente: CardEnvironment; claimToken: string; customerId: string }): Promise<void>;
  recover(input: { clienteId: string; ambiente: CardEnvironment; customerId: string }): Promise<void>;
  reconcile(input: { clienteId: string; ambiente: CardEnvironment; claimToken?: string }): Promise<void>;
}

interface CustomerGateway {
  criarCliente(input: { name: string; cpfCnpj: string; externalReference: string }): Promise<
    | { ok: true; data: { id: string } }
    | { ok: false; error: unknown }
  >;
  listarClientesPorReferencia(reference: string): Promise<
    | { ok: true; data: { data: Array<{ id: string }>; hasMore: boolean } }
    | { ok: false; error: unknown }
  >;
}

export type CardCustomerResult = { ok: true; customerId: string } | { ok: false; code: 'CUSTOMER_RECONCILIACAO' | 'CLIENTE_INDISPONIVEL' };

/**
 * Cria somente sob claim persistido. Se o POST perdeu a resposta, a referência
 * externa (o UUID do cliente) é consultada antes de qualquer nova tentativa.
 */
export async function getOrCreateCardCustomer(input: {
  clienteId: string;
  ambiente: CardEnvironment;
  store: CardCustomerStore;
  asaas: CustomerGateway;
}): Promise<CardCustomerResult> {
  const recover = async (claimToken?: string): Promise<CardCustomerResult> => {
    const found = await input.asaas.listarClientesPorReferencia(input.clienteId);
    if (!found.ok || found.data.hasMore || found.data.data.length !== 1) return { ok: false, code: 'CUSTOMER_RECONCILIACAO' };
    const customerId = found.data.data[0].id;
    if (claimToken) await input.store.finish({ clienteId: input.clienteId, ambiente: input.ambiente, claimToken, customerId });
    else await input.store.recover({ clienteId: input.clienteId, ambiente: input.ambiente, customerId });
    return { ok: true, customerId };
  };
  const claim = await input.store.claim({ clienteId: input.clienteId, ambiente: input.ambiente });
  if (claim.kind === 'blocked') return { ok: false, code: 'CLIENTE_INDISPONIVEL' };
  if (claim.kind === 'ready') return { ok: true, customerId: claim.customerId };
  if (claim.kind === 'reconciliation') return recover();
  if (claim.kind === 'busy') {
    const customerId = await input.store.waitForReady({ clienteId: input.clienteId, ambiente: input.ambiente });
    return customerId ? { ok: true, customerId } : { ok: false, code: 'CUSTOMER_RECONCILIACAO' };
  }

  try {
    const identity = await input.store.getClientIdentity({ clienteId: input.clienteId });
    if (!identity) {
      await input.store.reconcile({ clienteId: input.clienteId, ambiente: input.ambiente, claimToken: claim.claimToken });
      return { ok: false, code: 'CLIENTE_INDISPONIVEL' };
    }
    const created = await input.asaas.criarCliente({
      name: identity.nome,
      cpfCnpj: identity.cpf,
      externalReference: identity.id,
    });
    if (created.ok) {
      await input.store.finish({ clienteId: input.clienteId, ambiente: input.ambiente, claimToken: claim.claimToken, customerId: created.data.id });
      return { ok: true, customerId: created.data.id };
    }

    return recover(claim.claimToken);
  } catch {
    // A claim existente impede um novo POST até a conciliação administrativa.
  }
  await input.store.reconcile({ clienteId: input.clienteId, ambiente: input.ambiente, claimToken: claim.claimToken });
  return { ok: false, code: 'CUSTOMER_RECONCILIACAO' };
}
