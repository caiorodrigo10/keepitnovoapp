import { afterEach, describe, expect, it } from 'vitest';

import { __resetDataClientForTests } from '@keepit/core-data';

import { PRODUTO_FOTO_MAX_BYTES, uploadFotoProduto, validarFotoProduto } from './produtoFoto';

describe('validarFotoProduto (Story 4.4, AC5)', () => {
  it('aceita jpeg/png/webp dentro do limite de 5MB', () => {
    expect(validarFotoProduto({ mimeType: 'image/jpeg', sizeBytes: 1024 })).toBeNull();
    expect(validarFotoProduto({ mimeType: 'image/png', sizeBytes: 1024 })).toBeNull();
    expect(validarFotoProduto({ mimeType: 'image/webp', sizeBytes: 1024 })).toBeNull();
  });

  it('rejeita MIME não suportado', () => {
    expect(validarFotoProduto({ mimeType: 'application/pdf', sizeBytes: 1024 })).toMatch(/formato inválido/i);
  });

  it('rejeita arquivo acima de 5MB', () => {
    expect(validarFotoProduto({ mimeType: 'image/jpeg', sizeBytes: PRODUTO_FOTO_MAX_BYTES + 1 })).toMatch(
      /muito grande/i,
    );
  });

  it('aceita exatamente no limite de 5MB', () => {
    expect(validarFotoProduto({ mimeType: 'image/jpeg', sizeBytes: PRODUTO_FOTO_MAX_BYTES })).toBeNull();
  });
});

describe('uploadFotoProduto (Story 4.4, AC4, AC5)', () => {
  afterEach(() => {
    __resetDataClientForTests();
    delete process.env.DATA_SOURCE;
  });

  it('rejeita ANTES de chamar a port quando a validação falha (nunca envia arquivo inválido)', async () => {
    await expect(
      uploadFotoProduto({ uri: 'file:///tmp/foto.gif', mimeType: 'image/gif', sizeBytes: 10 }),
    ).rejects.toThrow(/formato inválido/i);
  });

  it('delega para ProductPort.uploadFoto (mock) e devolve a uri/URL resultante', async () => {
    const url = await uploadFotoProduto({
      uri: 'blob:http://localhost/foto-produto',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    // Mock (`product.mock.ts#uploadFoto`) ecoa a MESMA uri — sem Storage real.
    expect(url).toBe('blob:http://localhost/foto-produto');
  });
});
