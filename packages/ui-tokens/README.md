# @keepit/ui-tokens

Fonte única de tokens visuais do Keepit: cores, tipografia, spacing, radii e sombras.

## Origem

Tokens extraídos diretamente de `keepit-app/index.html` (protótipo bundled, Story 1.2).
Qualquer divergência visual entre apps deve ser resolvida aqui, nunca com valores hardcoded.

## Como usar em Expo (React Native)

```typescript
import { tokens, darkColors, lightColors, typography, spacing, radii, shadows } from '@keepit/ui-tokens';

// App do lojista (tema dark)
const style = {
  backgroundColor: darkColors.bg.primary,    // #1B1E1C
  color: darkColors.text.primary,            // #FFFFFF
};

// App do cliente (tema light)
const cardStyle = {
  backgroundColor: lightColors.bg.surface,   // #F0F1ED
  borderRadius: radii.card,                  // 16
  ...shadows.md,                             // box-shadow string
};

// Tipografia
const titleStyle = {
  fontFamily: typography.fontFamily,         // "Hanken Grotesk"
  fontSize: typography.sizes.xl.fontSize,    // 20
  lineHeight: typography.sizes.xl.lineHeight,// 26
  fontWeight: typography.weights.extrabold,  // 800
};
```

## Como usar em Tailwind (Admin Next.js)

No `tailwind.config.js` do admin, importe como preset:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@keepit/ui-tokens/tailwind')],
  content: ['./src/**/*.{ts,tsx}'],
};
```

Isso disponibiliza todas as classes: `bg-bg-primary`, `text-text-secondary`, `rounded-card`, `shadow-md`, `text-xl`, etc.

## Fontes (Story 1.3 + Story 0.1)

As fontes Hanken Grotesk vivem em `fonts/`, em **dois formatos** por peso — `.woff2` (uso web/Admin) e `.ttf` (uso nativo/Expo, gerado na Story 0.1):

```
packages/ui-tokens/fonts/
  HankenGrotesk-Regular.woff2    (~13 kB, peso 400)
  HankenGrotesk-Regular.ttf      (~31 kB, peso 400)
  HankenGrotesk-Medium.woff2     (~13 kB, peso 500)
  HankenGrotesk-Medium.ttf       (~31 kB, peso 500)
  HankenGrotesk-SemiBold.woff2   (~13 kB, peso 600)
  HankenGrotesk-SemiBold.ttf     (~31 kB, peso 600)
  HankenGrotesk-Bold.woff2       (~13 kB, peso 700)
  HankenGrotesk-Bold.ttf         (~31 kB, peso 700)
  HankenGrotesk-ExtraBold.woff2  (~13 kB, peso 800)
  HankenGrotesk-ExtraBold.ttf    (~31 kB, peso 800)
```

### Origem dos arquivos

Os arquivos são baixados **do Google Fonts CDN** (Hanken Grotesk é open source, SIL Open Font License).
O protótipo `keepit-app/index.html` foi originalmente investigado como fonte, mas o bundler
que gerou o protótipo (v0/Lovable) empacotou apenas 1 peso da fonte — todos os `@font-face`
apontavam para o mesmo arquivo woff2. Isso quebraria a fidelidade visual (Regular em vez de
Medium/Bold/etc.). A solução foi buscar as fontes oficiais.

### Reextrair fontes

```bash
pnpm --filter @keepit/ui-tokens run extract-fonts
```

O script `scripts/extract-fonts.mjs` chama a Google Fonts CSS API com User-Agent Chrome 60
(que retorna arquivos woff2 **estáticos por peso** em vez do variable font moderno) e baixa
cada arquivo do subset latin (`U+0000-00FF`). Requer conexão à internet. Sem dependências
externas — apenas Node.js built-ins (fetch, fs). Ao final, o script valida via MD5 que
os 5 arquivos são byte-distintos e falha se detectar duplicação.

### Como usar em Expo

```typescript
import { fonts } from '@keepit/ui-tokens';
import { useFonts } from 'expo-font';

export default function App() {
  const [loaded] = useFonts(fonts);
  // fonts = {
  //   'HankenGrotesk-Regular': '../fonts/HankenGrotesk-Regular.woff2',
  //   'HankenGrotesk-Medium':  '../fonts/HankenGrotesk-Medium.woff2',
  //   ...
  // }
  // Metro resolve os paths em build time.
}
```

Em seguida, use `fontFamily: 'HankenGrotesk-Bold'` nos seus estilos.

### Como usar no Admin Next.js

Para Next.js, use `next/font/local` apontando para os arquivos do package:

```typescript
import localFont from 'next/font/local';
import path from 'path';

const hanken = localFont({
  src: [
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-Regular.woff2',   weight: '400' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-Medium.woff2',    weight: '500' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-SemiBold.woff2',  weight: '600' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-Bold.woff2',      weight: '700' },
    { path: '../../../packages/ui-tokens/fonts/HankenGrotesk-ExtraBold.woff2', weight: '800' },
  ],
});
```

O Tailwind já configura `fontFamily.sans` como `['Hanken Grotesk', 'system-ui', 'sans-serif']`
via `src/tailwind.js` — os arquivos woff2 garantem o carregamento local sem CDN.

### Geração do `.ttf` (Story 0.1)

Os `.ttf` foram gerados a partir dos `.woff2` já auditados (mesmos bytes de origem — não
re-baixados do Google Fonts), usando `fonttools` (`fonttools ttLib.woff2 decompress`):

```bash
cd packages/ui-tokens/fonts
for w in Regular Medium SemiBold Bold ExtraBold; do
  fonttools ttLib.woff2 decompress "HankenGrotesk-${w}.woff2" -o "HankenGrotesk-${w}.ttf"
done
```

`fonttools`/`pyftsubset` são dependências de build **one-off** (não são dependência de runtime
do projeto) — instale via `pip install fonttools` se ainda não disponíveis no ambiente.

Validação de byte-consistência: as tabelas `glyf`, `cmap` e `hmtx` de cada `.ttf` foram
comparadas programaticamente contra o `.woff2` de origem (via `fontTools.ttLib.TTFont`) e
confirmadas idênticas; os 5 arquivos `.ttf` resultantes têm hashes MD5 distintos entre si
(sem duplicação de peso). Detalhes em `docs/qa/design-decisions.md`.

`@keepit/ui-tokens` expõe os `.ttf` via `fonts` (`src/expo.ts`) para uso com `useFonts()` do
Expo — ver decisão de formato na seção anterior.

## Como estender

1. Adicione o novo valor em `src/tokens.json` — nomeie semanticamente (ex.: `bg.input`, não `gray200`).
2. Se necessário, re-exporte em `src/expo.ts` como helper tipado.
3. O `src/tailwind.js` já lê `tokens.json` automaticamente — nenhuma alteração necessária para cores/radii/shadows/spacing.
4. **Regra absoluta**: nenhum valor visual hardcoded nos apps. Tudo parte daqui.
