import { describe, expect, it, vi } from 'vitest';

import type { AsaasClient } from '../_shared/asaas';
import { handleCreatePixPayment } from './handler';
import type { PedidoParaCobranca, PedidosRepo } from './handler';

const PEDIDO_BASE: PedidoParaCobranca = {
  id: 'pedido-1',
  cliente_nome: 'Maria Silva',
  cliente_cpf: '24971563792',
  total_pago_reais: 42.5,
  asaas_payment_id: null,
  qr_code_pix: null,
  pix_copia_e_cola: null,
};

/** `AsaasClient` fake — só os 3 métodos usados pelo handler retornam algo; os
 * demais lançam se chamados (não deveriam ser, nesta Story). */
function fakeAsaasClient(overrides: Partial<AsaasClient> = {}): AsaasClient {
  const notUsed = (name: string) => {
    return vi.fn(() => {
      throw new Error(`[test] ${name} não deveria ter sido chamado nesta Story.`);
    });
  };
  return {
    criarCliente: notUsed('criarCliente') as unknown as AsaasClient['criarCliente'],
    criarCobranca: notUsed('criarCobranca') as unknown as AsaasClient['criarCobranca'],
    obterQrCodePix: notUsed('obterQrCodePix') as unknown as AsaasClient['obterQrCodePix'],
    estornarCobranca: notUsed('estornarCobranca') as unknown as AsaasClient['estornarCobranca'],
    criarTransferencia: notUsed('criarTransferencia') as unknown as AsaasClient['criarTransferencia'],
    criarSubconta: notUsed('criarSubconta') as unknown as AsaasClient['criarSubconta'],
    tokenizarCartao: notUsed('tokenizarCartao') as unknown as AsaasClient['tokenizarCartao'],
    ...overrides,
  };
}

/** `AsaasClient` cujos métodos lançam se qualquer um for chamado — usado no teste de idempotência. */
function asaasClientThatFailsIfCalled(): AsaasClient {
  return fakeAsaasClient();
}

function fakeRepo(pedido: PedidoParaCobranca | null) {
  const salvarCobrancaPix = vi.fn(async (_pedidoId: string, _fields: unknown): Promise<void> => undefined);
  const repo: PedidosRepo = {
    getById: vi.fn(async () => pedido),
    salvarCobrancaPix,
  };
  return { repo, salvarCobrancaPix };
}

describe('handleCreatePixPayment (Story 7.2, AC4)', () => {
  it('404 PEDIDO_NAO_ENCONTRADO quando o pedido não existe', async () => {
    const { repo } = fakeRepo(null);

    const result = await handleCreatePixPayment(
      { pedido_id: 'pedido-inexistente' },
      { asaasClient: asaasClientThatFailsIfCalled(), pedidos: repo },
    );

    expect(result).toEqual({
      ok: false,
      error: { status: 404, code: 'PEDIDO_NAO_ENCONTRADO', message: expect.stringContaining('pedido-inexistente') },
    });
  });

  it('idempotência: pedido já com cobrança persistida retorna direto, SEM chamar asaasClient', async () => {
    const pedidoComCobranca: PedidoParaCobranca = {
      ...PEDIDO_BASE,
      asaas_payment_id: 'pay_existente',
      qr_code_pix: 'base64-existente',
      pix_copia_e_cola: '000201-existente',
    };
    const { repo, salvarCobrancaPix } = fakeRepo(pedidoComCobranca);

    const result = await handleCreatePixPayment(
      { pedido_id: pedidoComCobranca.id },
      { asaasClient: asaasClientThatFailsIfCalled(), pedidos: repo },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        asaas_payment_id: 'pay_existente',
        qr_code_pix: 'base64-existente',
        pix_copia_e_cola: '000201-existente',
      },
    });
    expect(salvarCobrancaPix).not.toHaveBeenCalled();
  });

  it('422 CLIENTE_SEM_CPF quando cliente_cpf é nulo (defensivo)', async () => {
    const pedidoSemCpf: PedidoParaCobranca = { ...PEDIDO_BASE, cliente_cpf: null };
    const { repo } = fakeRepo(pedidoSemCpf);

    const result = await handleCreatePixPayment(
      { pedido_id: pedidoSemCpf.id },
      { asaasClient: asaasClientThatFailsIfCalled(), pedidos: repo },
    );

    expect(result).toEqual({
      ok: false,
      error: { status: 422, code: 'CLIENTE_SEM_CPF', message: expect.stringContaining(pedidoSemCpf.id) },
    });
  });

  it('caminho feliz completo: criarCliente → criarCobranca → obterQrCodePix → salvarCobrancaPix', async () => {
    const { repo, salvarCobrancaPix } = fakeRepo(PEDIDO_BASE);
    const criarCliente = vi.fn(async () => ({ ok: true as const, data: { id: 'cus_123', name: 'Maria Silva', cpfCnpj: '24971563792' } }));
    const criarCobranca = vi.fn(async () => ({
      ok: true as const,
      data: { id: 'pay_456', status: 'PENDING', value: 42.5, billingType: 'PIX' },
    }));
    const obterQrCodePix = vi.fn(async () => ({
      ok: true as const,
      data: { encodedImage: 'base64-qr', payload: '000201-copia-cola' },
    }));
    const asaasClient = fakeAsaasClient({ criarCliente, criarCobranca, obterQrCodePix } as Partial<AsaasClient>);
    const fixedNow = new Date('2026-08-27T12:00:00.000Z');

    const result = await handleCreatePixPayment(
      { pedido_id: PEDIDO_BASE.id },
      { asaasClient, pedidos: repo, now: () => fixedNow },
    );

    expect(result).toEqual({
      ok: true,
      data: { asaas_payment_id: 'pay_456', qr_code_pix: 'base64-qr', pix_copia_e_cola: '000201-copia-cola' },
    });
    expect(criarCliente).toHaveBeenCalledWith({
      name: 'Maria Silva',
      cpfCnpj: '24971563792',
      externalReference: 'pedido-1',
    });
    expect(criarCobranca).toHaveBeenCalledWith({
      customer: 'cus_123',
      billingType: 'PIX',
      value: 42.5,
      dueDate: '2026-08-27',
      externalReference: 'pedido-1',
    });
    expect(obterQrCodePix).toHaveBeenCalledWith('pay_456');
    expect(salvarCobrancaPix).toHaveBeenCalledWith('pedido-1', {
      asaas_payment_id: 'pay_456',
      qr_code_pix: 'base64-qr',
      pix_copia_e_cola: '000201-copia-cola',
    });
  });

  it('criarCliente falhando propaga o erro tipado e não chama criarCobranca/obterQrCodePix', async () => {
    const { repo, salvarCobrancaPix } = fakeRepo(PEDIDO_BASE);
    const criarCobranca = vi.fn();
    const obterQrCodePix = vi.fn();
    const asaasClient = fakeAsaasClient({
      criarCliente: vi.fn(async () => ({
        ok: false as const,
        error: { status: 400, code: 'invalid_cpfCnpj', message: 'CPF inválido' },
      })),
      criarCobranca: criarCobranca as unknown as AsaasClient['criarCobranca'],
      obterQrCodePix: obterQrCodePix as unknown as AsaasClient['obterQrCodePix'],
    });

    const result = await handleCreatePixPayment({ pedido_id: PEDIDO_BASE.id }, { asaasClient, pedidos: repo });

    expect(result).toEqual({ ok: false, error: { status: 400, code: 'invalid_cpfCnpj', message: 'CPF inválido' } });
    expect(criarCobranca).not.toHaveBeenCalled();
    expect(obterQrCodePix).not.toHaveBeenCalled();
    expect(salvarCobrancaPix).not.toHaveBeenCalled();
  });

  it('criarCobranca falhando propaga o erro tipado e não chama obterQrCodePix', async () => {
    const { repo, salvarCobrancaPix } = fakeRepo(PEDIDO_BASE);
    const obterQrCodePix = vi.fn();
    const asaasClient = fakeAsaasClient({
      criarCliente: vi.fn(async () => ({ ok: true as const, data: { id: 'cus_123', name: 'Maria Silva', cpfCnpj: '24971563792' } })),
      criarCobranca: vi.fn(async () => ({
        ok: false as const,
        error: { status: 0, code: undefined, message: 'Erro de rede ao chamar o Asaas.' },
      })),
      obterQrCodePix: obterQrCodePix as unknown as AsaasClient['obterQrCodePix'],
    });

    const result = await handleCreatePixPayment({ pedido_id: PEDIDO_BASE.id }, { asaasClient, pedidos: repo });

    expect(result).toEqual({
      ok: false,
      error: { status: 502, code: 'ASAAS_ERRO', message: 'Erro de rede ao chamar o Asaas.' },
    });
    expect(obterQrCodePix).not.toHaveBeenCalled();
    expect(salvarCobrancaPix).not.toHaveBeenCalled();
  });

  it('obterQrCodePix falhando propaga o erro tipado e não persiste', async () => {
    const { repo, salvarCobrancaPix } = fakeRepo(PEDIDO_BASE);
    const asaasClient = fakeAsaasClient({
      criarCliente: vi.fn(async () => ({ ok: true as const, data: { id: 'cus_123', name: 'Maria Silva', cpfCnpj: '24971563792' } })),
      criarCobranca: vi.fn(async () => ({
        ok: true as const,
        data: { id: 'pay_456', status: 'PENDING', value: 42.5, billingType: 'PIX' },
      })),
      obterQrCodePix: vi.fn(async () => ({
        ok: false as const,
        error: { status: 404, code: 'not_found', message: 'Cobrança não encontrada' },
      })),
    });

    const result = await handleCreatePixPayment({ pedido_id: PEDIDO_BASE.id }, { asaasClient, pedidos: repo });

    expect(result).toEqual({
      ok: false,
      error: { status: 404, code: 'not_found', message: 'Cobrança não encontrada' },
    });
    expect(salvarCobrancaPix).not.toHaveBeenCalled();
  });
});
