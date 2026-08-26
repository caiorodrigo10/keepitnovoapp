import { describe, expect, it } from 'vitest';

import { tempoAceiteStatus, tempoAceiteTexto } from './tempoAceite';

/**
 * Story 6.8 (AC3, AC5) — testa a função PURA de tempo decorrido/prazo de
 * referência do aceite. `agora` é sempre injetado (nunca `new Date()` real)
 * — garante que o teste não depende de temporizador real, conforme os Dev
 * Notes da Story ("Date injetável/mockável").
 */
describe('tempoAceite — tempoAceiteStatus/tempoAceiteTexto (Story 6.8)', () => {
  const TIMEOUT_MIN = 10;

  it('pedido recém-criado: decorrido 0, restante = timeout, não vencido', () => {
    const criadoEm = '2026-08-13T10:00:00.000Z';
    const agora = new Date('2026-08-13T10:00:00.000Z');

    const status = tempoAceiteStatus(criadoEm, TIMEOUT_MIN, agora);
    expect(status).toEqual({ decorridoMin: 0, restanteMin: 10, vencido: false });
  });

  it('pedido próximo do prazo: decorrido 8min de 10, restante 2, ainda não vencido', () => {
    const criadoEm = '2026-08-13T10:00:00.000Z';
    const agora = new Date('2026-08-13T10:08:00.000Z');

    const status = tempoAceiteStatus(criadoEm, TIMEOUT_MIN, agora);
    expect(status).toEqual({ decorridoMin: 8, restanteMin: 2, vencido: false });
  });

  it('pedido além do prazo: decorrido 15min de 10, restante negativo, vencido — só exibição, nenhuma ação disparada', () => {
    const criadoEm = '2026-08-13T10:00:00.000Z';
    const agora = new Date('2026-08-13T10:15:00.000Z');

    const status = tempoAceiteStatus(criadoEm, TIMEOUT_MIN, agora);
    expect(status).toEqual({ decorridoMin: 15, restanteMin: -5, vencido: true });
  });

  it('tempoAceiteTexto exibe minutos restantes quando dentro do prazo', () => {
    const criadoEm = '2026-08-13T10:00:00.000Z';
    const agora = new Date('2026-08-13T10:04:00.000Z');

    expect(tempoAceiteTexto(criadoEm, TIMEOUT_MIN, agora)).toBe('Prazo de referência para aceite: 6 min');
  });

  it('tempoAceiteTexto exibe mensagem honesta quando o prazo já passou (sem sugerir cancelamento automático)', () => {
    const criadoEm = '2026-08-13T10:00:00.000Z';
    const agora = new Date('2026-08-13T10:15:00.000Z');

    const texto = tempoAceiteTexto(criadoEm, TIMEOUT_MIN, agora);
    expect(texto).toBe('Prazo de referência de 10 min para aceite já passou');
    expect(texto.toLowerCase()).not.toMatch(/cancela/);
  });
});
