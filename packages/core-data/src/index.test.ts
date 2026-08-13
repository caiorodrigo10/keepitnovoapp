import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { __resetDataClientForTests, createDataClient, getDataClient } from './index';

describe('createDataClient', () => {
  it('defaults to source "mock" and exposes the 9 ports (7 do Épico 0 + analytics, Story 1.10 + lojistaAuth, Story 3.2)', async () => {
    const client = createDataClient();

    expect(client.auth).toBeDefined();
    expect(client.hub).toBeDefined();
    expect(client.store).toBeDefined();
    expect(client.product).toBeDefined();
    expect(client.order).toBeDefined();
    expect(client.wallet).toBeDefined();
    expect(client.admin).toBeDefined();
    expect(client.analytics).toBeDefined();
    expect(client.lojistaAuth).toBeDefined();

    const hubs = await client.hub.listNearby();
    expect(hubs.length).toBeGreaterThan(0);
  });

  it('resolves source "supabase" to the 9 Supabase adapters — every stub method rejects with NotImplementedError (Story 1.9)', async () => {
    const client = createDataClient({ source: 'supabase' });

    expect(client.auth).toBeDefined();
    expect(client.hub).toBeDefined();
    expect(client.store).toBeDefined();
    expect(client.product).toBeDefined();
    expect(client.order).toBeDefined();
    expect(client.wallet).toBeDefined();
    expect(client.admin).toBeDefined();
    expect(client.analytics).toBeDefined();
    expect(client.lojistaAuth).toBeDefined();

    // `hub.listNearby` era o sentinela histórico deste teste; `admin.refundQueue.list`
    // (Épico 8) virou implementação real no Bloco 09 — `store.getCatalog`
    // (método morto, sem consumidor real, ver `supabase-adapters.test.ts`)
    // é o novo stub sentinela (mesmo papel de sonda genérica).
    await expect(client.store.getCatalog(undefined as never)).rejects.toThrow(/implementar no Épico/);
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
    // Ver comentário acima (Bloco 09) — `store.getCatalog` substitui
    // `admin.refundQueue.list` como sonda genérica de stub.
    await expect(client.store.getCatalog(undefined as never)).rejects.toThrow(/implementar no Épico/);
  });

  it('options.source explicit always wins over DATA_SOURCE env', async () => {
    process.env.DATA_SOURCE = 'supabase';
    const client = createDataClient({ source: 'mock' });
    const hubs = await client.hub.listNearby();
    expect(hubs.length).toBeGreaterThan(0);
  });
});

describe('createDataClient — supabaseClient injetado (Story 2.5.1, AC3)', () => {
  /**
   * `auth.onAuthStateChange` (Story 2.3.1) é o único método já implementado
   * nos 8 adapters Supabase que toca o `SupabaseClient` de forma síncrona e
   * observável — por isso é o ponto de teste para provar que UM client
   * injetado é a instância de fato usada, em vez de cada adapter criar a
   * sua própria (bloqueador fechado em
   * `docs/architecture/06-session-persistence.md` §1.4(b)/§3.2). Os demais
   * 7 adapters aceitam o mesmo `client?` (ver `supabase-adapters.test.ts`),
   * mas todo método deles ainda lança `NotImplementedError` antes de tocar o
   * client (Story 1.9) — não há comportamento observável adicional a testar
   * até os Épicos 3+ implementarem os métodos de verdade.
   */
  it('repassa o supabaseClient injetado ao adapter de auth — onAuthStateChange usa a MESMA instância', () => {
    const onAuthStateChange = vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    const fakeSupabaseClient = {
      auth: { onAuthStateChange },
    } as unknown as SupabaseClient<Database>;

    const client = createDataClient({ source: 'supabase', supabaseClient: fakeSupabaseClient });
    const unsubscribe = client.auth.onAuthStateChange(() => {});

    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('repassa o supabaseClient injetado ao adapter lojistaAuth — signUp usa a MESMA instância (Story 3.2)', async () => {
    const signUp = vi.fn(async () => ({
      data: { user: { id: 'user-lojista', created_at: '2026-08-12T10:00:00.000Z', identities: [{ id: 'x' }] }, session: null },
      error: null,
    }));
    const fakeSupabaseClient = {
      auth: { signUp },
    } as unknown as SupabaseClient<Database>;

    const client = createDataClient({ source: 'supabase', supabaseClient: fakeSupabaseClient });
    await client.lojistaAuth.signUp({
      nome_fantasia: 'Farmácia Vida',
      cnpj: '11.222.333/0001-44',
      telefone: '(11) 91234-5678',
      responsavel_nome: 'Fulano de Tal',
      email: 'novo.lojista@example.com',
      senha: 'senha1234',
    });

    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it('supabaseClient omitido preserva o comportamento anterior (cada adapter cria/memoiza o próprio client)', async () => {
    const client = createDataClient({ source: 'supabase' });
    // Ver comentário acima (Bloco 09) — `store.getCatalog` substitui
    // `admin.refundQueue.list` como sonda genérica de stub.
    await expect(client.store.getCatalog(undefined as never)).rejects.toThrow(/implementar no Épico/);
  });
});
