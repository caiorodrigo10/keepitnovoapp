import tokensJson from './tokens.json';

export const tokens = tokensJson;

// Helpers tipados por tema
export const darkColors = tokens.colors.dark;
export const lightColors = tokens.colors.light;
export const typography = tokens.typography;
export const spacing = tokens.spacing;
export const radii = tokens.radii;
export const shadows = tokens.shadows;

export type Tokens = typeof tokens;
export type DarkColorTheme = typeof darkColors;
export type LightColorTheme = typeof lightColors;
export type Typography = typeof typography;

// ---------------------------------------------------------------------------
// Fontes — Story 1.3
// Uso em Expo: import { fonts } from '@keepit/ui-tokens'; useFonts(fonts);
// Os paths são resolvidos pelo Metro bundler em runtime.
// ---------------------------------------------------------------------------

/**
 * Map de fontes Hanken Grotesk para uso com useFonts() do Expo.
 *
 * Cada chave é o nome da fonte registrado no sistema nativo. O valor é um
 * path relativo que o Metro bundler resolverá em runtime via `require()`.
 *
 * Uso em Expo:
 *   import { fonts } from '@keepit/ui-tokens';
 *   const [loaded] = useFonts(fonts);
 *
 * O Metro resolve paths de packages corretamente — basta passar este objeto
 * diretamente ao hook useFonts do expo-font.
 *
 * Origem dos arquivos: baixados do Google Fonts CDN (Hanken Grotesk é OFL
 * open source) via `scripts/extract-fonts.mjs`. Cada arquivo corresponde a
 * um peso real (byte-distinto, verificado por MD5 no script). Detalhes da
 * decisão de fonte em `docs/qa/design-decisions.md`.
 *
 * Formato — Story 0.1: `.ttf` (não `.woff2`). O `.ttf` é o formato de fonte
 * nativo tradicionalmente mais confiável no runtime do React Native/Expo
 * tanto em iOS quanto em Android (o `.woff2` é primariamente um formato web,
 * suportado pelo Metro mas com histórico de comportamento inconsistente em
 * builds nativas mais antigas). Os `.ttf` foram gerados a partir dos mesmos
 * `.woff2` já auditados (conversão de formato via `fonttools`, não
 * re-download) — decisão registrada em `docs/qa/design-decisions.md`.
 * `packages/ui-tokens/fonts/` mantém ambos os formatos: `.woff2` continua
 * disponível para uso web (ex.: `next/font/local` no Admin).
 */
// IMPORTANTE: as fontes precisam ser carregadas via `require()` (asset do
// Metro), NÃO por path em string. Com string, o `useFonts` do Expo não
// resolve o arquivo — falha no web (404 → HTML) e no nativo. `require()`
// devolve a referência de asset que o `useFonts` espera.
export const fonts: Record<string, number> = {
  'HankenGrotesk-Regular': require('../fonts/HankenGrotesk-Regular.ttf'),
  'HankenGrotesk-Medium': require('../fonts/HankenGrotesk-Medium.ttf'),
  'HankenGrotesk-SemiBold': require('../fonts/HankenGrotesk-SemiBold.ttf'),
  'HankenGrotesk-Bold': require('../fonts/HankenGrotesk-Bold.ttf'),
  'HankenGrotesk-ExtraBold': require('../fonts/HankenGrotesk-ExtraBold.ttf'),
};

export type FontKey = keyof typeof fonts;
