# Épico 12 — Estabilização do Beta Android — App Cliente

## Epic Goal

Transformar o app Cliente em um beta Android funcional, previsível e testável de ponta a ponta, preservando a identidade visual existente e oferecendo paridade de comportamento entre adapters mock e real quando aplicável.

## Fonte de verdade

- Design aprovado: [`docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md`](../../superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md).
- Avaliação de origem: `avaliacao-beta-keepitapp.docx`, teste Android executado em 24/08/2026 e consolidado em 25/08/2026.
- Código afetado principalmente: `apps/cliente`, `packages/core-data`, `packages/config`, `packages/ui-tokens` e `apps/supabase`.

## Contexto do sistema existente

- **Aplicação:** Expo/React Native 0.86, React Navigation 7 e TypeScript.
- **Dados:** ports de `@keepit/core-data` com adapters mock e Supabase.
- **Persistência local existente:** AsyncStorage para estado pontual do Cliente.
- **Backend:** Supabase Auth, Postgres, RLS, RPCs e Edge Functions.
- **Qualidade:** Vitest, typecheck TypeScript, gates AIOX e validação manual em dispositivo.
- **Problema:** o build avaliado apresentou fluxos incompletos, inconsistências no mock, problemas Android de teclado/safe area, controles técnicos expostos e lacunas de conta/compliance.

## Escopo

### Incluído

- mock Cliente funcional, persistente, versionado e independente do mock Lojista;
- Painel QA centralizado e rastreabilidade do APK;
- onboarding contínuo e reversível;
- wrappers Android para formulário, teclado, safe area e bottom sheet;
- correção e profiling do fluxo de CPF;
- ciclo automático de pedidos no mock, histórico e contadores consistentes;
- favoritos reais e mock para hubs e lojas;
- seleção imediata de hub, troca de loja e limpeza confirmada do carrinho;
- regras de visibilidade para lojas disponíveis, fechadas e pausadas;
- busca, categorias e estados vazios;
- header e acessibilidade padronizados;
- recuperação de senha real e demonstrável no mock;
- exclusão agendada em sete dias no app, backend, mock e recurso web externo mínimo;
- substituição do label “Taxa de deslocamento” por “Frete”;
- matriz de QA Android em APK release.

### Excluído

- sincronização entre mocks Cliente e Lojista;
- alterações funcionais no app Lojista;
- redesign, rebranding ou troca do design system;
- publicação efetiva nas lojas;
- funcionalidades não relacionadas à avaliação beta.

## Stories e atribuições

1. **12.1 — Infraestrutura de mock Cliente persistente e versionado**
   - Executor: `@dev`; quality gate: `@architect`.
   - Ferramentas: testes de adapter, persistência, migração e reset.
2. **12.2 — Painel QA centralizado e identificação do build**
   - Executor: `@dev`; quality gate: `@qa`.
   - Ferramentas: feature-flag validation, build-config review e testes de acesso.
3. **12.3 — Infraestrutura Android de teclado, safe areas e formulários**
   - Executor: `@ux-design-expert`; quality gate: `@dev`.
   - Ferramentas: testes de componente, acessibilidade e verificação em APK.
4. **12.4 — Header compartilhado e acessibilidade estrutural**
   - Executor: `@ux-design-expert`; quality gate: `@dev`.
   - Ferramentas: component review, navigation tests e accessibility check.
5. **12.5 — Onboarding contínuo e reversível**
   - Executor: `@dev`; quality gate: `@ux-design-expert`.
   - Ferramentas: navigation tests, gesture review e comparação visual.
6. **12.6 — CPF: modal seguro, erros e diagnóstico de desempenho**
   - Executor: `@dev`; quality gate: `@qa`.
   - Ferramentas: profiling Android, testes de validação e teste de submit.
7. **12.7 — Ciclo automático de pedidos no mock Cliente**
   - Executor: `@dev`; quality gate: `@architect`.
   - Ferramentas: fake timers, state-machine tests e persistence tests.
8. **12.8 — Consistência entre pedidos, histórico e Perfil**
   - Executor: `@dev`; quality gate: `@qa`.
   - Ferramentas: integration tests, invariant checks e navigation tests.
9. **12.9 — Seleção de hub/loja e limpeza controlada do carrinho**
   - Executor: `@dev`; quality gate: `@ux-design-expert`.
   - Ferramentas: interaction tests, persistence tests e cart rule tests.
10. **12.10 — Estados das lojas, busca e estados vazios**
    - Executor: `@dev`; quality gate: `@ux-design-expert`.
    - Ferramentas: query tests, component states e visual validation.
11. **12.11 — Favoritos de hubs e lojas em mock e backend real**
    - Executor: `@data-engineer`; quality gate: `@dev`.
    - Ferramentas: schema validation, RLS tests, adapter tests e optimistic-UI tests.
12. **12.12 — Recuperação de senha real e demonstrável no mock**
    - Executor: `@dev`; quality gate: `@qa`.
    - Ferramentas: auth adapter tests, deep-link tests e end-to-end scenario.
13. **12.13 — Exclusão agendada de conta e recuperação em sete dias**
    - Executor: `@data-engineer`; quality gate: `@architect`.
    - Ferramentas: migration review, RLS/security tests, scheduler tests, app adapter tests e web-flow validation.
14. **12.14 — Consolidação, terminologia, acessibilidade e QA Android**
    - Executor: `@qa`; quality gate: `@pm`.
    - Ferramentas: regression suite, APK checklist, accessibility audit e release-candidate gate.

## Dependências e sequência

```text
12.1 ─► 12.2 ─► 12.7 ─► 12.8
  │                 └────► 12.12
  ├────► 12.9 ─► 12.10 ─► 12.11
  └────► 12.13

12.3 ─► 12.4 ─► 12.5
  └────────────► 12.6

Todas as stories concluídas ─► 12.14
```

- 12.1 estabelece persistência e reset usados pelos fluxos mock.
- 12.3 estabelece wrappers reutilizados por onboarding, CPF e conta.
- 12.7 antecede a validação de histórico/contador de 12.8.
- 12.9 define seleção e carrinho antes de estados de descoberta e favoritos.
- 12.13 pode avançar em paralelo após os contratos de persistência estarem definidos.
- 12.14 é o gate final e não implementa funcionalidades novas.

## Requisitos de compatibilidade

- Telas não acessam adapters concretos diretamente.
- Ports existentes permanecem compatíveis ou recebem extensões aditivas.
- Migrações de banco e de AsyncStorage são retrocompatíveis.
- Estado mock antigo é migrado ou resetado de forma explícita e segura.
- Produção não inclui acesso ao Painel QA.
- Mudanças visuais usam `@keepit/ui-tokens`.
- O app Lojista não depende do mock Cliente.

## Riscos e mitigação

- **Estado mock divergente:** schema versionado, fixtures-base e testes de migração/reset.
- **Timers inconsistentes em background:** transições calculadas por timestamps persistidos.
- **Regressão no carrinho:** confirmação antes da limpeza e testes da regra uma loja por pedido.
- **Vazamento do Painel QA:** flag de build, ausência em produção e gate de configuração.
- **Exclusão indevida:** reautenticação, prazo de sete dias, idempotência e recuperação da conta.
- **Retenção de dados incorreta:** política validada antes da implementação definitiva; anonimização explícita.
- **Correções Android não reproduzidas:** profiling e validação obrigatória em APK release.
- **APK diferente do código:** SHA, versão, datasource e data embutidos no build.

## Rollback

- Funcionalidades novas permanecem atrás de ports e flags de ambiente quando necessário.
- Migrações destrutivas são proibidas; rollback deve preservar dados e desativar consumidores.
- O mock versionado mantém migração reversível ou reset explícito.
- O Painel QA pode ser removido do artefato por configuração sem alterar fluxos de produção.

## Critérios de sucesso

- Cenário mock inicia zerado, persiste entre reinícios e pode ser resetado.
- Pedidos mock avançam automaticamente até `no_hub` e migram corretamente para histórico após estado terminal.
- Perfil e listas apresentam contagens derivadas da mesma fonte.
- Hubs e lojas favoritos funcionam no mock e sincronizam por conta no modo real.
- Troca de hub/loja limpa o carrinho somente após confirmação.
- Home/Hub mostram somente lojas disponíveis; busca também mostra fechadas/pausadas diferenciadas.
- Nenhum formulário obrigatório é encoberto por teclado ou barras do Android.
- Recuperação de senha funciona em staging e pode ser demonstrada no mock.
- Exclusão pode ser agendada, cancelada e concluída em mock e real.
- Fluxo externo mínimo de exclusão utiliza o mesmo serviço do app.
- Build QA é identificável; produção não expõe controles técnicos.
- Story 12.14 registra gate final de release candidate.

## Definition of Done

- [ ] Stories 12.1–12.14 concluídas e revisadas pelos gates atribuídos.
- [ ] Typecheck e testes automatizados relevantes passam sem regressões.
- [ ] Migrações, RLS e operações privilegiadas recebem revisão de segurança.
- [ ] Matriz Android executada em APK release com evidências.
- [ ] Fluxos mock e staging validados separadamente.
- [ ] Documentação de build, QA, exclusão e recuperação atualizada.
- [ ] Nenhuma pendência crítica ou alta permanece aberta para o release candidate.
