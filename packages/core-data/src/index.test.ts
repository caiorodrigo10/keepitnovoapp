import { afterEach, describe, expect, it } from 'vitest';

import { __resetDataClientForTests, createDataClient, getDataClient } from './index';

describe('createDataClient', () => {
  it('defaults to source "mock" and exposes the 8 ports (7 do Épico 0 + analytics, Story 1.10)', async () => {
    const client = createDataClient();

    expect(client.auth).toBeDefined();
    expect(client.hub).toBeDefined();
    expect(client.store).toBeDefined();
    expect(client.product).toBeDefined();
    expect(client.order).toBeDefined();
    expect(client.wallet).toBeDefined();
    expect(client.admin).toBeDefined();
    expect(client.analytics).toBeDefined();

    const hubs = await client.hub.listNearby();
    expect(hubs.length).toBeGreaterThan(0);
  });

  it('resolves source "supabase" to the 8 Supabase adapters — every method rejects with NotImplementedError (Story 1.9)', async () => {
    const client = createDataClient({ source: 'supabase' });

    expect(client.auth).toBeDefined();
    expect(client.hub).toBeDefined();
    expect(client.store).toBeDefined();
    expect(client.product).toBeDefined();
    expect(client.order).toBeDefined();
    expect(client.wallet).toBeDefined();
    expect(client.admin).toBeDefined();
    expect(client.analytics).toBeDefined();

    await expect(client.hub.listNearby()).rejects.toThrow(/implementar no Épico/);
  });

  it('creates isolated instances (no shared state between clients)', async () => {
    const clientA = createDataClient();
    const clientB = createDataClient();

    await clientA.product.create({
      estabelecimento_id: 'estab-farmacia-vida',
      nome: 'Produto exclusivo do client A',
      preco_reais: 10,
      categoria_produto: 'teste',
    });

    const produtosA = await clientA.product.list('estab-farmacia-vida');
    const produtosB = await clientB.product.list('estab-farmacia-vida');

    expect(produtosA.length).toBe(produtosB.length + 1);
  });
});

describe('getDataClient', () => {
  it('returns the same singleton instance across calls', () => {
    __resetDataClientForTests();
    const first = getDataClient();
    const second = getDataClient();
    expect(first).toBe(second);
    __resetDataClientForTests();
  });
});

describe('DATA_SOURCE env fallback (Story 1.9, AC4)', () => {
  const originalDataSource = process.env.DATA_SOURCE;

  afterEach(() => {
    if (originalDataSource === undefined) {
      delete process.env.DATA_SOURCE;
    } else {
      process.env.DATA_SOURCE = originalDataSource;
    }
  });

  it('defaults to mock when DATA_SOURCE is absent/empty and options.source is omitted (no regression)', async () => {
    delete process.env.DATA_SOURCE;
    const client = createDataClient();
    const hubs = await client.hub.listNearby();
    expect(hubs.length).toBeGreaterThan(0);
  });

  it('reads DATA_SOURCE="supabase" from env as fallback when options.source is omitted', async () => {
    process.env.DATA_SOURCE = 'supabase';
    const client = createDataClient();
    await expect(client.hub.listNearby()).rejects.toThrow(/implementar no Épico/);
  });

  it('options.source explicit always wins over DATA_SOURCE env', async () => {
    process.env.DATA_SOURCE = 'supabase';
    const client = createDataClient({ source: 'mock' });
    const hubs = await client.hub.listNearby();
    expect(hubs.length).toBeGreaterThan(0);
  });
});
