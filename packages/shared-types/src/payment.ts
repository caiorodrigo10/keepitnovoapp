/** Projeção pública compartilhada por adapters e Edge Functions; sem claim ou segredo. */
export interface PaymentAttempt {
  id: string;
  pedidoId: string;
  estado: 'criando' | 'pendente' | 'confirmado' | 'recebido' | 'recusado' | 'expirado' | 'reconciliacao';
  pix?: { imagemBase64: string; copiaCola: string; expiraEm: string | null };
}
