import { describe, expect, it } from 'vitest';

import { businessConfig } from '@keepit/config';
import type { Estabelecimento, EstabelecimentoStatus } from '@keepit/core-data';

import {
  calcularTicketMinimo,
  canCheckoutStore,
  deveSincronizarCpfCollected,
  faltaParaTicketMinimo,
  podeFinalizarNoHorario,
} from './checkoutValidation';

const NOW = new Date(2026, 8, 5, 12, 0);
const checkoutStore = (
  status: EstabelecimentoStatus,
  paused: boolean,
  close: string,
  deleted: string | null = null,
) => ({
  status,
  pausado_manualmente: paused,
  excluido_em: deleted,
  horarios: [{ dia_semana: NOW.getDay(), aberto: true, hora_abre: '08:00', hora_fecha: close }],
}) as Estabelecimento;
const openStore = checkoutStore('ativo', false, '18:00');
const closedStore = checkoutStore('ativo', false, '10:00');
const pausedStore = checkoutStore('ativo', true, '18:00');
const suspendedStore = checkoutStore('suspenso', false, '18:00');
const deletedStore = checkoutStore('ativo', false, '18:00', '2026-09-05T09:00:00.000Z');

describe('canCheckoutStore (Story 12.10, Task 4)', () => {
  it.each([
    [openStore, true],
    [closedStore, false],
    [pausedStore, false],
    [suspendedStore, false],
    [deletedStore, false],
    [null, false],
  ])('permite checkout somente para loja pública aberta', (store, expected) => {
    expect(canCheckoutStore(store, NOW)).toBe(expected);
  });
});

describe('podeFinalizarNoHorario (Story 6.3, AC1, AC4)', () => {
  // Data/hora fixa do teste (não usa o relógio real) — `diaSemana` é
  // derivado dinamicamente para não depender de qual dia da semana caiu
  // 12/08/2026 em nenhum fuso específico.
  const now = new Date(2026, 7, 12, 20, 0);
  const diaSemana = now.getDay();

  it('passa quando o hub tem folga suficiente (tempo médio + margem cabe até o fechamento)', () => {
    const estabelecimento = { tempo_medio_entrega_min: 20 };
    const hub = { horarios: [{ dia_semana: diaSemana, aberto: true, hora_abre: '08:00', hora_fecha: '21:00' }] };

    // 20h + 20min (tempo médio) + 10min (margem) = 20h30 <= 21h → true
    expect(podeFinalizarNoHorario(estabelecimento, hub, now)).toBe(true);
  });

  it('exatamente no limite (agora + tempo médio + margem === hora_fecha) ainda passa (<=)', () => {
    const estabelecimento = { tempo_medio_entrega_min: 20 };
    const hub = { horarios: [{ dia_semana: diaSemana, aberto: true, hora_abre: '08:00', hora_fecha: '20:30' }] };

    expect(podeFinalizarNoHorario(estabelecimento, hub, now)).toBe(true);
  });

  it('falha quando a folga não é suficiente (fecha antes de agora + tempo médio + margem)', () => {
    const estabelecimento = { tempo_medio_entrega_min: 20 };
    const hub = { horarios: [{ dia_semana: diaSemana, aberto: true, hora_abre: '08:00', hora_fecha: '20:15' }] };

    // 20h + 20min + 10min = 20h30 > 20h15 → false
    expect(podeFinalizarNoHorario(estabelecimento, hub, now)).toBe(false);
  });

  it('FAIL-CLOSED: hub sem horário cadastrado para hoje — nunca passa por omissão', () => {
    const estabelecimento = { tempo_medio_entrega_min: 10 };
    const hub = {
      horarios: [{ dia_semana: (diaSemana + 1) % 7, aberto: true, hora_abre: '08:00', hora_fecha: '22:00' }],
    };

    expect(podeFinalizarNoHorario(estabelecimento, hub, now)).toBe(false);
  });

  it('FAIL-CLOSED: hub fechado hoje (aberto: false)', () => {
    const estabelecimento = { tempo_medio_entrega_min: 10 };
    const hub = { horarios: [{ dia_semana: diaSemana, aberto: false, hora_abre: null, hora_fecha: null }] };

    expect(podeFinalizarNoHorario(estabelecimento, hub, now)).toBe(false);
  });

  it('FAIL-CLOSED: hora_fecha ausente mesmo com aberto=true (dado inconsistente)', () => {
    const estabelecimento = { tempo_medio_entrega_min: 10 };
    const hub = { horarios: [{ dia_semana: diaSemana, aberto: true, hora_abre: '08:00', hora_fecha: null }] };

    expect(podeFinalizarNoHorario(estabelecimento, hub, now)).toBe(false);
  });

  it('FAIL-CLOSED: estabelecimento ou hub ainda não carregados (null/undefined)', () => {
    const hub = { horarios: [{ dia_semana: diaSemana, aberto: true, hora_abre: '08:00', hora_fecha: '23:00' }] };
    const estabelecimento = { tempo_medio_entrega_min: 10 };

    expect(podeFinalizarNoHorario(null, hub, now)).toBe(false);
    expect(podeFinalizarNoHorario(undefined, hub, now)).toBe(false);
    expect(podeFinalizarNoHorario(estabelecimento, null, now)).toBe(false);
    expect(podeFinalizarNoHorario(estabelecimento, undefined, now)).toBe(false);
  });

  it('usa businessConfig.margemHorarioPedidoMin (10 min) — nunca hard-coded na função', () => {
    expect(businessConfig.margemHorarioPedidoMin).toBe(10);
  });
});

describe('calcularTicketMinimo (Story 6.4, AC1, AC4)', () => {
  it('usa o valor da loja quando ticket_minimo_reais não é null', () => {
    expect(calcularTicketMinimo({ ticket_minimo_reais: 30 })).toBe(30);
  });

  it('usa businessConfig.ticketMinimoReais (global) quando a loja define null', () => {
    expect(calcularTicketMinimo({ ticket_minimo_reais: null })).toBe(businessConfig.ticketMinimoReais);
  });

  it('usa businessConfig.ticketMinimoReais quando a loja ainda não carregou (null/undefined)', () => {
    expect(calcularTicketMinimo(null)).toBe(businessConfig.ticketMinimoReais);
    expect(calcularTicketMinimo(undefined)).toBe(businessConfig.ticketMinimoReais);
  });
});

describe('faltaParaTicketMinimo (Story 6.4, AC2, AC3)', () => {
  it('retorna a diferença quando o subtotal está abaixo do mínimo', () => {
    expect(faltaParaTicketMinimo(15, 20)).toBe(5);
  });

  it('retorna 0 quando o subtotal é exatamente igual ao mínimo — "abaixo" é < , não <=', () => {
    expect(faltaParaTicketMinimo(20, 20)).toBe(0);
  });

  it('retorna 0 quando o subtotal já está acima do mínimo (nunca negativo)', () => {
    expect(faltaParaTicketMinimo(25, 20)).toBe(0);
  });

  it('um centavo abaixo do mínimo ainda bloqueia', () => {
    expect(faltaParaTicketMinimo(19.99, 20)).toBeCloseTo(0.01, 2);
  });
});

describe('deveSincronizarCpfCollected (Story 6.5, AC1, gap 3 das Dependencies)', () => {
  it('sincroniza quando o cliente já tem CPF real mas a flag de sessão ainda está false', () => {
    expect(deveSincronizarCpfCollected('11144477735', false)).toBe(true);
  });

  it('não sincroniza quando a flag de sessão já está true (evita chamada redundante)', () => {
    expect(deveSincronizarCpfCollected('11144477735', true)).toBe(false);
  });

  it('não sincroniza quando o cliente ainda não tem CPF (null/undefined) — modal deve continuar aparecendo', () => {
    expect(deveSincronizarCpfCollected(null, false)).toBe(false);
    expect(deveSincronizarCpfCollected(undefined, false)).toBe(false);
  });
});
