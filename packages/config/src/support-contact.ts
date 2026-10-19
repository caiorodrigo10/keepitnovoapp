/**
 * @keepit/config/support-contact — seam honesto do canal de suporte "Falar
 * com Keepit" (WhatsApp).
 *
 * [IDS] CREATE (Story 3.6) — WA-001 (`docs/orchestration/PENDENCIAS-CAIO.md`)
 * é uma pendência aberta do Caio ("Informar o número oficial de WhatsApp de
 * suporte") que bloqueia o botão "Falar com Keepit" em pelo menos 3 telas:
 * Stories 2.9 e 2.10 (App Cliente, ainda não implementadas) e 3.6 (App
 * Lojista, tela "Em análise"). Em vez de cada tela duplicar sua própria
 * checagem "o número já existe?", este arquivo centraliza o seam num único
 * lugar compartilhável entre apps — mesmo padrão de `./business-rules.ts`
 * (constante de negócio compartilhada entre Cliente/Lojista/Admin). Quando
 * WA-001 for respondido, a ativação do canal em todas as telas consumidoras
 * é a troca de UM valor aqui, sem redesenho de UI em nenhuma tela.
 *
 * `null` é o valor deliberado até a resposta chegar — sinaliza "canal
 * indisponível" para quem consome. Nunca usar um número placeholder (ex.:
 * "5511999999999"): um valor desses poderia vazar para um destino
 * executável (`wa.me/...`, `tel:...`) e abrir uma conversa real com um
 * número inventado, o que a Story 3.6 (AC2, ajuste @po 2026-08-12) proíbe
 * explicitamente.
 */
export const SUPORTE_WHATSAPP_NUMERO: string | null = null;

/**
 * Flag derivada — telas consumidoras usam para decidir o estado
 * (desabilitado / placeholder rotulado) do botão "Falar com Keepit" sem
 * precisar checar `SUPORTE_WHATSAPP_NUMERO !== null` em cada lugar.
 */
export const SUPORTE_WHATSAPP_DISPONIVEL: boolean = SUPORTE_WHATSAPP_NUMERO !== null;
