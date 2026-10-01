import { describe, expect, it } from 'vitest';
import type { SupportCase } from '@keepit/core-data';
import { currentSupportCase } from './currentSupportCase';

const makeCase = (id: string, criadoEm: string): SupportCase => ({ id, pedidoId: 'pedido-1', tipo: 'cancelamento', estado: 'negada', motivo: 'Teste', motivoDecisao: null, criadoEm, encerradaEm: null, operacaoId: id });

describe('currentSupportCase', () => {
  it('seleciona o caso mais recente independentemente da ordem recebida', () => {
    const antigo = makeCase('antigo', '2026-09-01T00:00:00Z');
    const atual = makeCase('atual', '2026-10-01T00:00:00Z');
    expect(currentSupportCase([atual, antigo], 'pedido-1')?.id).toBe('atual');
    expect(currentSupportCase([antigo, atual], 'pedido-1')?.id).toBe('atual');
    expect(currentSupportCase([antigo], 'outro-pedido')).toBeNull();
  });
});
