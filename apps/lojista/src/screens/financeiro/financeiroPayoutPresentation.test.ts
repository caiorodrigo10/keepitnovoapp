import { describe, expect, it } from 'vitest';
import { paidThisMonth } from './financeiroPayoutPresentation';

describe('histórico financeiro', () => {
  it('conta só PIX concluído no mês da confirmação, sem confundir reserva com saque', () => {
    const base = { id: 'a', estabelecimento_id: 'loja', valor_reais: 100, solicitado_em: '2026-09-28T20:00:00Z', processado_em: null };
    expect(paidThisMonth([
      { ...base, status: 'solicitado', concluido_em: null },
      { ...base, id: 'b', status: 'concluido', concluido_em: '2026-10-02T12:00:00Z' },
    ], new Date('2026-10-15T12:00:00Z'))).toBe(100);
  });
});
