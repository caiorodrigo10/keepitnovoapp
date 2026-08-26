import { businessConfig } from '@keepit/config';

/**
 * Story 7.8 (AC1, AC4) — [IDS] ADAPT do padrão já validado em
 * `order-errors.ts` (Story 6.6)/`estabelecimento-cadastro-errors.ts`
 * (Story 3.5): classes de erro dedicadas para os 4 erros NOMEADOS que a RPC
 * `solicitar_saque`
 * (`apps/supabase/supabase/migrations/20260813050004_rpc_solicitar_saque.sql`)
 * levanta via `RAISE EXCEPTION '<CODIGO>'`. `supabase-js` propaga o texto do
 * `RAISE EXCEPTION` em `error.message` (sem SQLSTATE dedicado — exceção
 * customizada de PL/pgSQL cai no genérico `P0001`) — por isso o adapter
 * (`wallet.supabase.ts`) faz `.includes()` no texto, não uma comparação de
 * `error.code`, mesmo padrão já usado por `order.supabase.ts`.
 *
 * As mensagens já são o texto exibido diretamente ao lojista — `Carteira.tsx`
 * (`onSolicitarSaque`) usa `error.message` sem transformação (AC4), então o
 * texto é escrito em português claro (com o código entre parênteses, ao
 * final, para rastreabilidade — mesma convenção das demais classes de erro
 * do projeto).
 */

/** RPC: `AUTENTICACAO_NECESSARIA` — sem sessão de lojista (`auth.uid()` nulo). */
export class AutenticacaoNecessariaError extends Error {
  constructor() {
    super('Sessão expirada. Faça login novamente para solicitar o saque (AUTENTICACAO_NECESSARIA).');
    this.name = 'AutenticacaoNecessariaError';
  }
}

/** RPC: `ESTABELECIMENTO_NAO_ENCONTRADO` — o autor não é dono de nenhum estabelecimento. */
export class EstabelecimentoNaoEncontradoError extends Error {
  constructor() {
    super('Nenhum estabelecimento encontrado para esta conta (ESTABELECIMENTO_NAO_ENCONTRADO).');
    this.name = 'EstabelecimentoNaoEncontradoError';
  }
}

/** RPC: `VALOR_MINIMO_SAQUE` — `p_valor_centavos` nulo ou abaixo de `businessConfig.saqueMinimoReais`. */
export class ValorMinimoSaqueError extends Error {
  constructor() {
    super(
      `Valor mínimo de saque: R$ ${businessConfig.saqueMinimoReais.toFixed(2).replace('.', ',')} (VALOR_MINIMO_SAQUE).`,
    );
    this.name = 'ValorMinimoSaqueError';
  }
}

/** RPC: `SALDO_INSUFICIENTE` — o valor solicitado excede `saldo_disponivel_reais`. */
export class SaldoInsuficienteError extends Error {
  constructor() {
    super('Saldo disponível insuficiente para o saque solicitado (SALDO_INSUFICIENTE).');
    this.name = 'SaldoInsuficienteError';
  }
}
