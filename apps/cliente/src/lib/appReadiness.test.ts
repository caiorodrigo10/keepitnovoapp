import { describe, expect, it } from 'vitest';

import { canMountReadyApp } from './appReadiness';

describe('canMountReadyApp', () => {
  it.each([
    { dataReady: false, fontsLoaded: true, fontFailed: false, want: false },
    { dataReady: true, fontsLoaded: false, fontFailed: false, want: false },
    { dataReady: true, fontsLoaded: true, fontFailed: false, want: true },
    { dataReady: true, fontsLoaded: false, fontFailed: true, want: true },
  ])(
    'dados=$dataReady fontes=$fontsLoaded erroFonte=$fontFailed escolhe ReadyApp=$want',
    ({ dataReady, fontsLoaded, fontFailed, want }) => {
      expect(canMountReadyApp(dataReady, fontsLoaded, fontFailed)).toBe(want);
    },
  );
});
