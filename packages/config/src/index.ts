/**
 * @keepit/config — placeholders financeiros/operacionais do MVP Keepit.
 *
 * Todos os valores abaixo são PLACEHOLDERS: já aprovados para uso em
 * código/UI do MVP, mas o valor definitivo será fechado com o stakeholder
 * antes do lançamento. NUNCA hard-code esses valores em mocks/telas —
 * sempre importe de `businessConfig`.
 *
 * Fonte de cada valor: docs/PERGUNTAS_REGRAS_NEGOCIO.md (Decisões fechadas,
 * Rodada 6) — ver também docs/stories/0.2.story.md#Dev Notes para o
 * mapeamento completo linha a linha.
 *
 * Convenção de nomenclatura das chaves (decisão do @dev, Story 0.2):
 * camelCase em inglês, com sufixo indicando a unidade quando não óbvio
 * (`Percent`, `Reais`, `Min`, `Dias`). Isso evita ambiguidade quando o
 * mesmo conceito (ex.: "tempo") aparece em minutos em um lugar e dias em
 * outro.
 */
export const businessConfig = {
  /**
   * Taxa Keepit sobre subtotal_produtos_reais do pedido, cobrada do LOJISTA
   * (nunca exibida ao cliente — deduzida internamente do repasse, Épico 7).
   * Fechada em 10% pela Rodada 8 (`docs/PERGUNTAS_REGRAS_NEGOCIO.md`, linha
   * 561), corrigindo o placeholder de 12% (Rodada 6). Story 6.2 (Onda 5) é
   * quem aplica essa troca junto com os testes de `@keepit/config`.
   */
  taxaKeepitPercent: 10,
  /**
   * Taxa fixa (NÃO percentual) cobrada do CLIENTE por pedido, exibida no
   * checkout como "Taxa de serviço". [!] PROVISÓRIA — recomendação do dev
   * (Story 6.2, Rodada 8, `docs/PERGUNTAS_REGRAS_NEGOCIO.md` linhas 562-563),
   * PENDENTE de ratificação do stakeholder. Nunca remover o indicador visual
   * de "provisório" no checkout enquanto essa pendência não for fechada por
   * uma Story futura.
   */
  taxaServicoCompradorReais: 2.9,
  /** Valor mínimo de saque do lojista (saques.valor_reais >= 200). Fonte: linha 318. */
  saqueMinimoReais: 200,
  /** Taxa fixa debitada do lojista em caso de chargeback. Fonte: linha 319. */
  taxaChargebackReais: 40,
  /** Ticket mínimo global — fallback quando a loja não define o próprio (estabelecimentos.ticket_minimo_reais IS NULL). Fonte: linhas 429-432. */
  ticketMinimoReais: 20,
  /** Timeout para o lojista aceitar um pedido antes do cancelamento automático. Fonte: linha 331. */
  timeoutAceiteMin: 10,
  /** Número máximo de tentativas de PIN do lojista antes do bloqueio. Fonte: linha 425. */
  pinTentativasMax: 5,
  /** Duração do bloqueio após esgotar as tentativas de PIN (auto-libera). Fonte: linha 425. */
  pinBloqueioMin: 5,
  /** Dias após a entrega até o saldo do lojista sair de "bloqueado" para "disponível" (D+7). Fonte: linhas 317/383. */
  carteiraLiberacaoDias: 7,
  /** Janela de tolerância no encontro cliente/lojista dentro do hub. Fonte: linha 335. */
  janelaToleranciaHubMin: 10,
  /**
   * Margem de segurança do checkout (Story 6.3, AC1, AC4) — usada na
   * validação temporal síncrona: `agora + tempo_medio_entrega_min +
   * margemHorarioPedidoMin <= hora_fecha do hub hoje`. Valor (10 min) vem
   * literalmente do texto do épico (`docs/prd/epics/6-pedido-pin.md` Story
   * 6.3 AC1), não é um placeholder pendente de stakeholder. DISTINTA de
   * `janelaToleranciaHubMin` (tolerância no ENCONTRO cliente/lojista
   * DENTRO do hub, fase pós-retirada, Story 6.14) — mesmo valor numérico
   * por coincidência, conceitos diferentes, não reaproveitar um pelo outro.
   */
  margemHorarioPedidoMin: 10,
  /**
   * Matriz de cancelamento (Story 1.10, Task 9) — percentuais de reembolso
   * por fase, fechados na Rodada 2 de `docs/PERGUNTAS_REGRAS_NEGOCIO.md`.
   * Promovido de `apps/cliente/src/lib/cancelamentoPolicy.ts` (Story 0.7),
   * que hard-codava esses valores localmente.
   */
  /** Cliente cancela antes do aceite do lojista → reembolso integral. */
  cancelamentoAntesAceitePercent: 100,
  /** Cliente cancela após aceite, antes de "Saindo para o hub" → % ao cliente. */
  cancelamentoAposAceitePercentCliente: 90,
  /** Cliente cancela após aceite, antes de "Saindo para o hub" → % retido pelo lojista. */
  cancelamentoAposAceitePercentLojista: 10,
  /** Cliente não aparece no hub dentro da janela de tolerância → % ao cliente. */
  clienteNaoApareceuPercentCliente: 20,
  /** Cliente não aparece no hub dentro da janela de tolerância → % retido pelo lojista. */
  clienteNaoApareceuPercentLojista: 80,
  /** Lojista não aparece no hub → reembolso integral ao cliente + falha de qualidade do lojista. */
  lojistaNaoVeioPercent: 100,
} as const;

export type BusinessConfig = typeof businessConfig;

export { CATEGORIA_OPTIONS, CATEGORIA_PRODUTO_OPTIONS, type CategoriaOption } from './business-rules';
export { SUPORTE_WHATSAPP_DISPONIVEL, SUPORTE_WHATSAPP_NUMERO } from './support-contact';
