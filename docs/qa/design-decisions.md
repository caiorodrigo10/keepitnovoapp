# Design Decisions Log

Registro formal de decisões de design tokens que **divergem do PRD original** mas foram tomadas para **preservar fidelidade ao protótipo**. Cada entrada explica o "porquê" para futuros reviews.

Regra: se uma decisão aqui contradiz o PRD, **a decisão registrada aqui prevalece** (o PRD é atualizado com nota apontando aqui).

---

## 2026-07-03 — Story 1.3 — Fontes Hanken Grotesk baixadas do Google Fonts CDN (não do bundle)

**Contexto:** O AC1 da Story 1.3 pedia "fontes Hanken Grotesk extraídas do `keepit-app/index.html` (base64) para arquivos `.woff2` reais". A implementação literal seria ler o `<script type="__bundler/manifest">` do HTML, decodificar os assets base64, e salvar como `.woff2`.

**Evidência empírica:** Investigação do bundle mostrou:
- Manifest contém apenas **4 arquivos woff2** (não os 5+ esperados por peso).
- Cada `@font-face` no CSS aponta para um dos 4 UUIDs organizados **por unicode-subset** (cyrillic, vietnamese, latin-ext, latin), **não por peso**.
- Todos os 5 pesos (400, 500, 600, 700, 800) do CSS apontam para os mesmos 4 UUIDs.
- Consequência: extrair "do bundle" produz 5 arquivos byte-idênticos (mesmo MD5), todos representando o peso Regular (400). Medium/SemiBold/Bold/ExtraBold seriam falsamente rotulados como pesos diferentes mas visualmente iguais.

**Causa raiz:** o bundler que gerou o protótipo (v0/Lovable ou similar) empacotou apenas 1 peso da fonte e o CSS declara todos os pesos apontando pro mesmo arquivo — falha do bundler, não do design.

**Decisão:** Baixar as fontes **do Google Fonts CDN** (Hanken Grotesk é OFL open source — mesma fonte referenciada no `font-family` do protótipo). Descoberta secundária: o CDN moderno serve variable font (URLs idênticas por peso); usa-se User-Agent Chrome 60 para forçar retorno de woff2 estáticos separados por peso. Script `scripts/extract-fonts.mjs` reescrito para essa estratégia.

**Efeito colateral:**
- Requisito literal "extraída do bundle" não é atendido; o requisito de espírito ("fontes Hanken Grotesk oficiais em `.woff2`, um arquivo por peso") é atendido com fidelidade máxima.
- Reextração exige conexão à internet (chamadas a `fonts.googleapis.com` e `fonts.gstatic.com`).
- Validação embutida: script calcula MD5 dos 5 arquivos ao final e falha se detectar duplicação.
- Nada de `.ttf` foi gerado (AC1 secundário). Aceitável para MVP — `.woff2` funciona em Expo iOS/Android modernos. Validação empírica no simulador iOS fica como AC explícito na Story 1.6.

**Aprovação:** @qa CONCERNS (gate `docs/qa/gates/1.3-fonts.yaml`). Follow-ups aplicados no mesmo dia: JSDoc de `expo.ts` corrigido, esta decisão registrada.

---

## 2026-07-03 — Story 1.2 — `radii.card = 16px` (não 10px)

**Contexto:** O AC3 da Story 1.2 no PRD (`docs/prd/epics/1-setup-fundacao.md`) mencionava explicitamente "10px card" nos tokens de radii. O @dev implementou `radii.card = 16`.

**Evidência empírica:**
- `border-radius: 16px` aparece **30×** no protótipo `keepit-app/index.html`.
- `border-radius: 10px` aparece **5×**.
- 16px é o raio dominante para cards de conteúdo (cards de loja, produto, hub); 10px aparece em elementos secundários (chips específicos).

**Decisão:** Manter `radii.card = 16` porque é a escolha empiricamente correta com base no protótipo. O valor 10px do PRD foi um chute inicial do @pm, não observação medida.

**Efeito colateral:** Já existe `radii.md = 12` na escala. Se surgir necessidade de "10px" específico em Story futura, adicionar como `radii.chip = 10` ou similar.

**Aprovação:** @qa PASS com CONCERNS (gate `docs/qa/gates/1.2-design-tokens.yaml`); documentado aqui em vez de mudar o PRD retroativamente.

---

## 2026-07-27 — Story 0.1 — `.ttf` gerado via `fonttools` (conversão de formato, não re-download) + Expo consome `.ttf`, não `.woff2`

**Contexto:** O AC1 da Story 0.1 pede fontes Hanken Grotesk em `.woff2` **e** `.ttf` para os 5 pesos. O Dev Notes explicitamente veda re-baixar do zero (preservar rastreabilidade do gate `docs/qa/gates/1.3-fonts.yaml`) e pede validação de byte-consistência.

**Evidência empírica:** `fonttools`/`pyftsubset` já estavam instalados em `/usr/local/bin` (confirmado antes de iniciar). Usei `fonttools ttLib.woff2 decompress` para converter cada `.woff2` existente diretamente para `.ttf` (mesma origem, apenas mudança de container/formato). Validação programática via `fontTools.ttLib.TTFont`: as tabelas `glyf`, `cmap` e `hmtx` de cada `.ttf` gerado são byte-idênticas às do `.woff2` correspondente (comparação de `table.compile(font)`), o `glyphOrder` é idêntico, e o nome completo da fonte (`name` table, ID 4) bate com o peso esperado (ex.: "Hanken Grotesk Bold"). Os 5 `.ttf` resultantes têm hashes MD5 distintos entre si.

**Decisão:**
1. `.ttf` gerado por conversão de formato a partir do `.woff2` já auditado — não por novo download.
2. `packages/ui-tokens/src/expo.ts` (`fonts` export, consumido por `useFonts()`) foi atualizado para apontar para os `.ttf`, não mais para `.woff2`. Razão: `.ttf` é o formato nativo tradicionalmente mais confiável em runtimes React Native/Expo (iOS e Android), enquanto `.woff2` é primariamente um formato web. Ambos os formatos continuam no repositório — `.woff2` permanece em uso pelo Admin (`next/font/local`), que é web e já está adaptado para esse formato desde a Story 1.2/1.3.

**Efeito colateral:** Nenhum arquivo `.woff2` foi removido ou alterado; a mudança é aditiva (5 novos `.ttf`) e a alteração em `expo.ts` afeta apenas o consumo pelos apps Expo (Cliente/Lojista), que ainda não existiam como apps reais antes desta story.

**Aprovação:** @dev (Dex), a ser confirmado por @qa nesta mesma story (Story 0.1).

---

## Formato para novas entradas

```
## YYYY-MM-DD — Story X.Y — <título curto>

**Contexto:** O que o PRD/spec pedia.

**Evidência empírica:** O que o protótipo/dados mostram.

**Decisão:** O que ficou implementado.

**Efeito colateral:** Consequências ou pontos de atenção.

**Aprovação:** @qa gate / @po / stakeholder.
```
