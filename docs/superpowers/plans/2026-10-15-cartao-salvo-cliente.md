# Cartão salvo no Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Limite desta entrega:** somente documentação, com os dois arquivos locais, sem commit ou push. Todas as ações de implementação, testes e homologação abaixo são futuras e não foram executadas. Não iniciar execução por concluir a escrita do plano. Na execução futura, usar delegação somente quando autorizada. Por solicitação do usuário, este documento descreve contratos e casos TDD sem escrever código de implementação.

**Goal:** permitir salvar cartões por token Asaas na primeira compra ou pelo perfil, gerenciar vários cartões e pagar novamente com segurança no app Cliente.

**Architecture:** manter Supabase e as portas de `core-data`, estendendo o fluxo durável de pagamento existente. Tokens ficam no servidor vinculados ao customer do próprio cliente; cadastro pelo perfil tem operação separada de tokenização, validação e estorno, sem criar pedido. Telas usam IDs internos e metadados públicos, com confirmação financeira pelo webhook/reconciliador.

**Tech Stack:** TypeScript, Expo/React Native, React Navigation, Supabase Auth/PostgreSQL/RLS, Edge Functions/Deno, Asaas, Vitest/react-test-renderer e pgTAP; dependências já presentes no monorepo pnpm.

**Spec:** [Cartão salvo no app Cliente](../specs/2026-10-15-cartao-salvo-cliente-design.md). Ler junto com `/root/brainstorm-cartao-salvo.md`, fonte das decisões; os documentos de integração anteriores fornecem os padrões, não anulam o brainstorm.

## Global Constraints

- Backend único Supabase; telas consomem ports de `@keepit/core-data`.
- Crédito à vista, sem parcelamento, débito, assinatura ou biometria neste piloto.
- PAN, CVV e dados completos do titular existem apenas na memória transitória do formulário e da chamada HTTPS; nunca em banco, storage do celular, navegação, logs ou analytics.
- Tokens e `asaas_customer_id` ficam exclusivamente no backend; o app recebe somente ID interno, bandeira, últimos quatro dígitos e indicação de principal.
- Toda tabela nova usa RLS; operações privilegiadas verificam sessão, papel e ownership antes de acessar segredos.
- Valores financeiros são definidos no servidor em centavos inteiros; toda operação externa tem identidade durável e proteção contra duplicação.
- Timeout, resposta perdida e resultado ambíguo exigem reconciliação antes de outra cobrança.
- Migrations são incrementais; demonstração não substitui backend real nem comprova homologação.
- Os dois documentos desta entrega permanecem locais, sem commit; planejamento não autoriza testes, build, deploy ou cobranças.

---

## Leitura obrigatória e organização dos arquivos

A base foi inspecionada em leitura. `create-card-payment` já possui handler injetável, entrypoint autenticado, testes Vitest e claim de cobrança; `_shared/asaas.ts` ainda tem tokenização stub. O app já tem formulário transitório e polling. Reaproveitar essas fronteiras, sem API Node ou estrutura paralela de checkout.

Referências obrigatórias: `docs/superpowers/specs/2026-09-30-integracao-piloto-design.md`, `docs/superpowers/plans/2026-10-01-integracao-05-fechamento-mvp.md`, todos os arquivos de `apps/supabase/supabase/functions/create-card-payment/`, `packages/core-data/src/supabase/payment.supabase.ts` e as telas `AdicionarCartao.tsx`, `Pagamento.tsx`, `Checkout.tsx` em `apps/cliente/src/screens/home/`.

| Unidade | Arquivos principais | Responsabilidade |
|---|---|---|
| Dados de cartões | migrations `20261015110000_clientes_cartoes.sql`, `20261015111000_cartoes_operacoes.sql` | RLS, vínculo customer, principal, remoção, operações e consentimento |
| Customer e HTTP Asaas | `_shared/card-customer.ts`, `_shared/asaas.ts`, `_shared/card-contract.ts` | Customer estável, DTOs restritos e erros seguros |
| Primeira compra e reutilização | `create-card-payment/handler.ts`, `index.ts`, `_shared/card-repository.ts` | Cobrança única, salvamento condicionado e pagamento por ID |
| Perfil | migration `20261015112000_validacao_cartoes.sql`, `tokenize-card/handler.ts`, `index.ts` | Tokenizar, validar e solicitar estorno |
| Recuperação | `_shared/card-validation.ts`, `reconcile-card-validation/`, `asaas-payment-webhook/` | Estado durável, eventos e reconciliação sem novo efeito financeiro |
| Porta pública | `ports/saved-cards.port.ts`, `supabase/saved-cards.supabase.ts`, `mock/saved-cards.mock.ts` | Metadados, CRUD autorizado e cadastro |
| Cliente | `useSavedCards.ts`, `CardPaymentForm.tsx`, telas de perfil/home e modal existente | Lista, principal, consentimento, revisão e recuperação |
| Exclusão | migration `20261015113500_cartoes_exclusao_conta.sql` | Purga idempotente e proteção contra recriação |

Todos os caminhos abreviados nessa tabela são expandidos nas tarefas. Os timestamps são nomes planejados; conferir colisão antes de criar e, se necessário, atualizar o nome nos dois documentos. Não editar migrations históricas. Não converter cartões demonstrativos de `CartContext` em registros reais.

## Contratos compartilhados entre tarefas

Os nomes abaixo são contratos novos a implementar, não APIs já existentes. UUID é `string`; centavos são inteiros positivos; datas de evento são UTC. `CardInput`, `HolderInput` e `PaymentAttempt` vêm dos tipos atuais, preservando seus campos.

| Nome | Assinatura/forma pública e invariantes |
|---|---|
| `SavedCardSummary` | Objeto com `id: string`, `bandeira: string`, `ultimo4: string`, `principal: boolean`; exatamente quatro dígitos no final |
| `PayCardInput` | `pedidoId`, `operacaoId` e uma variante exclusiva: `cartao`, `titular`, `salvarCartao: boolean`; ou `cartaoSalvoId: string`. Sem campos da outra variante |
| `PaymentPort.pagarCartao(input: PayCardInput)` | `Promise<PaymentAttempt>`; novo campo público opcional de tentativa `avisoCartao: 'nao_salvo'`; nunca token |
| `SavedCardsPort.listar()` | `Promise<SavedCardSummary[]>`, ordenados principal primeiro, depois criação/ID |
| `SavedCardsPort.definirPrincipal({cartaoId, operacaoId})` | `Promise<SavedCardSummary[]>`, devolve lista autoritativa |
| `SavedCardsPort.remover({cartaoId, operacaoId})` | `Promise<SavedCardSummary[]>`, remoção idempotente; sem cancelamento de pagamento |
| `SavedCardsPort.configuracao()` | `Promise<{disponivel: boolean; valorValidacaoCentavos: number \| null}>`, configuração pública segura |
| `SavedCardsPort.cadastrar({operacaoId, cartao, titular})` | `Promise<CardRegistration>`, somente perfil; valor nunca vem do app |
| `SavedCardsPort.consultarCadastro(operacaoId: string)` | `Promise<CardRegistration \| null>`, apenas operação da sessão |
| `CardRegistration` | `operacaoId`, `estado` entre `criando/tokenizado/validando/estorno_pendente/concluido/recusado/reconciliacao`, `valorValidacaoCentavos`, `cartao: SavedCardSummary \| null`, `codigoErro: string \| null`; sem referências secretas |
| `PaymentActionError` | Erro com `code` público permitido e mensagem local segura; não carregar resposta bruta do gateway em `cause`, `details` ou serialização |
| `getOrCreateCardCustomer(clienteId, deps)` | `Promise<{customerId: string; ambiente: 'sandbox' \| 'production'}>`; identidade resolvida no servidor, com claim durável |
| `CardTokenMetadata` | Somente servidor: `token`, `bandeira`, `ultimo4`; parser descarta campos extras e rejeita final inválido |
| `CardGatewayFailure` | Somente servidor: categoria `recusado/token_invalido/indisponivel/incerto`; status HTTP sozinho não prova token inválido |
| `advanceCardValidation(operacaoId, deps)` | `Promise<CardRegistration>`; lê operação persistida, adquire claim de etapa, consulta efeito anterior e avança somente quando comprovado |

As tabelas e RPCs devem armazenar nomes em snake_case; adapters entregam camelCase. Funções de persistência privilegiadas não ficam disponíveis ao client autenticado. Nenhuma tela importa `_shared` das Edge Functions.

## Execução futura e TDD

Cada item é uma ação curta. Nos blocos de casos, implementar um caso e executar seu RED antes da alteração mínima; repetir para o seguinte, em vez de escrever toda a funcionalidade antes dos testes. Os casos descrevem preparação, estímulo e asserções concretas para respeitar o pedido atual de não escrever código.

Vitest roda pelo workspace, não por `deno test`. Testes SQL rodam exclusivamente em banco descartável: confirmar que a CLI Supabase está disponível e que o destino é local antes de usar os comandos documentados. Falha por dependência ausente não conta como RED funcional. Os comandos abaixo são instruções futuras, **nenhum foi executado nesta tarefa**. Não há etapas de commit/push neste plano.

### Task 1: Registrar os gates técnicos Asaas

**Files:**
- Modify, na futura execução: `docs/superpowers/specs/2026-10-15-cartao-salvo-cliente-design.md`, seção de evidências do pré-requisito.
- Reference: `apps/supabase/supabase/functions/create-pix-payment/config.ts` e `apps/supabase/supabase/functions/_shared/__fixtures__/card.fixtures.ts`.

**Interfaces:** Consome as decisões 8, 9 e 12 do brainstorm. Produz evidência de habilitação por ambiente, configuração do valor baixo e mapa verificado de respostas do gateway para as Tasks 4–8 e 14.

- [ ] Registrar, sem chave/token, a habilitação da tokenização sandbox e produção. Conta não liberada: registrar chamado do suporte e manter gate pré-merge bloqueado. Consulta de produção não inclui cobrança.
- [x] Conferir contrato do endpoint de tokenização e da resposta da primeira cobrança; registrar os caminhos efetivos para `creditCardToken`, `creditCardBrand` e `creditCardNumber`. Não depender de um payload amplo preservado no banco. **2026-10-15:** caminhos documentados conferidos no SDK oficial; resposta efetiva da conta ainda não capturada, conforme evidências na spec.
- [ ] Confirmar o menor valor de baixo custo aceito para validação e configurar futuramente `CARD_VALIDATION_AMOUNT_CENTS` no servidor. Não criar default arbitrário no app. Configuração ausente/inválida deve produzir cadastro indisponível.
- [ ] Obter exemplos sintéticos sanitizados de recusa e token inválido e registrar códigos inequívocos para a classificação. Se o gateway usar código genérico, conferir também a condição documentada; não mapear qualquer HTTP 400 para token inválido.
- [x] Registrar como reproduzir os três cenários E2E no sandbox e o limite de timeout do processamento de cartão. A referência oficial de criação recomenda pelo menos 60 segundos; ajustar somente chamadas de processamento, preservando reconciliação após timeout. [Contrato oficial](https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito). **2026-10-15:** runbook registrado; timeout atual de 15 s e ajuste futuro na Task 4 documentados; E2E não executados.

**Registro de execução documental — 2026-10-15:** DONE_WITH_CONCERNS. A [seção de evidências da spec](../specs/2026-10-15-cartao-salvo-cliente-design.md#evidências-da-task-1--2026-10-15-utc) registra bloqueios explícitos por ambiente. Os itens abertos acima continuam pendentes: habilitação de ambas as contas, eventual chamado com protocolo, menor valor autorizado e exemplo inequívoco de token inválido. Não houve chamada autenticada ao Asaas ou consulta à produção, cobrança, estorno, acesso a credenciais, migration/deploy/secret ou execução E2E. Trabalho local independente pode seguir; merge permanece bloqueado. Relatório local: `.superpowers/sdd/2026-10-15-cartao-salvo-cliente/task-1-report.md`.

**Done:** evidência revisável ou bloqueio explícito por ambiente. Este é um gate externo, não um teste automatizado. Trabalho local independente pode prosseguir; merge exige ambos os ambientes habilitados e os E2E concluídos.

### Task 2: Criar armazenamento protegido e gerenciamento dos cartões

**Files:**
- Create: `apps/supabase/supabase/migrations/20261015110000_clientes_cartoes.sql`.
- Create: `apps/supabase/supabase/tests/database/clientes_cartoes.test.sql`.
- Create: `apps/supabase/supabase/tests/database/clientes_cartoes_concurrency.py`, seguindo as duas conexões e guardas de `chargebacks_concurrency.py` no mesmo diretório.
- Modify: `packages/shared-types/src/supabase.ts`.

**Interfaces:** Produz `private.clientes_asaas` e `public.clientes_cartoes`; RPCs públicas `listar_cartoes_cliente()`, `definir_cartao_principal(p_cartao_id uuid, p_operacao_id uuid)` e `remover_cartao_cliente(p_cartao_id uuid, p_operacao_id uuid)` retornam listas públicas. `private.cartoes_gestao_operacoes` registra `(cliente_id, operacao_id, acao, cartao_id)` sem token e impede reutilização do mesmo ID para outra ação.

- [x] Escrever o primeiro teste SQL: dois clientes sintéticos e dois cartões de A; sob sessão B e `anon`, nenhuma leitura de A; sob sessão A, leitura pública permitida, leitura explícita de token/customer e `select=*` negadas. Incluir sessão de lojista e Admin autenticado comum.
- [x] Executar RED futuro: `pnpm --filter @keepit/supabase exec supabase test db supabase/tests/database/clientes_cartoes.test.sql --local`. Esperado: estrutura/contrato ausente. Não aplicar ao projeto vinculado. **2026-10-15:** executado com CLI temporária pinada `pnpm dlx supabase@2.72.7`, caminho absoluto do teste e `--workdir` isolado; RED real por estrutura ausente registrado no relatório.
- [x] Criar as duas tabelas com os campos da spec, RLS habilitada/forçada, grants por coluna e nenhuma escrita autenticada direta. Acrescentar RLS e grants restritos na tabela privada de deduplicação. Customer é único por cliente/ambiente e por ID externo/ambiente; cartão referencia a combinação exata cliente/ambiente/customer.
- [x] Adicionar testes RED de primeiro cartão principal, múltiplos cartões, troca de principal, remoção de não principal/principal/último, replay e duas sessões concorrentes. Deduplicar por token/customer, nunca pelos quatro dígitos; cartão/customer de B para A deve falhar.
- [x] Implementar RPCs com lock por cliente, índice parcial de principal e promoção determinística do mais antigo/ID. Revogar execução pública privilegiada; fixar `search_path`. Repetição da mesma remoção retorna estado atual sem recriar nada; reutilização de operação com parâmetros divergentes falha.
- [x] Rodar GREEN com o mesmo comando e conferir que há um principal quando a lista não está vazia. Atualizar os tipos Supabase das relações/RPCs, sem expor colunas secretas no contrato `SavedCardSummary`. **2026-10-15:** 59/59 focados e 585/585 em 14 arquivos pgTAP; SQL legado não-TAP passou via psql; três disputas reais Python passaram. Migration reaplicada em reset limpo local, lint e tipos GREEN. **Sem deploy keepit-dev:** histórico remoto divergente impede provar aplicação isolada segura via CLI. Relatório `.superpowers/sdd/2026-10-15-cartao-salvo-cliente/task-2-report.md`.

**Done:** gerenciamento e isolamento comprovados em banco, inclusive grants de colunas. Executar futuramente `python3 apps/supabase/supabase/tests/database/clientes_cartoes_concurrency.py` com `KEEPIT_DISPOSABLE_DB=1`, `SUPABASE_DB_CONTAINER` e `SUPABASE_DB_NAME` já apontando ao banco descartável. O teste disputa duas mudanças de principal e remoção versus salvamento, verifica ausência de duplicidade e exatamente um principal quando houver cartões; nenhuma chamada Asaas nesta tarefa.

### Task 3: Persistir operação e resolver customer estável

**Files:**
- Create: `apps/supabase/supabase/migrations/20261015111000_cartoes_operacoes.sql`.
- Create: `apps/supabase/supabase/tests/database/cartoes_operacoes.test.sql`.
- Create: `apps/supabase/supabase/functions/_shared/card-customer.ts`.
- Create: `apps/supabase/supabase/functions/_shared/card-customer.test.ts`.
- Create: `apps/supabase/supabase/functions/_shared/card-repository.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/asaas.ts`, `apps/supabase/supabase/functions/_shared/asaas.test.ts`, `packages/shared-types/src/supabase.ts`.

**Interfaces:** Consome as tabelas da Task 2. Produz `getOrCreateCardCustomer` e `CardRepository`. Este oferece `registrarCompra({clienteId, tentativaId, operacaoId, salvarCartao, cartaoSalvoId})`, `obterCartao({clienteId, cartaoId, ambiente})`, `salvarTokenCompra({operacaoId, customerId, metadata})`, `invalidarCartao({clienteId, cartaoId, operacaoId})`. `obterCartao` retorna segredo somente no servidor. Os demais retornam metadados públicos ou confirmação, nunca payload de cartão.

- [x] Escrever teste de customer: duas chamadas simultâneas para A devem criar um customer e reutilizar o ID; B recebe vínculo independente, mesmo com titular de cartão igual. Entrada CPF/nome do titular não pode substituir a identidade de A.
- [x] Rodar RED: `pnpm --filter @keepit/supabase exec vitest run supabase/functions/_shared/card-customer.test.ts`.
- [x] Implementar claim persistido de criação de customer, referência externa estável do cliente e leitura de `clientes` pelo servidor. Ampliar `AsaasClient` com `listarClientesPorReferencia(reference: string)`, retornando lista e paginação, para recuperar resposta perdida. Resultado vazio/ambíguo mantém bloqueio; não criar novamente por expiração de lease. Retomada administrativa usa a operação, sem exigir acesso a tokens.
- [x] Escrever RED SQL para operação de compra imutável: `(cliente_id, operacao_id)` único; trocar cartão ou autorização de salvar no replay falha; salvar após cartão removido/conta em exclusão falha; reentrega não duplica. Vincular tentativa, dono, customer e ambiente no servidor.
- [x] Criar `private.cartoes_operacoes` com contexto `compra/perfil`, tentativa opcional, cliente/ambiente/customer, escolha de salvar, cartão interno escolhido, estado, claims, IDs externos e aviso seguro. Tokens temporários têm colunas explícitas restritas, não JSON bruto. Criar RPCs service-only correspondentes aos quatro métodos do repositório e aos claims de customer; registrar a escolha antes da chamada financeira.
- [x] Rodar GREEN Vitest e `pnpm --filter @keepit/supabase exec supabase test db supabase/tests/database/cartoes_operacoes.test.sql --local`. Testar que retomada após falha de persistência reutiliza o vínculo encontrado e que nenhum segredo sai da projeção pública.

**Done:** compra e perfil usam customer estável do cliente. O fluxo PIX existente pode conservar seu comportamento atual; esta tarefa não associa tokens a customers históricos escolhidos somente por CPF.

### Task 4: Implementar o contrato seguro do gateway para tokenização e cobrança por token

**Files:**
- Create: `apps/supabase/supabase/functions/_shared/card-contract.ts`.
- Create: `apps/supabase/supabase/functions/_shared/card-contract.test.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/asaas.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/asaas.test.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/__fixtures__/card.fixtures.ts`.

**Interfaces:** Produz `CardTokenMetadata`, `CardGatewayFailure`, `parseCardTokenMetadata(value: unknown)` e `classifyCardGatewayFailure(value: unknown, status: number)`. `AsaasClient.tokenizarCartao` deixa de ser stub e retorna `AsaasResult<CardTokenMetadata>`; entrada tem `customer`, `creditCard`, `creditCardHolderInfo`, `remoteIp`. `criarCobranca` aceita variante com `creditCardToken` ou variante com cartão/titular, nunca ambas. Resposta interna pode conter `cardTokenMetadata` validado; resposta pública permanece restrita.

- [ ] Escrever teste de request por token: payload contém customer, valor do servidor, referência, IP e token; não contém `creditCard`, `creditCardHolderInfo`, `ccv` ou parcelamento. Testar tokenização no endpoint exato e extração dos três campos verificados na Task 1.
- [ ] Rodar RED: `pnpm --filter @keepit/supabase exec vitest run supabase/functions/_shared/asaas.test.ts supabase/functions/_shared/card-contract.test.ts`.
- [ ] Implementar as variantes com lista positiva e substituir somente o stub `tokenizarCartao`; preservar o stub de subconta. Aplicar sanitização também a consultar cobrança e estornar cobrança, que podem retornar dados sensíveis.
- [ ] Adicionar RED para gateway devolvendo PAN/CVV/token em mensagens de erro, extra fields e JSON inválido. Esperado: categoria segura, sem erro bruto, sem token em logs/resultados públicos; ausência de metadados não transforma cobrança aprovada em nova tentativa financeira.
- [ ] Implementar classificação com evidência da Task 1: token inválido confirmado é distinto de recusa; rede/408/429/5xx são incertos; erro de configuração não apaga cartões. Nunca comparar apenas texto livre genérico para excluir token.
- [ ] Rodar GREEN e confirmar que os testes existentes de PIX e cartão continuam válidos. Ajustar timeout apenas do processamento de cartão à orientação conferida; não introduzir retry automático de POST.

**Done:** cartão completo e token seguem contratos mutuamente exclusivos, com metadados tokenizados restritos ao servidor.

### Task 5: Salvar cartão na primeira compra sem cobrança adicional

**Files:**
- Modify: `apps/supabase/supabase/functions/create-card-payment/handler.ts`.
- Modify: `apps/supabase/supabase/functions/create-card-payment/index.ts`.
- Modify: `apps/supabase/supabase/functions/create-card-payment/handler.test.ts`.
- Modify: `apps/supabase/supabase/functions/create-card-payment/index.test.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/card-repository.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/payment-attempt.ts`.
- Modify: `packages/shared-types/src/payment.ts`, `packages/shared-types/src/supabase.ts`.
- Create: `apps/supabase/supabase/migrations/20261015111500_compra_cartao_salvo.sql`.
- Create: `apps/supabase/supabase/tests/database/compra_cartao_salvo.test.sql`.

**Interfaces:** Consome Tasks 2–4. HTTP cartão novo: `pedido_id`, `operacao_id`, `cartao`, `titular`, `salvar_cartao`. O campo ausente equivale a falso para clientes antigos. Produz `tentativa: PaymentAttempt`, opcionalmente com `avisoCartao: 'nao_salvo'`. A projeção SQL de tentativa ganha apenas esse aviso público.

- [ ] Ampliar o `setup` atual de `handler.test.ts` com customer fixo e repositório de cartões falso. Caso RED: cobrança confirmada, salvar=true → uma chamada financeira e um registro do token; salvar=false/ausente → uma cobrança e zero tokens persistidos, inclusive em operações privadas.
- [ ] Rodar RED: `pnpm --filter @keepit/supabase exec vitest run supabase/functions/create-card-payment/handler.test.ts supabase/functions/create-card-payment/index.test.ts`.
- [ ] Substituir criação repetida de customer pelo helper e registrar a autorização de salvar junto à tentativa. Reutilizar claim existente. Cobrar primeiro; salvar apenas metadados retornados e validados, com autorização e vínculo da sessão. Persistir ID da cobrança antes de qualquer falha secundária de salvamento.
- [ ] Adicionar RED para resposta pendente/em análise, recusa, token ausente, banco indisponível após aprovação, replay e concorrência. Esperado: nenhum PIN liberado, nenhuma recobrança, nenhuma duplicação de cartão; falha de salvamento gera aviso separado. Em análise, metadados temporários somente se salvar=true.
- [ ] Na migration incremental, complementar projeção pública e finalizar salvamento no processamento autoritativo de confirmação existente. Limpar metadados temporários em recusa/encerramento definitivo e após promoção; impedir ressurreição de cartão removido. Executar o mesmo finalizador para evento recebido antes/depois da resposta HTTP, sob lock.
- [ ] Rodar GREEN Vitest e `pnpm --filter @keepit/supabase exec supabase test db supabase/tests/database/compra_cartao_salvo.test.sql --local`. Testar confirmação por webhook antes da gravação do token e resposta perdida sem token recuperável: pagamento conciliado, aviso de cartão não salvo, zero segunda cobrança.

**Done:** decisão “salvar” é respeitada sem alterar a autoridade financeira e sem validação extra na primeira compra.

### Task 6: Cobrar cartão salvo e tratar recusa/token inválido

**Files:**
- Modify: `apps/supabase/supabase/functions/create-card-payment/handler.ts`, `apps/supabase/supabase/functions/create-card-payment/index.ts`.
- Modify: `apps/supabase/supabase/functions/create-card-payment/handler.test.ts`, `apps/supabase/supabase/functions/create-card-payment/index.test.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/card-repository.ts`.
- Modify: `apps/supabase/supabase/functions/create-pix-payment/handler.ts`, `apps/supabase/supabase/functions/create-pix-payment/index.ts`.
- Modify: `apps/supabase/supabase/functions/create-pix-payment/handler.test.ts`.
- Modify: `apps/supabase/supabase/tests/database/compra_cartao_salvo.test.sql`.
- Reference: `apps/supabase/supabase/functions/close-payment-attempt/handler.ts`, `apps/supabase/supabase/tests/database/encerramento_pagamento.test.sql`.

**Interfaces:** Variante HTTP salva: `pedido_id`, `operacao_id`, `cartao_salvo_id`. Sem token, customer, valor, titular ou CVV no body. Produz códigos públicos `CARTAO_TOKEN_INVALIDO`, `CARTAO_INDISPONIVEL`, `PAGAMENTO_RECUSADO`, `PAGAMENTO_RECONCILIACAO`.

- [ ] Escrever RED: cartão de A paga pedido de A com customer/token de A; cartão de B, removido, de outro ambiente ou body misto é rejeitado antes do gateway. Preservar teste da ordem autenticar → autorizar pedido → construir client privilegiado.
- [ ] Rodar RED: `pnpm --filter @keepit/supabase exec vitest run supabase/functions/create-card-payment/handler.test.ts supabase/functions/create-card-payment/index.test.ts`.
- [ ] Validar variantes estritas, buscar segredo pelo ID e dono, verificar vínculo e congelar escolha por operação. Serializar remoção e autorização de uso: remoção anterior impede cobrança; cobrança já despachada não é cancelada implicitamente. Não permitir que um replay substitua o cartão da operação original.
- [ ] Adicionar RED para recusa comum (mantém cartão/pedido), token inválido confirmado (apaga cartão e ajusta principal), falha ao apagar (mantém bloqueio/reconciliação, sem aviso falso), timeout (não apaga nem recobra).
- [ ] Implementar remoção e estado terminal de token inválido na mesma operação transacional. Preservar referência externa quando houver cobrança em estado incerto; não liberar outra forma somente pelo texto da resposta.
- [ ] Adicionar RED de troca cartão recusado → Pix → cartão no mesmo pedido, sem segunda cotação/pedido. Ajustar verificações antecipadas de método em ambos os handlers/entrypoints para deixar a RPC `reservar_tentativa_pagamento` decidir a transição sob lock; conservar dono, não pago, snapshot e bloqueio da tentativa anterior.
- [ ] Rodar GREEN nos testes das funções de cartão/PIX e `compra_cartao_salvo.test.sql`/`encerramento_pagamento.test.sql`. Confirmar que pendência/risco/reconciliação bloqueiam troca e que recusa terminal permite operação nova.

**Done:** pagamento salvo sem CVV e recuperação segura no mesmo pedido; token de outra conta nunca chega ao gateway.

### Task 7: Criar a Edge Function de cadastro com validação e estorno

**Files:**
- Create: `apps/supabase/supabase/migrations/20261015112000_validacao_cartoes.sql`.
- Create: `apps/supabase/supabase/tests/database/validacao_cartoes.test.sql`.
- Create: `apps/supabase/supabase/functions/tokenize-card/handler.ts`.
- Create: `apps/supabase/supabase/functions/tokenize-card/index.ts`.
- Create: `apps/supabase/supabase/functions/tokenize-card/handler.test.ts`.
- Create: `apps/supabase/supabase/functions/tokenize-card/index.test.ts`.
- Create: `apps/supabase/supabase/functions/tokenize-card/deno.json`.
- Create: `apps/supabase/supabase/functions/tokenize-card/deno.lock`.
- Create: `apps/supabase/supabase/functions/_shared/card-validation.ts`.
- Create: `apps/supabase/supabase/functions/_shared/card-validation.test.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/payment-http.ts`, `apps/supabase/supabase/functions/_shared/card-repository.ts`, `packages/shared-types/src/supabase.ts`.

**Interfaces:** `handleTokenizeCard({operacao_id, usuario_id, cartao, titular, remoteIp}, deps)` retorna `CardRegistration`. HTTP possui duas variantes estritas: `{acao: 'configuracao'}` retorna somente disponibilidade/valor do ambiente; `{acao: 'cadastrar', operacao_id, cartao, titular}` executa cadastro. Ambas exigem sessão; consultar configuração não gera operação financeira. `advanceCardValidation` consome repositório durável e `AsaasClient`. RPC pública `consultar_cadastro_cartao(p_operacao_id uuid)` retorna projeção segura; RPCs de claim/gravação/finalização são service-only.

- [ ] Escrever RED do caminho feliz: cliente autenticado → customer próprio → tokenizar → cobrar valor configurado → estornar integralmente → confirmar → um cartão disponível; zero pedidos/ledger de lojista. Confirmar que cartão de terceiros muda titular, não customer.
- [ ] Rodar RED: `pnpm --filter @keepit/supabase exec vitest run supabase/functions/tokenize-card/handler.test.ts supabase/functions/tokenize-card/index.test.ts supabase/functions/_shared/card-validation.test.ts`.
- [ ] Estender `payment-http` para cadastro que usa somente `operacao_id`, preservando validação UUID/CORS/auth dos endpoints antigos. A ação de configuração usa fronteira autenticada/CORS no novo handler e lê apenas `CARD_VALIDATION_AMOUNT_CENTS`, sem client privilegiado, claim ou chamada Asaas. No cadastro, verificar cliente ativo sob sessão antes de criar `service_role`; reutilizar validação de cartão/titular e IP confiável. Configuração ausente, valor do app, campos extras ou IP inválido falham antes do gateway.
- [ ] Completar na migration os campos de validação: valor em centavos, referência externa `card-validation:<operacaoId>`, IDs de cobrança/estorno, estágio, claim por etapa, erro seguro e timestamps. Permitir apenas uma validação não terminal por cliente, retornando a operação existente para evitar outra cobrança durante resposta perdida.
- [ ] Implementar `advanceCardValidation`: persistir claim antes de tokenizar; persistir token antes de cobrar; registrar ID e valor validado; solicitar estorno integral assim que a cobrança confirmar. Em aprovação assíncrona, deixar `validando`; em estorno solicitado, `estorno_pendente`; concluir somente após estorno integral confirmado. Apagar token temporário em recusa e depois de promovê-lo ao cartão salvo.
- [ ] Adicionar RED para duplo clique, timeout em cada etapa, tokenização sem resposta, erro de estorno, confirmação fora de ordem e encerramento da tela. Esperado: nenhum POST financeiro repetido, cartão ainda indisponível e operação consultável/reconciliável. Retentativa sem PAN retoma por consulta; nunca persistir o formulário para repetir tokenização.
- [ ] Rodar GREEN Vitest e `pnpm --filter @keepit/supabase exec supabase test db supabase/tests/database/validacao_cartoes.test.sql --local`. Adicionar import map compatível com `create-card-payment/deno.json`; gerar lock pela ferramenta Deno na execução futura, sem editar integridades manualmente.

**Done:** cadastro independente da compra, valor informado e estorno solicitado sem depender de o app continuar aberto. Não chamar `excluirCobranca` como substituto de estorno pago.

### Task 8: Reconciliar validações e encaminhar webhooks sem afetar pedidos

**Files:**
- Create: `apps/supabase/supabase/functions/reconcile-card-validation/handler.ts`.
- Create: `apps/supabase/supabase/functions/reconcile-card-validation/index.ts`.
- Create: `apps/supabase/supabase/functions/reconcile-card-validation/handler.test.ts`.
- Create: `apps/supabase/supabase/functions/reconcile-card-validation/index.test.ts`.
- Create: `apps/supabase/supabase/functions/reconcile-card-validation/deno.json`.
- Create: `apps/supabase/supabase/functions/reconcile-card-validation/deno.lock`.
- Modify: `apps/supabase/supabase/functions/_shared/card-validation.ts`, `apps/supabase/supabase/functions/_shared/card-validation.test.ts`.
- Modify: `apps/supabase/supabase/functions/asaas-payment-webhook/handler.ts`, `apps/supabase/supabase/functions/asaas-payment-webhook/index.ts`, `apps/supabase/supabase/functions/asaas-payment-webhook/handler.test.ts`.
- Modify: `apps/supabase/supabase/functions/asaas-payment-webhook/deno-config.test.ts`.
- Create: `apps/supabase/supabase/migrations/20261015112500_eventos_validacao_cartoes.sql`.
- Modify: `apps/supabase/supabase/tests/database/validacao_cartoes.test.sql`.
- Modify: `packages/core-data/src/ports/admin.port.ts`, `packages/core-data/src/supabase/admin.supabase.ts`, `packages/core-data/src/mock/admin.mock.ts`, `apps/admin/src/hooks/useAdminOps.ts`.
- Modify: `apps/admin/src/hooks/useAdminOps.test.ts`, `apps/admin/src/lib/financialLabels.ts`, `apps/admin/src/lib/financialLabels.test.ts`, `apps/admin/app/(dashboard)/financeiro/page.tsx`, `apps/admin/app/(dashboard)/financeiro/page.test.tsx`.
- Modify: `packages/shared-types/src/supabase.ts`.
- Create: `packages/core-data/src/supabase/admin.card-validation.test.ts`.

**Interfaces:** `reconcile-card-validation` recebe `{operacaoId: string}`, autentica Admin antes de client privilegiado e usa `advanceCardValidation`. O webhook recebe método novo `processCardValidationEvent(input: PaymentEventInput): Promise<{handled: boolean; operacaoId: string | null}>`; se não tratado, mantém processadores existentes. `AdminPort.reconciliarValidacaoCartao(operacaoId)` retorna estado público; pendência tem tipo `validacao_cartao`, referência e idade, sem token.

- [x] Escrever RED: evento de validação com referência persistida não chama processador de pedido/refund de pedido; evento desconhecido continua durável; webhook repetido e reconciliação simultânea resultam em um estorno e um cartão.
- [x] Rodar RED: `pnpm --filter @keepit/supabase exec vitest run supabase/functions/reconcile-card-validation/handler.test.ts supabase/functions/reconcile-card-validation/index.test.ts supabase/functions/asaas-payment-webhook/handler.test.ts supabase/functions/_shared/card-validation.test.ts`.
- [x] Criar recibo de evento único e RPC transacional de validação, validando cobrança, customer, método, valor integral e referência. Encaminhar eventos de validação antes da ramificação de estornos de pedidos. Receber evento antes de persistir ID externo deve reconciliar pelo vínculo de operação, sem descartá-lo como pedido ausente.
- [x] Implementar recuperação Admin por ID externo ou referência. Uma cobrança encontrada precisa bater customer/valor/método/referência. Lista vazia, múltiplas cobranças ou paginação incompleta mantêm reconciliação; não autorizam novo POST. Estorno com resposta perdida é consultado antes de qualquer nova ação; ausência de prova mantém pendência. Customer incerto da operação também é consultado pela referência, sem recriação automática.
- [x] Adicionar RED para cliente comum chamando o reconciliador, valor divergente, refund parcial, evento atrasado e `REFUND_DENIED`. Estorno parcial/negado não conclui cadastro. Runner sob claim retoma estorno comprovadamente faltante quando um webhook confirmar a cobrança, mesmo sem sessão móvel ativa.
- [x] Incorporar `validacao_cartao` à listagem de pendências e a ação `reconciliar_validacao_cartao` ao contrato, labels, hook e página financeira. Na migration desta tarefa, ampliar a projeção SQL administrativa de pendências para incluir essas operações sem pedido. Teste do adapter e da página garante operação visível, sem sumir por filtro/paginação, sem segredo e sem link de pedido quando `pedidoId` for nulo.
- [x] Rodar GREEN dos testes Edge, SQL, `pnpm --filter @keepit/core-data exec vitest run src/supabase/admin.card-validation.test.ts` e `pnpm --filter @keepit/admin exec vitest run src/hooks/useAdminOps.test.ts src/lib/financialLabels.test.ts 'app/(dashboard)/financeiro/page.test.tsx'`. Atualizar teste de configuração Deno para os dois novos entrypoints. Registrar na seção de evidências deste plano a rotina diária de conferir e reconciliar pendências de validação, sem escrever tokens.

**Registro de execução — 2026-10-15:** Task 8 entregue em commits `838a67b`, `1a1ce17` e `d50ec02`. A regressão de webhook tardio foi reproduzida em pgTAP antes do GREEN: operação concluída era reaberta e podia violar o índice de uma operação ativa. Evidência final local: 51 asserts em `validacao_cartoes`, 170 asserts pgTAP nos quatro arquivos de cartões, 228/228 Vitest em `@keepit/supabase`, typecheck Turbo 9/9 e `git diff --check`; revisão independente sem blocker. Em `keepit-dev` (`jhhbewnmnorhmsdvfppo`), `migration list` passou de 78/78 para 79/79; dry-run e aplicação tiveram exclusivamente `20261015113000_eventos_validacao_cartoes.sql`; ACLs das RPCs conferidas. `reconcile-card-validation/deno.lock` continua pendente: Deno não está disponível e o lock não foi inventado.

**Done:** validação/estorno têm recuperação independente do dispositivo e não interferem em pedido, PIN, comissão ou repasse.

### Task 9: Expor cartões e erros tipados pelos adapters core-data

**Files:**
- Create: `packages/core-data/src/ports/saved-cards.port.ts`.
- Create: `packages/core-data/src/payment-errors.ts`.
- Create: `packages/core-data/src/supabase/saved-cards.supabase.ts`.
- Create: `packages/core-data/src/supabase/saved-cards.supabase.test.ts`.
- Create: `packages/core-data/src/mock/saved-cards.mock.ts`.
- Create: `packages/core-data/src/mock/saved-cards.mock.test.ts`.
- Modify: `packages/core-data/src/ports/payment.port.ts`, `packages/core-data/src/supabase/payment.supabase.ts`, `packages/core-data/src/supabase/payment.supabase.test.ts`.
- Modify: `packages/core-data/src/mock/payment.mock.ts`, `packages/core-data/src/mock/payment.mock.test.ts`, `packages/core-data/src/index.ts`.

**Interfaces:** Implementa integralmente os contratos compartilhados e adiciona `DataClient.savedCards` nos dois factories. Recebe sessão Supabase já compartilhada; nenhum client privilegiado no pacote móvel.

- [x] Escrever RED do adapter: listagem usa projeção segura; cadastro chama `tokenize-card` apenas com campos permitidos; cobrança por ID chama `create-card-payment` sem dados completos; nova compra envia `salvar_cartao` explicitamente.
- [x] Rodar RED: `pnpm --filter @keepit/core-data exec vitest run src/supabase/saved-cards.supabase.test.ts src/supabase/payment.supabase.test.ts src/mock/saved-cards.mock.test.ts src/mock/payment.mock.test.ts`.
- [x] Criar porta, tipos e factories. Implementar listagem/gestão/consulta via RPCs definidas; configuração e cadastro via `tokenize-card`, com `acao: 'configuracao'` e `acao: 'cadastrar'` respectivamente. Mapear apenas campos públicos. Parser rejeita forma/tipos inválidos; descarta campos extras, token e customer mesmo se o servidor os devolver por erro.
- [x] Adicionar RED para erro não-2xx guardado no `Response` do SDK: recusa/token inválido/reconciliação precisam preservar `code` permitido. Erro desconhecido vira indisponibilidade segura, sem copiar mensagens ou `details` externos. O aviso `nao_salvo` não rejeita uma tentativa financeira válida.
- [x] Substituir o catch genérico de `pagarCartao` por `PaymentActionError` com mensagens locais. Mock usa IDs demonstrativos e metadados, nunca token gateway; testar principal/remoção e isolamento na troca de sessão. Manter erro explícito em falha Supabase, sem fallback para mock.
- [x] Rodar GREEN com o mesmo comando e conferir exportações em `index.ts`. Garantir que `CardInput`/`HolderInput` só transitam pela chamada e não entram em estado persistente mock.

**Done:** telas podem usar a mesma porta em demonstração e real, com diferenças de erro suficientes para a recuperação aprovada.

### Task 10: Adaptar formulário para consentimento e titular próprio/terceiro

**Files:**
- Create: `apps/cliente/src/components/checkout/CardPaymentForm.tsx`.
- Modify: `apps/cliente/src/screens/home/AdicionarCartao.tsx`.
- Modify: `apps/cliente/src/screens/home/cardPaymentForm.test.ts`.
- Modify: `apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx`.

**Interfaces:** Extrair o formulário existente para componente compartilhado. Props: `mode: 'compra' | 'perfil'`, `initialHolder: Partial<HolderInput>`, `disabled`, `valorValidacaoCentavos: number | null` e `onSubmit({cartao, titular, salvarCartao})`. `salvarCartao` inicia true na compra; no perfil, salvar é a própria ação explícita. `AdicionarCartao` passa a consumir a porta, sem `cart.addCard` no modo real.

- [x] Escrever RED com o react-test-renderer já usado em `cardPaymentForm.test.ts`: checkbox “Salvar este cartão” marcado no modo compra; desmarcar altera somente a autorização; payload válido continua com os campos atuais.
- [x] Rodar RED: `pnpm --filter @keepit/cliente exec vitest run src/screens/home/cardPaymentForm.test.ts`.
- [x] Extrair o componente preservando tokens visuais, `TextField`, `Button`, `Checkbox` e limpeza no envio/blur/background/logout. Preencher nome/CPF/telefone/e-mail e endereço apenas quando disponíveis no cadastro; campo ausente permanece editável e obrigatório conforme contrato.
- [x] Adicionar RED para “Sou o titular” desmarcado: limpar dados pré-preenchidos para terceiro, permitir edição e enviar nome/CPF/telefone/CEP próprios do terceiro, também e-mail/número do endereço. Não alterar cliente/customer. Validar número com 13–19 dígitos e CVV de 3–4, conforme formulário real existente.
- [x] Implementar no perfil a exibição do valor consultado e texto “Será feita uma cobrança de validação de [valor], estornada em seguida. O prazo de aparecer na fatura depende do emissor.” Valor indisponível bloqueia envio; ação é “Salvar e validar cartão”. Compra mantém “Pagar” e não anuncia validação adicional.
- [x] Rodar GREEN; repetir testes de saída/logout/background e acrescentar que PAN/CVV não aparecem em callbacks de navegação/storage/analytics. Limpeza imediata independe da resposta do servidor.

**Done:** um formulário transitório serve aos dois contextos sem carregar dados sensíveis entre telas.

### Task 11: Listar, definir principal e apagar pelo perfil

**Files:**
- Create: `apps/cliente/src/hooks/useSavedCards.ts`.
- Create: `apps/cliente/src/hooks/useSavedCards.test.ts`.
- Create: `apps/cliente/src/screens/perfil/Cartoes.tsx`.
- Create: `apps/cliente/src/screens/perfil/Cartoes.test.ts`.
- Modify: `apps/cliente/src/screens/perfil/Perfil.tsx`, `apps/cliente/src/navigation/PerfilStack.tsx`, `apps/cliente/src/navigation/HomeStack.tsx`, `apps/cliente/src/navigation/types.ts`, `apps/cliente/src/screens/home/AdicionarCartao.tsx`.

**Interfaces:** `useSavedCards(clienteId: string | null)` devolve `cards`, `loading`, `error`, `refresh`, `definirPrincipal(cartaoId)`, `remover(cartaoId)`. Cada mutação mantém `operacaoId` estável até conclusão. `PerfilStack` ganha `Cartoes` e `AdicionarCartao`; Home mantém rota de demonstração ou encaminha ao cadastro real. Rotas levam contexto/ID da operação, nunca cartão/titular/token.

- [x] Escrever RED: “Formas de pagamento” abre lista real; dois cartões mostram principal; definir principal e apagar atualizam pela lista devolvida do servidor. Remover principal promove o restante; remover último mostra estado vazio.
- [x] Rodar RED: `pnpm --filter @keepit/cliente exec vitest run src/hooks/useSavedCards.test.ts src/screens/perfil/Cartoes.test.ts`.
- [x] Implementar hook sem persistência de cartões reais em AsyncStorage; lista recarrega ao focar e após mutação/cadastro. Na troca de identidade, limpar lista e ignorar resposta da geração anterior. Não usar primeiro cartão de `CartContext` como autoridade.
- [x] Substituir o alerta “Em breve” do perfil por navegação e compor a tela com componentes existentes. Confirmar remoção do cartão selecionado por final/bandeira; explicar que isso não cancela pedidos já pagos, sem mostrar tokens.
- [x] Integrar `AdicionarCartao` ao cadastro e consulta da operação: manter somente `operacaoId` escopado à sessão para retomada, exibir validação/estorno pendentes e concluir apenas em `concluido`. Servidor devolve operação ativa se novo toque chegar durante uma anterior pendente. Reabrir a tela não repete formulário nem cobrança automaticamente.
- [x] Rodar GREEN; cobrir logout durante listagem, erro de remoção (não sumir antes de confirmação), replay e cadastro recusado. Atualizar tipos das stacks sem duplicar formulário ou criar callbacks com dados sensíveis na navegação.

**Done:** gestão real pelo perfil com estado honesto para validação e estorno, preservando isolamento de sessão.

### Task 12: Integrar seleção, revisão e recuperação no mesmo pedido

**Files:**
- Modify: `apps/cliente/src/screens/home/Pagamento.tsx`, `apps/cliente/src/screens/home/Checkout.tsx`.
- Modify: `apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx`, `apps/cliente/src/screens/modals/ModalPagamentoPix.tsx`, `apps/cliente/src/screens/modals/paymentScreens.test.ts`.
- Modify: `apps/cliente/src/hooks/usePagamentoReal.ts`, `apps/cliente/src/lib/paymentStatus.ts`, `apps/cliente/src/lib/paymentStatus.test.ts`.
- Modify: `apps/cliente/src/lib/paymentSubmission.ts`, `apps/cliente/src/lib/paymentSubmission.test.ts`, `apps/cliente/src/navigation/types.ts`.
- Modify: `apps/cliente/src/context/CartContext.tsx`, `apps/cliente/src/lib/cartStorage.ts`, `apps/cliente/src/lib/cartStorage.test.ts`.
- Create: `apps/cliente/src/screens/home/savedCardCheckout.test.ts`.
- Create: `apps/cliente/src/hooks/usePagamentoReal.test.ts`.

**Interfaces:** `PaymentSelection` ganha variante explícita de cartão novo e preserva variante salva por ID; não usar ID fictício `transitorio` como cartão real. O alvo de `paymentSubmission` conserva `cartaoSalvoId` opcional antes de limpar carrinho. Modal recebe `pedidoId` e, opcionalmente, `cartaoSalvoId`; dados sensíveis permanecem no formulário montado. Hook `pagarCartao(input)` recebe a variante pública sem `pedidoId/operacaoId`, que o próprio hook resolve.

- [x] Escrever RED: Checkout mostra principal do backend sem sobrescrever seleção explícita; Pagamento lista todos e permite novo cartão; revisão contém resumo/valor e final selecionado. Montagem, seleção, polling e retorno de background resultam em zero chamadas de cobrança.
- [x] Rodar RED: `pnpm --filter @keepit/cliente exec vitest run src/screens/home/savedCardCheckout.test.ts src/screens/modals/paymentScreens.test.ts src/hooks/usePagamentoReal.test.ts src/lib/paymentSubmission.test.ts src/lib/paymentStatus.test.ts src/lib/cartStorage.test.ts`.
- [x] Usar `useSavedCards` no modo real e `SavedCardsPort` no modo demonstrativo. Migrar seleção persistida para variantes explícitas; revalidar ID contra lista da sessão antes de usar. Limpar seleção removida/inválida sem trocar silenciosamente o cartão a cobrar.
- [x] Preservar sequência: Checkout revisa pedido; Pagamento seleciona método e continua; modal apresenta valor/resumo da revisão e botão final “Pagar”. Cartão salvo exige esse toque e envia ID; novo usa formulário com salvar marcado. Nenhum efeito de montagem cobra. Renomear ação intermediária para “Continuar” para não sugerir cobrança antes da revisão final.
- [x] Preservar criação idempotente por `paymentSubmission` e capturar ID selecionado antes de `clearOrder`. Falha na limpeza conserva alvo e não cria pedido novamente. Ao reabrir pedido, carregar tentativa persistida; nunca recobrar automaticamente com base em parâmetros de rota.
- [x] Adicionar RED de recusa: mesmo `pedidoId`, aviso específico, outro cartão/Pix disponíveis após terminal; novo `operacaoId` estável para a tentativa seguinte. Token inválido remove da lista, limpa seleção e avisa; recusa normal mantém cartão. Reconciliação bloqueia opções até estado resolvido, com botão de atualizar.
- [x] Implementar erros tipados no hook sem transformá-los em bloqueio permanente do formulário. Reusar `encerrarTentativa` quando existir efeito pendente encerrável, respeitar resultado persistido e navegar ao Pix com o mesmo pedido. Preservar `onComplete` somente quando consulta retornar `confirmado/recebido`.
- [x] Rodar GREEN com o mesmo comando. Testar duplo toque, cartão removido em outro dispositivo, falha de rede e aviso de salvamento incompleto, sem uso de biometria/CVV no fluxo salvo.

**Done:** compra e recuperação completas, sem pedido duplicado, cobrança implícita ou perda do cartão escolhido durante limpeza do carrinho.

### Task 13: Apagar tokens na exclusão definitiva e atualizar matriz do plano 5

**Files:**
- Create: `apps/supabase/supabase/migrations/20261015113500_cartoes_exclusao_conta.sql`.
- Create: `apps/supabase/supabase/tests/database/cartoes_exclusao_conta.test.sql`.
- Create: `apps/supabase/supabase/tests/database/cartoes_exclusao_concurrency.py`, com as mesmas guardas de banco descartável da Task 2.
- Create: `apps/supabase/supabase/functions/_shared/account-deletion-cards.ts` e `apps/supabase/supabase/functions/_shared/account-deletion-cards.test.ts`.
- Modify: `apps/supabase/supabase/functions/_shared/card-repository.ts`, `apps/supabase/supabase/functions/_shared/card-customer.ts`.
- Modify: `apps/supabase/supabase/functions/account-deletion/handler.test.ts`, `apps/supabase/supabase/functions/account-deletion/README.md`.
- Modify, somente na execução futura: `docs/superpowers/plans/2026-10-01-integracao-05-fechamento-mvp.md`.
- Reference: `apps/supabase/supabase/functions/account-deletion/handler.ts`, `apps/supabase/supabase/migrations/20260905183409_account_deletion_lifecycle.sql`, Task 13 de `docs/superpowers/plans/2026-09-30-integracao-04-repasses.md`.

**Interfaces:** Produz `public.purgar_cartoes_conta(p_user_id uuid, p_solicitacao_id uuid)` acessível apenas a `service_role`. Valida solicitação vencida/em processamento, política de retenção aprovada e dono, serializa por cliente, elimina cartões/tokens temporários e marca bloqueio de recriação. Integra-se à exclusão definitiva dos planos 04/05; não cria uma segunda API destrutiva pública em `account-deletion`.

**Dependência explícita:** a Task 13 do plano 04 e o gate do plano 5 devem fornecer o processador definitivo e a matriz geral aprovada. Fixar para essa integração os arquivos futuros `apps/supabase/supabase/functions/process-account-deletions/handler.ts` e `apps/supabase/supabase/functions/process-account-deletions/handler.test.ts`; alterar esses arquivos na entrega compartilhada dos planos, não presumir que existem hoje. O módulo novo `purgeAccountCards({userId, solicitacaoId}, deps)` chama a RPC e só permite continuar a conclusão após confirmar ausência de tokens. Não criar um processador alternativo que ignore a política geral.

- [x] Escrever RED SQL: A com cartões e token temporário, B com cartão; exclusão definitiva autorizada de A elimina todos os tokens de A e preserva B/referências financeiras permitidas. Repetir purga é sucesso idempotente; sessão cliente/lojista/Admin comum não executa RPC privilegiada.
- [x] Rodar RED: `pnpm --filter @keepit/supabase exec supabase test db supabase/tests/database/cartoes_exclusao_conta.test.sql --local` (neste ambiente sem binário local, RED observado pela CLI temporária `npx -y supabase@latest` na stack descartável).
- [x] Criar purga transacional incluindo `clientes_cartoes`, cópias de token em `cartoes_operacoes` e vínculo reutilizável de `clientes_asaas`. Não guardar token em tombstone, auditoria ou resposta. Manter somente referências financeiras permitidas pela matriz geral para concluir eventuais estornos, sem precisar reter cartão.
- [x] Adicionar RED de corrida: tokenização iniciada antes da exclusão retorna depois → gravação bloqueada e token descartado; cobrança já enviada continua conciliável, sem restaurar cartão. Agendamento/cancelamento dentro dos sete dias não purga prematuramente. Falha intermediária não permite declarar exclusão concluída.
- [ ] Integração ponta a ponta com o claimant/anonimizador geral dos planos 04/05 permanece pendente: `process-account-deletions/handler.ts` fornece o passo testado que chama `purgeAccountCards` antes de `complete` e falha fechado, mas ainda não há runtime claimant/conclusão nem decisão aprovada para o `ON DELETE RESTRICT` de `account_deletion_requests`.
- [x] Inserir no plano 5 uma seção “Matriz de retenção — cartões salvos” com a linha exata da spec: finalidade reutilização; exclusão individual/invalidade/exclusão definitiva; apagar tokens salvos e temporários; sem retenção financeira do token; responsável/evidência e prevenção de reativação por restauração. Vincular a entrega à Task 13 do plano 04 e ao gate da Task 5 do plano 5.
- [x] Rodar GREEN SQL, `pnpm --filter @keepit/supabase exec vitest run supabase/functions/account-deletion/handler.test.ts supabase/functions/_shared/card-customer.test.ts supabase/functions/_shared/account-deletion-cards.test.ts supabase/functions/process-account-deletions/handler.test.ts` e `python3 apps/supabase/supabase/tests/database/cartoes_exclusao_concurrency.py`, com ambiente descartável configurado. A rotina definitiva agora chama a purga antes da conclusão; a política geral continua fail-closed até aprovação operacional, sem confundir agendamento com exclusão definitiva.

**Done:** tokens eliminados e impossíveis de recriar após exclusão; linha efetivamente presente na matriz do plano 5 na implementação.

### Task 14: Validar integração e executar os três E2E obrigatórios no sandbox

**Files:**
- Modify, na execução futura: seção “Registro de evidências” deste plano e critérios de aceite da spec.
- Reference: testes criados nas Tasks 2–13, `apps/supabase/supabase/functions/create-card-payment/deno.json`, `apps/supabase/supabase/functions/asaas-payment-webhook/README.md` e plano 5.

**Interfaces:** Consome app, migrations, funções e adapters completos. Produz evidência por cenário com IDs sintéticos, estados esperados/observados, sem tokens, PAN/CVV, dados reais de terceiros ou segredos.

- [ ] Em execução futura autorizada, executar a verificação integrada local: `pnpm --filter @keepit/supabase test`, `pnpm --filter @keepit/core-data test`, `pnpm --filter @keepit/cliente test` e `pnpm --filter @keepit/supabase --filter @keepit/core-data --filter @keepit/cliente --filter @keepit/admin --filter @keepit/shared-types typecheck`. Incluir os testes Admin explícitos da Task 8 e a suíte SQL/concorrência relevante em banco descartável. Scripts `echo skipped` não contam como validação. Não gerar build/deploy como efeito implícito desta tarefa documental.
- [ ] Conferir gates: habilitação dos dois ambientes, política de retenção/exclusão definitiva integrada e homologação preparada conforme plano 5. A publicação coordenada futura de migrations/funções e uso de app real requer a etapa remota autorizada; este plano não aplica mudanças no Cloud por si só.
- [ ] **E2E aprovado:** cliente sintético A faz pedido, revisa, paga com novo cartão sandbox e salvar marcado. Confirmar uma cobrança e cartão salvo; webhook libera o pagamento. Segundo pedido usa o mesmo cartão por ID, sem CVV/biometria, com customer igual, cobrança única e confirmação persistida. Repetir com salvar desmarcado em outra compra e provar ausência de token salvo.
- [ ] **E2E recusado:** usar cenário oficial de recusa sandbox, pagar após revisão e conferir pedido ainda `aguardando_pagamento`, sem PIN/aceite. Confirmar mensagem e opções, preservar cartões válidos e recuperar o mesmo pedido com outro cartão ou Pix após terminal. Registrar referências antes/depois e ausência de duplicidade.
- [ ] **E2E token inválido:** cadastrar cartão sintético e preparar exclusivamente no sandbox uma fixture privilegiada com token inválido, mantendo cliente/customer/ID interno coerentes; não criar endpoint público para isso nem registrar o token. Pagar pelo app e exigir resposta efetiva do Asaas classificada pela Task 1. Conferir remoção no backend, aviso, limpeza da seleção, promoção do principal e recuperação do mesmo pedido. Falha local de ownership ou mock não conta como este cenário.
- [ ] Validar complementos: perfil tokeniza, cobra baixo valor informado e estorna integralmente; interrupção do app não perde estorno; dois clientes não compartilham tokens; titular terceiro não altera customer; exclusão definitiva elimina tokens salvos/temporários. Registrar operação pendente como pendente, nunca como estornada pelo simples HTTP 200 da solicitação.
- [ ] Revisar cobertura dos 11 critérios da spec, versões e evidências. Falta de qualquer um dos três E2E obrigatórios bloqueia aceite. Não marcar aprovado por testes unitários, mocks ou documentação do provedor.

**Done:** cobrança aprovada, recusada e token inválido comprovados no sandbox, além dos controles locais e complementos de perfil/exclusão. Nenhuma cobrança de produção é exigida por este plano.

## Registro de evidências

Estado na entrega documental de 2026-10-15: **não executado**. Não foram executados testes, build, deploy, tokenização ou cobrança. Não foram verificados credenciais ou acesso da conta Asaas. As fontes públicas foram usadas apenas para checar contratos, sem substituir as decisões do brainstorm.

Na execução futura, adicionar uma linha por cenário contendo: data UTC; ambiente; versão da implementação; migrations/Edge Functions usadas; cliente sintético; pedido/operação; ID da cobrança e eventos; estado esperado; estado observado; resultado; referência da evidência sanitizada. Não colar respostas brutas de pagamentos.

**Rotina diária de validações pendentes (Task 8):** operador Admin consulta a fila `validacao_cartao`, reconcilia cada operação pelo ID público e registra somente operação, referência externa sanitizada, estado e resultado. Lista vazia, múltipla ou paginada e divergência de customer/método/valor/referência permanecem pendentes; a rotina não cria cobrança, tokenização ou estorno sem confirmação do gateway e nunca registra token, PAN ou CVV.

| Gate | Situação inicial | Tarefa responsável |
|---|---|---|
| Tokenização habilitada sandbox e produção | Pendente de comprovação da conta | 1 |
| RLS, ownership, principal e concorrência | Planejado, não executado | 2–6 |
| Cadastro, validação e estorno pelo perfil | Planejado, não executado | 7–11 |
| Revisão, consentimento e recuperação | Planejado, não executado | 5, 6, 10, 12 |
| Purga e linha na matriz do plano 5 | Planejado; depende da exclusão definitiva | 13 |
| E2E cobrança aprovada | Não executado | 14 |
| E2E cobrança recusada | Não executado | 14 |
| E2E token inválido | Não executado | 14 |

## Revisão de cobertura do plano

| Decisão do brainstorm | Entrega |
|---|---|
| 1 e 7 — tokenização e ligação ao backend | Tasks 2–9 |
| 2 — salvar marcado na primeira compra | Tasks 5 e 10 |
| 3 — vários cartões, principal e apagar | Tasks 2 e 11–12 |
| 4 — pagar por token após revisão, sem CVV/biometria | Tasks 6 e 12 |
| 5 — recusa mantém pedido; inválido remove e avisa | Tasks 6, 9 e 12 |
| 6 — terceiro com dados do titular | Tasks 3, 7 e 10 |
| 8 — habilitação pré-merge | Tasks 1 e 14 |
| 9 — validação de baixo valor estornada | Tasks 7–8 e 11 |
| 10 — tokens apagados e matriz do plano 5 | Task 13 |
| 11 — customer do próprio cliente | Tasks 2–6 |
| 12 — três E2E sandbox obrigatórios | Task 14 |

Ordem: 1 registra gates; 2 → 3 → 4 → 5 → 6 estabilizam dados e compra; 7 → 8 completam perfil/reconciliação; 9 → 10 → 11 → 12 integram o app; 13 fecha exclusão e retenção; 14 verifica o conjunto. Cada tarefa encerra seu ciclo RED/GREEN antes da próxima dependente. Ao terminar a implementação, revisar contratos e critérios sem assumir autorização de commit, push, merge ou deploy.
