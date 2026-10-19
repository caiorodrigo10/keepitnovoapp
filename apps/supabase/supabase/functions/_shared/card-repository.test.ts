import { describe, expect, it, vi } from 'vitest';
import { createCardRepository } from './card-repository';

describe('CardRepository', () => {
  it('registra a escolha de salvar antes do gateway e nunca devolve token no resultado público', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'op_1', estado: 'preparada', salvarCartao: true, token: 'must-not-leak' }, error: null }));
    const repository = createCardRepository({ rpc });

    await expect(repository.registrarCompra({
      clienteId: 'cliente_1', tentativaId: 'tentativa_1', operacaoId: 'operacao_1', salvarCartao: true, cartaoSalvoId: null, ambiente: 'sandbox',
    })).resolves.toEqual({ id: 'op_1', estado: 'preparada', salvarCartao: true, avisoCodigo: null });
    expect(rpc).toHaveBeenCalledWith('registrar_operacao_cartao_service', expect.objectContaining({
      p_cliente_id: 'cliente_1', p_tentativa_id: 'tentativa_1', p_operacao_id: 'operacao_1', p_contexto: 'compra', p_salvar_cartao: true,
    }));
  });

  it('obtém segredo somente pelo RPC privado de servidor', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'card_1', customerId: 'cus_1', token: 'synthetic_secret', bandeira: 'VISA', ultimo4: '1234' }, error: null }));
    const repository = createCardRepository({ rpc });

    await expect(repository.obterCartao({ clienteId: 'cliente_1', cartaoId: 'card_1', ambiente: 'sandbox' })).resolves.toEqual({
      id: 'card_1', customerId: 'cus_1', token: 'synthetic_secret', bandeira: 'VISA', ultimo4: '1234',
    });
    expect(rpc).toHaveBeenCalledWith('obter_cartao_operacao_service', { p_cliente_id: 'cliente_1', p_cartao_id: 'card_1', p_ambiente: 'sandbox' });
  });

  it('espera uma claim em andamento e reutiliza customer pronto sem criar novo', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { estado: 'criando', acquired: false }, error: null })
      .mockResolvedValueOnce({ data: { estado: 'pronto', acquired: false, customerId: 'cus_1' }, error: null });
    const repository = createCardRepository({ rpc }, { sleep: async () => undefined });

    await expect(repository.customerStore.waitForReady({ clienteId: 'cliente_1', ambiente: 'sandbox' })).resolves.toBe('cus_1');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('claim_cliente_asaas_service', { p_cliente_id: 'cliente_1', p_ambiente: 'sandbox' });
  });

  it('projects the durable deletion lock as a blocked customer claim', async () => {
    const repository = createCardRepository({ rpc: vi.fn(async () => ({ data: null, error: new Error('CONTA_EM_EXCLUSAO') })) });

    await expect(repository.customerStore.claim({ clienteId: 'cliente_1', ambiente: 'sandbox' }))
      .resolves.toEqual({ kind: 'blocked' });
  });

  it('projects the normal PostgREST deletion error as blocked too', async () => {
    const repository = createCardRepository({ rpc: vi.fn(async () => ({ data: null, error: { code: 'P0001', message: 'CONTA_EM_EXCLUSAO', details: '', hint: '' } })) });
    await expect(repository.customerStore.claim({ clienteId: 'cliente_1', ambiente: 'sandbox' }))
      .resolves.toEqual({ kind: 'blocked' });
  });
});
