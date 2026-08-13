import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import {
  AutenticacaoNecessariaError,
  EstabelecimentoNaoEncontradoError,
  SaldoInsuficienteError,
  ValorMinimoSaqueError,
} from './wallet-errors';
import { createWalletSupabase } from './wallet.supabase';

/**
 * Stories 7.7/7.8 — [IDS] REUSE do padrão de query builder encadeável já
 * estabelecido em `order.supabase.test.ts` (Stories 6.6+), estendido com
 * `.maybeSingle()`/`.rpc()` já existentes e sem necessidade de `.in()`/
 * `.gte()`/`.lt()` (não usados por `wallet.supabase.ts`).
 */
type QueryResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeClient(options: {
  rpc?: { data: unknown; error: unknown };
  carteira?: QueryResult;
  lancamentos?: QueryResult;
}) {
  const builders = {
    carteira_lojista: makeQueryBuilder(options.carteira ?? { data: null, error: null }),
    lancamentos_financeiros: makeQueryBuilder(options.lancamentos ?? { data: [], error: null }),
  };
  const from = vi.fn((table: string) => builders[table as 'carteira_lojista' | 'lancamentos_financeiros']);
  const rpc = vi.fn(async (_fn: string, _args: unknown) => options.rpc ?? { data: null, error: null });
  const client = { from, rpc } as unknown as SupabaseClient<Database>;
  return { client, rpc, builders };
}

const CARTEIRA_ROW = {
  estabelecimento_id: 'estab-1',
  saldo_disponivel_reais: 150.5,
  saldo_bloqueado_reais: 80,
  total_sacado_reais: 300,
  total_debitado_reais: 0,
};

describe('wallet.supabase.ts — getBalance (Story 7.7, AC1, AC4, AC5)', () => {
  it('consulta a view carteira_lojista filtrando por estabelecimento_id e retorna os 5 campos do contrato', async () => {
    const { client, builders } = fakeClient({ carteira: { data: CARTEIRA_ROW, error: null } });

    const port = createWalletSupabase(client);
    const carteira = await port.getBalance('estab-1');

    expect(builders.carteira_lojista.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-1');
    expect(carteira).toEqual(CARTEIRA_ROW);
  });

  it('lojista sem lançamentos (view sem linha) resolve saldo ZERO honesto, nunca erro', async () => {
    const { client } = fakeClient({ carteira: { data: null, error: null } });

    const port = createWalletSupabase(client);
    const carteira = await port.getBalance('estab-novo');

    expect(carteira).toEqual({
      estabelecimento_id: 'estab-novo',
      saldo_disponivel_reais: 0,
      saldo_bloqueado_reais: 0,
      total_sacado_reais: 0,
      total_debitado_reais: 0,
    });
  });

  it('propaga erro real de rede/RLS — nunca vira sucesso fictício', async () => {
    const { client } = fakeClient({ carteira: { data: null, error: { message: 'erro de rede', code: '500' } } });

    const port = createWalletSupabase(client);
    await expect(port.getBalance('estab-1')).rejects.toMatchObject({ message: 'erro de rede' });
  });
});

describe('wallet.supabase.ts — statement (Story 7.7, AC2, AC3, AC5)', () => {
  it('consulta lancamentos_financeiros tipo=payout do estabelecimento, ordenado por criado_em desc, mapeado para Saque[]', async () => {
    const { client, builders } = fakeClient({
      lancamentos: {
        data: [
          {
            id: 'lanc-2',
            estabelecimento_id: 'estab-1',
            valor_centavos: -25000,
            status: 'pendente',
            criado_em: '2026-08-13T12:00:00.000Z',
            concluido_em: null,
          },
          {
            id: 'lanc-1',
            estabelecimento_id: 'estab-1',
            valor_centavos: -20000,
            status: 'concluido',
            criado_em: '2026-08-10T09:00:00.000Z',
            concluido_em: '2026-08-11T09:00:00.000Z',
          },
        ],
        error: null,
      },
    });

    const port = createWalletSupabase(client);
    const statement = await port.statement('estab-1');

    expect(builders.lancamentos_financeiros.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-1');
    expect(builders.lancamentos_financeiros.eq).toHaveBeenCalledWith('tipo', 'payout');
    expect(builders.lancamentos_financeiros.order).toHaveBeenCalledWith('criado_em', { ascending: false });

    expect(statement).toEqual([
      {
        id: 'lanc-2',
        estabelecimento_id: 'estab-1',
        valor_reais: 250,
        status: 'solicitado',
        solicitado_em: '2026-08-13T12:00:00.000Z',
        processado_em: null,
        concluido_em: null,
      },
      {
        id: 'lanc-1',
        estabelecimento_id: 'estab-1',
        valor_reais: 200,
        status: 'concluido',
        solicitado_em: '2026-08-10T09:00:00.000Z',
        processado_em: null,
        concluido_em: '2026-08-11T09:00:00.000Z',
      },
    ]);
  });

  it('mês/estabelecimento sem saques resolve [] honesto', async () => {
    const { client } = fakeClient({ lancamentos: { data: [], error: null } });
    const port = createWalletSupabase(client);
    await expect(port.statement('estab-1')).resolves.toEqual([]);
  });
});

describe('wallet.supabase.ts — requestWithdrawal (Story 7.8, AC1-AC4, AC6, AC7)', () => {
  it('converte reais para centavos (Math.round) e chama solicitar_saque com p_valor_centavos', async () => {
    const { client, rpc } = fakeClient({
      rpc: {
        data: [
          {
            lancamento_id: 'lanc-1',
            estabelecimento_id: 'estab-1',
            valor_centavos: -25000,
            status: 'pendente',
            solicitado_em: '2026-08-13T12:00:00.000Z',
          },
        ],
        error: null,
      },
    });

    const port = createWalletSupabase(client);
    const saque = await port.requestWithdrawal('estab-1', 250);

    expect(rpc).toHaveBeenCalledWith('solicitar_saque', { p_valor_centavos: 25000 });
    expect(saque).toEqual({
      id: 'lanc-1',
      estabelecimento_id: 'estab-1',
      valor_reais: 250,
      status: 'solicitado',
      solicitado_em: '2026-08-13T12:00:00.000Z',
      processado_em: null,
      concluido_em: null,
    });
  });

  it('mapeia AUTENTICACAO_NECESSARIA para AutenticacaoNecessariaError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'AUTENTICACAO_NECESSARIA', code: 'P0001' } } });
    const port = createWalletSupabase(client);
    await expect(port.requestWithdrawal('estab-1', 250)).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('mapeia ESTABELECIMENTO_NAO_ENCONTRADO para EstabelecimentoNaoEncontradoError', async () => {
    const { client } = fakeClient({
      rpc: { data: null, error: { message: 'ESTABELECIMENTO_NAO_ENCONTRADO', code: 'P0001' } },
    });
    const port = createWalletSupabase(client);
    await expect(port.requestWithdrawal('estab-1', 250)).rejects.toBeInstanceOf(EstabelecimentoNaoEncontradoError);
  });

  it('mapeia VALOR_MINIMO_SAQUE para ValorMinimoSaqueError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'VALOR_MINIMO_SAQUE', code: 'P0001' } } });
    const port = createWalletSupabase(client);
    await expect(port.requestWithdrawal('estab-1', 10)).rejects.toBeInstanceOf(ValorMinimoSaqueError);
  });

  it('mapeia SALDO_INSUFICIENTE para SaldoInsuficienteError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'SALDO_INSUFICIENTE', code: 'P0001' } } });
    const port = createWalletSupabase(client);
    await expect(port.requestWithdrawal('estab-1', 999999)).rejects.toBeInstanceOf(SaldoInsuficienteError);
  });

  it('propaga qualquer outro erro sem mascarar e sem sucesso simulado', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'erro de rede', code: '500' } } });
    const port = createWalletSupabase(client);
    await expect(port.requestWithdrawal('estab-1', 250)).rejects.toMatchObject({ message: 'erro de rede' });
  });

  it('nunca dispara transferência PIX real — sucesso sempre resolve status pendente/solicitado (Bloco 09 executa manualmente)', async () => {
    const { client } = fakeClient({
      rpc: {
        data: [
          {
            lancamento_id: 'lanc-1',
            estabelecimento_id: 'estab-1',
            valor_centavos: -20000,
            status: 'pendente',
            solicitado_em: '2026-08-13T12:00:00.000Z',
          },
        ],
        error: null,
      },
    });
    const port = createWalletSupabase(client);
    const saque = await port.requestWithdrawal('estab-1', 200);
    expect(saque.status).toBe('solicitado');
    expect(saque.concluido_em).toBeNull();
  });
});
