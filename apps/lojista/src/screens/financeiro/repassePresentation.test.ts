import { describe, expect, it } from 'vitest';
import type { Repasse } from '@keepit/core-data';
import { nextRepasse, repasseLabel, semanaLabel } from './repassePresentation';

const batch = (estado: Repasse['estado'], previstoPara: string): Repasse => ({
  id: `${estado}-${previstoPara}`, estabelecimentoId: 'loja-1', semanaInicio: '2026-09-28',
  previstoPara, valorCentavos: 9500, estado, destinatarioNome: null,
  destinatarioResponsavel: null, chavePix: null, chavePixTipo: null,
  referencia: null, preparadoEm: null, confirmadoEm: null,
});

describe('apresentação de repasses', () => {
  it('não transforma vencimento em pagamento', () => {
    expect(repasseLabel('pendente')).toBe('Aguardando pagamento');
    expect(repasseLabel('pago')).toBe('Pago');
    expect(repasseLabel('previsto')).toBe('Previsto');
    expect(repasseLabel('em_analise')).toBe('Em análise');
    expect(nextRepasse([batch('pendente', '2026-09-01')], 'loja-1')?.estado).toBe('pendente');
  });

  it('escolhe a previsão/lote aberto da loja e usa datas locais sem deslocamento UTC', () => {
    expect(nextRepasse([batch('pago', '2026-09-19'), batch('previsto', '2026-10-09')], 'loja-1')?.estado).toBe('previsto');
    expect(nextRepasse([batch('pendente', '2026-10-09')], 'outra')).toBeNull();
    expect(semanaLabel('2026-09-28')).toBe('28/09 a 04/10');
  });
});
