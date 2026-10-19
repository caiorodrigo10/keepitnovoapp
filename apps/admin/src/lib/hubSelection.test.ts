import { describe, expect, it } from 'vitest';

import { canSubmitHubApproval, isHubSelectionDisabled } from './hubSelection';

const hubs = [
  { id: 'ativo', ativo: true },
  { id: 'inativo', ativo: false },
];

describe('seleção administrativa de hubs', () => {
  it('bloqueia qualquer alteração durante o submit', () => {
    expect(isHubSelectionDisabled({ pending: true, hubAtivo: true, selecionado: true })).toBe(true);
    expect(isHubSelectionDisabled({ pending: true, hubAtivo: false, selecionado: true })).toBe(true);
  });

  it('permite remover hub inativo já vinculado e impede selecioná-lo novamente', () => {
    expect(isHubSelectionDisabled({ pending: false, hubAtivo: false, selecionado: true })).toBe(false);
    expect(isHubSelectionDisabled({ pending: false, hubAtivo: false, selecionado: false })).toBe(true);
  });

  it('só permite aprovação com ao menos um hub e todos ativos', () => {
    expect(canSubmitHubApproval(hubs, [])).toBe(false);
    expect(canSubmitHubApproval(hubs, ['inativo'])).toBe(false);
    expect(canSubmitHubApproval(hubs, ['ativo', 'inativo'])).toBe(false);
    expect(canSubmitHubApproval(hubs, ['ativo'])).toBe(true);
  });
});
