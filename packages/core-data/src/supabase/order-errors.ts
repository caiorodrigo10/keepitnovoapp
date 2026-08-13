/**
 * Story 6.6 (AC3) — [IDS] ADAPT do padrão já validado em
 * `estabelecimento-cadastro-errors.ts` (Story 3.5)/`auth-errors.ts` (Story
 * 2.3): classes de erro dedicadas para os 6 erros NOMEADOS que a RPC
 * `criar_pedido`
 * (`apps/supabase/supabase/migrations/20260813004934_rpc_criar_pedido.sql`)
 * levanta via `RAISE EXCEPTION '<CODIGO>'`. `supabase-js` propaga o texto do
 * `RAISE EXCEPTION` em `error.message` (exceção customizada de PL/pgSQL cai
 * no SQLSTATE genérico `P0001`, sem código dedicado) — por isso o adapter
 * (`order.supabase.ts`) faz `.includes()` no texto, não uma comparação de
 * `error.code`, mesmo padrão já usado por `criarCadastro`.
 */

/** RPC: `AUTENTICACAO_NECESSARIA` — sem sessão de cliente (`auth.uid()` nulo). */
export class AutenticacaoNecessariaError extends Error {
  constructor() {
    super('[core-data] criar_pedido — sessão de cliente ausente (AUTENTICACAO_NECESSARIA)');
    this.name = 'AutenticacaoNecessariaError';
  }
}

/** RPC: `CLIENTE_NAO_ENCONTRADO` — sessão autenticada sem linha correspondente em `public.clientes`. */
export class ClienteNaoEncontradoError extends Error {
  constructor() {
    super('[core-data] criar_pedido — usuário autenticado sem perfil de cliente (CLIENTE_NAO_ENCONTRADO)');
    this.name = 'ClienteNaoEncontradoError';
  }
}

/** RPC: `ITENS_INVALIDOS` — `p_itens` não é um array JSON não-vazio. */
export class ItensInvalidosError extends Error {
  constructor() {
    super('[core-data] criar_pedido — itens inválidos, esperado ao menos 1 item (ITENS_INVALIDOS)');
    this.name = 'ItensInvalidosError';
  }
}

/** RPC: `LOJA_INDISPONIVEL` — estabelecimento inexistente, inativo, pausado ou excluído. */
export class LojaIndisponivelError extends Error {
  constructor() {
    super('[core-data] criar_pedido — loja indisponível (inativa, pausada ou excluída) (LOJA_INDISPONIVEL)');
    this.name = 'LojaIndisponivelError';
  }
}

/**
 * RPC: `HUB_NAO_ATENDIDO` — o par `(estabelecimento_id, hub_id)` não existe
 * em `estabelecimentos_hubs` (BR-HUB, `03-data-models.md` §2.3).
 */
export class HubNaoAtendidoError extends Error {
  constructor() {
    super('[core-data] criar_pedido — a loja não atende o hub informado (HUB_NAO_ATENDIDO)');
    this.name = 'HubNaoAtendidoError';
  }
}

/** RPC: `HUB_INDISPONIVEL` — hub inexistente ou inativo. */
export class HubIndisponivelError extends Error {
  constructor() {
    super('[core-data] criar_pedido — hub inexistente ou inativo (HUB_INDISPONIVEL)');
    this.name = 'HubIndisponivelError';
  }
}

/**
 * Story 6.9 (AC2) — erros NOMEADOS da RPC `aceitar_pedido`
 * (`apps/supabase/supabase/migrations/20260813004935_rpc_aceitar_pedido.sql`).
 * `AUTENTICACAO_NECESSARIA` é REUSE da classe já declarada acima
 * (`criar_pedido` levanta o mesmo código — mesma causa raiz: sessão ausente).
 */

/** RPC: `TEMPO_ESTIMADO_INVALIDO` — `p_tempo_estimado_min` nulo ou <= 0. */
export class TempoEstimadoInvalidoError extends Error {
  constructor() {
    super('[core-data] aceitar_pedido — tempo estimado inválido, esperado > 0 (TEMPO_ESTIMADO_INVALIDO)');
    this.name = 'TempoEstimadoInvalidoError';
  }
}

/** RPC: `PEDIDO_NAO_ENCONTRADO` — nenhum pedido com o id informado. */
export class PedidoNaoEncontradoError extends Error {
  constructor() {
    super('[core-data] aceitar_pedido — nenhum pedido com o id informado (PEDIDO_NAO_ENCONTRADO)');
    this.name = 'PedidoNaoEncontradoError';
  }
}

/** RPC: `ACESSO_NEGADO` — pedido existe mas não é do lojista chamador (nem admin). */
export class AcessoNegadoError extends Error {
  constructor() {
    super('[core-data] aceitar_pedido — pedido não pertence ao lojista autenticado (ACESSO_NEGADO)');
    this.name = 'AcessoNegadoError';
  }
}

/**
 * RPC: `ESTADO_INVALIDO` — o pedido já não está em `aguardando_aceite`
 * (proteção contra dupla-aceitação: dois toques em "Confirmar" ou dois
 * lojistas tentando aceitar o mesmo pedido). Story 6.15 (AC2) — REUSE: a RPC
 * `confirmar_pin_pedido` levanta o MESMO código para "pedido fora de
 * `no_hub`" (mesma causa raiz: pré-condição de estado violada).
 */
export class EstadoInvalidoError extends Error {
  constructor() {
    super('[core-data] pedido em estado que não admite a operação (ESTADO_INVALIDO)');
    this.name = 'EstadoInvalidoError';
  }
}

/**
 * Story 6.12 (AC2, AC6) — erro NOMEADO da RPC `avancar_estado_pedido`
 * (`apps/supabase/supabase/migrations/20260813022931_rpc_avancar_estado_pedido.sql`):
 * o alvo pedido está fora do conjunto que a RPC produz, OU o par
 * (status atual → alvo) não é uma transição permitida no piloto — inclui a
 * proteção contra dupla-execução (ex.: pedido já `saindo_hub` recebendo
 * `p_novo_status='saindo_hub'` de novo). `PEDIDO_NAO_ENCONTRADO`/
 * `ACESSO_NEGADO`/`AUTENTICACAO_NECESSARIA` são REUSE das classes já
 * declaradas acima (mesma causa raiz da RPC `aceitar_pedido`).
 */
export class TransicaoInvalidaError extends Error {
  constructor() {
    super('[core-data] avancar_estado_pedido — transição de status não permitida a partir do estado atual (TRANSICAO_INVALIDA)');
    this.name = 'TransicaoInvalidaError';
  }
}
