import type { AsyncCallOptions } from '../types';

/**
 * Contrato de envio de SMS preparado para uma futura integração de provider.
 * O MVP não configura Zenvia nem envia mensagens reais; consumidores usam a
 * mesma porta com o mock enquanto a contratação permanece pendente.
 */
export interface SmsMessage {
  destinatario: string;
  conteudo: string;
  /** Identificador de negócio para correlação, sem expor o conteúdo em logs. */
  referencia: string;
}

export interface SmsDelivery {
  id: string;
  provider: 'mock' | 'zenvia';
  status: 'queued';
}

export interface SmsPort {
  send(message: SmsMessage, options?: AsyncCallOptions): Promise<SmsDelivery>;
}
