import { expect, it } from 'vitest';
import { cancelamentoFaseFromStatus } from './cancelamentoPolicy';

it('solicita análise após aceite inclusive no hub', () => {
  expect(cancelamentoFaseFromStatus('aguardando_aceite')).toBe('antes_aceite');
  expect(cancelamentoFaseFromStatus('em_preparo')).toBe('em_analise');
  expect(cancelamentoFaseFromStatus('no_hub')).toBe('em_analise');
});
