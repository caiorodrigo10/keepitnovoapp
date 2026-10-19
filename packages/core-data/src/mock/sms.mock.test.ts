import { describe, expect, it } from 'vitest';

import { createSmsMock } from './sms.mock';

describe('sms.mock', () => {
  it('enfileira uma mensagem sintética sem chamar provider externo', async () => {
    const sms = createSmsMock();

    await expect(
      sms.send({
        destinatario: '+5511999999999',
        conteudo: 'Código de teste 123456',
        referencia: 'pedido-sintetico-1',
      }, { delayMs: 0 }),
    ).resolves.toEqual({
      id: 'mock-sms-pedido-sintetico-1',
      provider: 'mock',
      status: 'queued',
    });
  });
});
