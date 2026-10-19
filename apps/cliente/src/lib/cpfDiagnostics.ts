export type CpfDiagnosticEvent =
  | { event: 'render'; count: number; inputLength: number }
  | { event: 'onChangeText'; inputLength: number; durationMs: number };

export function createCpfDiagnostics(
  enabled: boolean,
  sink: (event: CpfDiagnosticEvent) => void,
  now: () => number = () => performance.now(),
) {
  let renderCount = 0;

  return {
    recordRender(inputLength: number) {
      if (enabled) sink({ event: 'render', count: ++renderCount, inputLength });
    },
    measureOnChangeText(value: string, transform: (value: string) => string): string {
      if (!enabled) return transform(value);
      const startedAt = now();
      const result = transform(value);
      sink({ event: 'onChangeText', inputLength: value.length, durationMs: now() - startedAt });
      return result;
    },
  };
}
