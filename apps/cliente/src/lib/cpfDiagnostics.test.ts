import { describe, expect, it, vi } from 'vitest';

import { createCpfDiagnostics } from './cpfDiagnostics';

describe('cpfDiagnostics', () => {
  it('não mede nem publica fora de QA', () => {
    const sink = vi.fn();
    const diagnostics = createCpfDiagnostics(false, sink, () => 10);
    diagnostics.recordRender(3);
    expect(diagnostics.measureOnChangeText('123', (value) => value)).toBe('123');
    expect(sink).not.toHaveBeenCalled();
  });

  it('publica contagem de render e duração do onChangeText em QA', () => {
    const sink = vi.fn();
    const times = [10, 12];
    const diagnostics = createCpfDiagnostics(true, sink, () => times.shift() ?? 12);
    diagnostics.recordRender(0);
    expect(diagnostics.measureOnChangeText('11144477735', (value) => value)).toBe('11144477735');
    expect(sink).toHaveBeenNthCalledWith(1, { event: 'render', count: 1, inputLength: 0 });
    expect(sink).toHaveBeenNthCalledWith(2, { event: 'onChangeText', inputLength: 11, durationMs: 2 });
  });
});
