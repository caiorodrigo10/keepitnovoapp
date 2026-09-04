/** Libera a árvore somente quando dados e fontes (ou seu fallback) estão prontos. */
export function canMountReadyApp(
  dataReady: boolean,
  fontsLoaded: boolean,
  fontFailed: boolean,
): boolean {
  return dataReady && (fontsLoaded || fontFailed);
}
