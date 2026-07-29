import { beforeEach, describe, expect, it } from 'vitest';

import type { ProductPort } from '../ports/product.port';
import { createMockDb, type MockDb } from './db';
import { createProductMock } from './product.mock';

describe('product.mock (contract)', () => {
  let db: MockDb;
  let port: ProductPort;

  beforeEach(() => {
    db = createMockDb();
    port = createProductMock(db);
  });

  it('list resolves with active products for the estabelecimento', async () => {
    const produtos = await port.list('estab-farmacia-vida', { delayMs: 1 });
    expect(produtos.length).toBeGreaterThan(0);
    expect(produtos.every((p) => p.ativo)).toBe(true);
  });

  it('create resolves with a Produto matching the input shape', async () => {
    const produto = await port.create(
      {
        estabelecimento_id: 'estab-farmacia-vida',
        nome: 'Item de teste',
        preco_reais: 9.99,
        categoria_produto: 'teste',
      },
      { delayMs: 1 },
    );
    expect(produto).toMatchObject({
      nome: 'Item de teste',
      preco_reais: 9.99,
      ativo: true,
    });
  });

  it('pause sets ativo=false and it stops appearing in list()', async () => {
    const produto = await port.getById('produto-dipirona', { delayMs: 1 });
    expect(produto?.ativo).toBe(true);

    await port.pause('produto-dipirona', { delayMs: 1 });
    const produtos = await port.list('estab-farmacia-vida', { delayMs: 1 });
    expect(produtos.find((p) => p.id === 'produto-dipirona')).toBeUndefined();
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.list('estab-farmacia-vida', { delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.list('estab-farmacia-vida', { forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with an empty array', async () => {
    await expect(port.list('estab-farmacia-vida', { forceEmpty: true, delayMs: 1 })).resolves.toEqual([]);
  });

  it('update accepts ativo, reactivating a paused product (Story 1.10, Task 5)', async () => {
    await port.pause('produto-dipirona', { delayMs: 1 });
    const reativado = await port.update('produto-dipirona', { ativo: true }, { delayMs: 1 });
    expect(reativado.ativo).toBe(true);

    const produtos = await port.list('estab-farmacia-vida', { delayMs: 1 });
    expect(produtos.find((p) => p.id === 'produto-dipirona')).toBeDefined();
  });

  it('list with incluirInativos includes paused products but never soft-deleted ones (Story 1.10, Task 5)', async () => {
    await port.pause('produto-dipirona', { delayMs: 1 });
    await port.delete('produto-protetor-solar', { delayMs: 1 });

    const comInativos = await port.list('estab-farmacia-vida', { incluirInativos: true, delayMs: 1 });
    expect(comInativos.find((p) => p.id === 'produto-dipirona')).toBeDefined();
    expect(comInativos.find((p) => p.id === 'produto-protetor-solar')).toBeUndefined();
  });

  it('delete soft-deletes via excluido_em, never removing the row (Story 1.10, Task 5)', async () => {
    await port.delete('produto-dipirona', { delayMs: 1 });

    const produto = await port.getById('produto-dipirona', { delayMs: 1 });
    expect(produto).not.toBeNull();
    expect(produto?.excluido_em).not.toBeNull();

    const produtos = await port.list('estab-farmacia-vida', { delayMs: 1 });
    expect(produtos.find((p) => p.id === 'produto-dipirona')).toBeUndefined();
  });
});
