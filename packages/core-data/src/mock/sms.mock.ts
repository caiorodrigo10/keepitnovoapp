import type { SmsDelivery, SmsPort } from '../ports/sms.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';

/**
 * Mock sem efeitos externos: não persiste destinatário ou conteúdo e não
 * acessa Zenvia. A referência sintética torna a entrega determinística em testes.
 */
export function createSmsMock(): SmsPort {
  return {
    send(message, options?: AsyncCallOptions): Promise<SmsDelivery> {
      return simulateAsync(
        () => ({
          id: `mock-sms-${message.referencia}`,
          provider: 'mock',
          status: 'queued',
        }),
        { id: 'mock-sms-empty', provider: 'mock', status: 'queued' },
        options,
      );
    },
  };
}
