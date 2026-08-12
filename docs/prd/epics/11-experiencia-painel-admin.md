# Épico 11 — Elevação visual do Painel Admin

## Epic Goal

Dar ao painel administrativo web uma experiência visual coesa com os apps
mobile Keepit: mais respiro, superfícies arredondadas, tipografia consistente e
interações de operação fáceis de ler, sem alterar fluxos, dados ou permissões.

## Contexto do sistema existente

- **Aplicação:** `apps/admin`, Next.js App Router + Tailwind 3.
- **Design system existente:** `@keepit/ui-tokens`, com Hanken Grotesk, escala
  de 4 px, raios `md` (12 px), `card` (16 px) e cores dark já usadas pelos
  aplicativos móveis.
- **Integrações afetadas:** somente layout e componentes de apresentação;
  `AdminPort`, fixtures mock, sessão e rotas permanecem inalterados.

## Diagnóstico UX/UI (2026-07-31)

1. Os tokens e a fonte compartilhada já existem, mas botões, links de ação e
   campos usam raios pequenos e alturas inconsistentes, o que distancia o web
   da linguagem mais tátil dos apps mobile.
2. A sidebar e o conteúdo eram funcionais, porém densos: havia pouco respiro de
   navegação e o conteúdo podia ocupar larguras muito longas para leitura de
   listas operacionais.
3. Cards já são reutilizados, mas precisam ser a superfície dominante: borda
   sutil, padding consistente e foco acessível formam uma base para as páginas
   sem uma reescrita visual extensa.

## Escopo

**Incluído:** refinamento incremental de fundações compartilhadas, padrões de
CTA/campo/lista, responsividade e validação de acessibilidade.

**Excluído:** nova marca, troca de tema, mudança de dados, back-end, novos
fluxos, ícones/ilustrações ou uma reconstrução total de páginas.

## Stories

1. **11.1 — Fundação visual do Admin** — consolidar tipografia, raios,
   superfícies, foco e espaçamento no layout e componentes compartilhados.
   - Executor: `@ux-design-expert`; quality gate: `@dev`.
2. **11.2 — Padrões operacionais das telas Admin** — aplicar o padrão de ação,
   campo, filtro e estado nas telas de maior uso, eliminando os `rounded-sm`
   remanescentes de forma incremental.
   - Executor: `@dev`; quality gate: `@ux-design-expert`.

## Critérios de sucesso

- Hanken Grotesk continua sendo a fonte efetiva do Admin.
- Componentes interativos têm área de toque mínima de 44 px, foco visível e
  raios coerentes com os tokens mobile.
- Dashboard preserva navegação, sessão e comportamento em desktop; conteúdo é
  confortável até larguras menores sem overflow horizontal.
- Nenhuma alteração em contratos, fixtures ou APIs do `@keepit/core-data`.

## Compatibilidade e riscos

- **Risco:** ajustes globais de CSS afetarem estados existentes.
  **Mitigação:** alterações concentradas em componentes e base; typecheck e
  verificação manual de login, sidebar e listas.
- **Rollback:** reverter somente os arquivos de estilo/componentes desta
  entrega; não há migração nem alteração de dados.

## Definition of Done

- [ ] Stories concluídas e revisadas.
- [ ] `pnpm --filter @keepit/admin typecheck` verde.
- [ ] Fluxos de login, logout, navegação e listas verificados manualmente.
- [ ] Checklist WCAG AA de foco, contraste e teclado registrado.
