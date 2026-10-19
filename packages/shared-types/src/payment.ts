/** Projeção pública compartilhada por adapters e Edge Functions; sem claim ou segredo. */
export interface PaymentAttempt {
  id: string;
  pedidoId: string;
  /** Identidade não sensível para retomar a mesma operação após reabrir o app. */
  operacaoId?: string;
  estado: 'criando' | 'pendente' | 'confirmado' | 'recebido' | 'recusado' | 'expirado' | 'reconciliacao';
  pix?: { imagemBase64: string; copiaCola: string; expiraEm: string | null };
  /** A cobrança permanece válida; somente o salvamento do cartão falhou. */
  avisoCartao?: 'nao_salvo';
}
