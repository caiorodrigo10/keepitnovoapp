# Complementos de produto — SPEC + plano curto

Design aprovado por Caio. Execução: Terra. Escopo: MVP básico, por produto, sobre os fluxos atuais de React Native/TypeScript, core-data e Supabase. Este documento não implementa a feature.

## Estado atual conferido

- `apps/supabase/supabase/migrations/20260812190000_criar_produtos.sql`: produto tem `preco_reais numeric(10,2)`, nome, descrição, categoria, foto, ativo e exclusão lógica; não há estoque real.
- `apps/supabase/supabase/migrations/20260813004933_criar_pedidos_itens.sql`: **já existe snapshot do produto** (`nome_snapshot`, `preco_unitario_reais`, quantidade e subtotal). Falta snapshot dos complementos. A migration `apps/supabase/supabase/migrations/20261018100000_pedidos_itens_separacao.sql` acrescenta `separado`/`separado_em` e a RPC do checklist.
- `apps/supabase/supabase/migrations/20260930171011_taxas_versionadas_e_cotacao.sql`: `cotar_pedido` recebe linhas com `produtoId`/`quantidade`, valida também cliente, loja, hub e horários, rejeita produto repetido e soma preço base × quantidade. Guarda os itens calculados em `private.cotacoes.itens`.
- `apps/supabase/supabase/migrations/20260930174958_pedidos_pendentes_e_tentativas_pagamento.sql`: `criar_pedido_cotado` reconstrói o input, recota e compara snapshots antes de inserir o pedido. O caminho legado `criar_pedido` exige cotação.
- `apps/supabase/supabase/migrations/20261015120200_exclusao_acesso_mvp.sql`: os corpos de cotação/criação foram renomeados para `cotar_pedido_sem_guarda_exclusao` e `criar_pedido_cotado_sem_guarda_exclusao`; wrappers públicos aplicam a guarda de conta. A nova migration deve preservar esses wrappers e permissões.
- `apps/lojista/src/screens/catalogo/ProductForm.tsx`: nome, descrição, preço, categoria, foto e `estoqueDisplay` apenas visual. `apps/cliente/src/screens/home/DetalheProduto.tsx`: seleção apenas da quantidade.
- `apps/cliente/src/lib/cartRules.ts` funde por `produtoId`; `apps/cliente/src/context/CartContext.tsx` também incrementa/remove por esse ID. `apps/cliente/src/lib/cartStorage.ts` persiste campos explícitos.
- `apps/cliente/src/screens/home/Checkout.tsx` e `packages/core-data/src/supabase/checkout.supabase.ts` enviam somente `{produtoId, quantidade}`. `apps/lojista/src/screens/pedidos/DetalheSepararPedido.tsx` lista o snapshot do produto e marca separação por `PedidoItem.id`.

## 1. Modelo de dados e persistência

Criar **nova migration**, após as existentes, em `apps/supabase/supabase/migrations/`, com nome descritivo `complementos_produto_mvp` e timestamp gerado pela CLI. Não editar migrations antigas.

| Estrutura nova | Colunas/regras |
| --- | --- |
| `public.produto_complemento_grupos` | `id uuid PK`, `produto_id uuid NOT NULL FK produtos ON DELETE CASCADE`, `nome text NOT NULL`, `tipo text NOT NULL` (`unica`/`multipla`), `min_selecoes int NOT NULL`, `max_selecoes int NOT NULL`, `ordem int NOT NULL DEFAULT 0` |
| `public.produto_complemento_itens` | `id uuid PK`, `grupo_id uuid NOT NULL FK produto_complemento_grupos ON DELETE CASCADE`, `nome text NOT NULL`, `preco_extra_reais numeric(10,2) NOT NULL DEFAULT 0 CHECK >= 0`, `ordem int NOT NULL DEFAULT 0` |
| `public.pedidos_itens` | Acrescentar `complementos_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb`, com CHECK de array. Não exige backfill de nomes/preços históricos. |

Nomes não podem ser vazios após trim. Indexar as FKs `produto_id` e `grupo_id`. Ordenar por `ordem, id`; sem interface de arrastar no MVP.

Regras únicas para formulário e servidor:

- Obrigatório significa `min_selecoes >= 1`; opcional significa `min_selecoes = 0`. O seletor obrigatório/opcional da UI deriva desse valor, sem coluna booleana redundante.
- Única: `max_selecoes = 1`, mínimo 0 ou 1. Múltipla: `0 <= min_selecoes <= max_selecoes`, máximo >= 1. Validar também máximo <= número de itens cadastrados; não salvar grupo vazio.
- Cada complemento pode ser selecionado uma vez por unidade de produto. Quantidade 2 repete a mesma seleção duas vezes; configurações distintas são linhas distintas.
- Extra zero é válido. Preço negativo, inválido ou com mais de duas casas decimais é rejeitado; nenhuma mudança na regra de preço base positivo.

**Salvar:** estender create/update de produto com grupos aninhados e usar uma RPC transacional para produto + grupos + itens. Omitir grupos no update preserva os existentes; enviar `[]` remove todos. Preservar IDs dos registros mantidos, gerar IDs dos novos e remover apenas os omitidos. Rejeitar IDs pertencentes a outro produto/grupo. Erro desfaz toda a gravação; evitar produto publicado pela metade. Exclusão de complemento não afeta pedidos anteriores.

**Acesso:** ENABLE/FORCE RLS nas duas tabelas. SELECT público segue exatamente a visibilidade do produto e da loja; dono pode ler seus grupos para edição, inclusive de produtos pausados; admin segue o padrão existente. Escrita apenas pela RPC, autenticada, validando dono via produto → estabelecimento e `conta_tem_acesso()`/guarda vigente (ou admin), sem confiar no estabelecimento informado. Revogar DML direto de anon/authenticated; RPC privilegiada com `search_path` fixo, verificação explícita de acesso e EXECUTE somente para authenticated. `pedidos_itens` mantém leitura derivada do pedido e snapshot sem escrita direta pelo app; checklist continua pela RPC atual.

**Snapshot:** array de objetos com `grupoId`, `grupoNome`, `itemId`, `itemNome`, `precoExtraCentavos` (por unidade), preenchido exclusivamente pelo servidor. `preco_unitario_reais` passa a representar base + extras; `subtotal_reais = preco_unitario_reais × quantidade`. Os IDs no JSON não são FKs: nomes/preços permanecem legíveis após editar ou excluir o catálogo. Pedidos antigos usam array vazio.

## 2. Core-data: contratos e adapters

- `packages/core-data/src/ports/product.port.ts`: definir tipos `ComplementoGrupo`/`ComplementoItem` com os campos acima; `Produto.gruposComplementos` é array (vazio para produto simples). Inputs create/update aceitam `gruposComplementos`; IDs opcionais apenas para grupos/itens novos. Manter as assinaturas atuais de `ProductPort`, sem novo serviço de catálogo.
- `packages/core-data/src/supabase/product.supabase.ts` e `packages/core-data/src/mock/product.mock.ts`: leitura aninhada e gravação com as mesmas regras; evitar consulta por produto em loops. Atualizar fixtures em `packages/core-data/src/mock/fixtures/produtos.ts` e exportações em `packages/core-data/src/index.ts`.
- `packages/core-data/src/ports/checkout.port.ts`: cada linha de `CotacaoInput.itens` recebe `complementoIds?: string[]`; ausente equivale a `[]`. Payload contém IDs e quantidade, nunca preços ou nomes como autoridade. `CheckoutPort.criar` continua recebendo `cotacaoId`.
- `packages/core-data/src/ports/order.port.ts`: acrescentar tipo do snapshot e `PedidoItem.complementos_snapshot`. Propagar no select/mapeamento de `packages/core-data/src/supabase/order.supabase.ts`, no mock `packages/core-data/src/mock/order.mock.ts` e no input interno usado pelo checkout mock.
- Atualizar `packages/core-data/src/supabase/checkout.supabase.ts` para não descartar os IDs e `packages/core-data/src/mock/checkout.mock.ts` para reproduzir seleção, cotação, recotação e snapshot. Atualizar tipos de banco em `packages/shared-types/src/supabase.ts` pelo fluxo existente.

## 3. Telas de cadastro e seleção

**Lojista:** adicionar seção “Complementos” em `apps/lojista/src/screens/catalogo/ProductForm.tsx`: adicionar/remover grupo; nome; obrigatório/opcional; única/múltipla; min/max simples; adicionar/remover itens com nome e preço extra. Na única, limites são automáticos; na múltipla opcional, mínimo é zero. Mostrar erros junto ao campo/grupo. Produto sem grupos continua válido. Integrar valores e persistência em `CadastrarProduto.tsx`, `EditarProduto.tsx` e `ProductCatalogContext.tsx`, no mesmo diretório. Carregar grupos existentes na edição, aguardar salvamento e preservar o formulário em caso de erro.

**Cliente:** em `apps/cliente/src/screens/home/DetalheProduto.tsx`, mostrar grupos antes da quantidade, identificação de obrigatório/opcional e limites. Radio para única (opcional permite “Nenhum”); checkbox para múltipla. Iniciar sem seleção; bloquear adicionar enquanto faltar obrigatório ou limites forem inválidos, com mensagem no grupo. Ao atingir máximo, impedir novas seleções, permitindo desmarcar. Exibir extra de cada opção, inclusive “Grátis”, preço unitário base + extras e total × quantidade no botão. Falha ao carregar grupos não pode ser tratada como produto sem grupos.

## 4. Carrinho, checkout e validação no servidor

**Identidade:** `itemKey` determinística combina `produtoId` + IDs dos complementos ordenados, sem depender da ordem dos cliques, nomes ou preços. A mesma combinação soma quantidade; outra combinação cria nova linha. Não repetir o mesmo ID dentro da seleção.

Atualizar `apps/cliente/src/lib/cartRules.ts`, `apps/cliente/src/context/CartContext.tsx` e `apps/cliente/src/lib/cartStorage.ts`: guardar `itemKey`, seleção legível para exibição e preço unitário estimado com extras. Incrementar/decrementar/remover por `itemKey`. Restaurar carrinho antigo como seleção vazia, derivando a chave; obrigatórios novos serão cobrados pela cotação. Preservar a regra de uma loja por carrinho.

Em `apps/cliente/src/screens/home/Carrinho.tsx`, `apps/cliente/src/components/checkout/CartItemRow.tsx` e `apps/cliente/src/screens/home/Checkout.tsx`, usar a chave da combinação nas linhas e ações, mostrar escolhas abaixo do nome e incluir `complementoIds` no input. `apps/cliente/src/hooks/useCotacao.ts` deve considerar a seleção ao invalidar/recarregar cotação. Bloquear pagamento sem cotação válida; total autorizado é o do servidor. Mapear falhas em `apps/cliente/src/lib/checkoutQuoteResource.ts` para “Revise os complementos deste produto”; permitir voltar ao produto e remover/adicionar a configuração corrigida, sem editor novo no carrinho.

**Cotação:** na nova migration, atualizar o corpo vigente `cotar_pedido_sem_guarda_exclusao`, mantendo o wrapper público e todas as validações existentes:

1. Validar array de IDs UUID, sem repetição; rejeitar item inexistente ou pertencente a outro produto/loja. Ausência do campo significa seleção vazia; tipo inválido não vira vazio.
2. Consultar **todos** os grupos do produto, inclusive os não enviados, e conferir mínimo/máximo e escolha única. Erros estáveis: `COMPLEMENTOS_INVALIDOS` para IDs/formato/vínculo e `SELECAO_COMPLEMENTOS_INVALIDA` para limites/obrigatórios.
3. Trocar rejeição por produto repetido pela rejeição por combinação repetida: mesmo produto com escolhas diferentes é válido; combinação idêntica duplicada no payload retorna `ITENS_INVALIDOS` (o carrinho já deve fundir).
4. Ler preços do banco, somar base e extras em centavos e multiplicar pela quantidade. Aplicar ticket mínimo, comissão e total sobre o subtotal incluindo extras, preservando frete/taxas e limites monetários existentes. Campos de preço enviados pelo cliente não participam do cálculo.
5. Gravar seleção e snapshot canônico em `private.cotacoes.itens`, com IDs ordenados e preços/nomes oficiais. Para evitar leitura parcial durante edição, a RPC de salvar bloqueia o produto para escrita e a cotação mantém lock compartilhado desse produto durante a leitura dos grupos.

**Criar pedido:** atualizar também `criar_pedido_cotado_sem_guarda_exclusao`: reconstruir input com os IDs selecionados, recotar, comparar snapshot completo e copiar complementos para `pedidos_itens` na mesma transação do pedido. Nome/preço alterado, complemento removido ou seleção agora inválida resulta em `COTACAO_DESATUALIZADA`, sem pedido/cobrança parcial; cliente revisa e cota novamente. Normalizar snapshots antigos sem complementos como `[]` na comparação, preservando checkout de produto simples. Manter idempotência por operação, guards de conta e o bloqueio do checkout legado; não criar outra autoridade financeira.

## 5. Separação no lojista

Em `apps/lojista/src/screens/pedidos/DetalheSepararPedido.tsx`, exibir abaixo de cada produto os grupos e itens do snapshot, com preço extra por unidade: “Adicionais: Queijo (+R$ 3,00), Molho (Grátis)”. Indicar que a seleção vale para cada unidade da linha. Duas combinações aparecem separadas, com checklists independentes por `PedidoItem.id`. Não consultar o catálogo para reconstruir nomes/preços; array vazio não acrescenta bloco visual. Preservar contagem e persistência da separação existentes.

## 6. Testes por camada e aceite

| Camada | Casos mínimos e locais |
| --- | --- |
| Banco/RLS | Novo `apps/supabase/supabase/tests/database/complementos_mvp.test.sql`: dono salva/edita/remove atomicamente, outro lojista não lê dados privados nem escreve, público só lê catálogo visível, conta excluída bloqueada; preço zero aceito, negativo rejeitado; min/max/configuração inválida rejeitada. |
| Cotação/pedido | Estender `apps/supabase/supabase/tests/database/checkout_taxas.test.sql`: obrigatório ausente, mínimo/máximo, única com duas escolhas, ID duplicado/alheio/removido, payload inválido e preço adulterado; combinações distintas aceitas e iguais duplicadas rejeitadas; extras × quantidade, ticket/comissão corretos; recotação após edição, idempotência, snapshot preservado após excluir complemento e compatibilidade sem complementos. |
| Core-data | Estender testes existentes `product.supabase.test.ts`, `checkout.supabase.test.ts`, `order.supabase.test.ts` em `packages/core-data/src/supabase/` e equivalentes em `packages/core-data/src/mock/`: transporte dos IDs, mapeamento dos snapshots, CRUD aninhado e paridade do mock. |
| Cliente | `apps/cliente/src/lib/cartRules.test.ts`, `cartStorage.test.ts`, `cartTransaction.test.ts` e `checkoutQuoteResource.test.ts`: fusão independente da ordem, linhas diferentes, operações isoladas por chave, restauração antiga/nova, falha de persistência e invalidar cotação ao mudar seleção. Novo `apps/cliente/src/screens/home/DetalheProduto.test.tsx`: radio/checkbox, grátis, limites e total exibido. |
| Lojista/fluxo | Estender `apps/lojista/src/screens/catalogo/ProductForm.test.ts` e `apps/lojista/src/screens/pedidos/separacaoPedidoPresentation.test.ts`; validar cadastro/edição com erro preservando valores e apresentação do snapshot. Smoke integrado: cadastrar grupos → escolher → carrinho → cotar/criar → separar duas combinações; editar catálogo depois e conferir histórico intacto. |

Exemplo de aceite: produto R$ 20 + queijo R$ 3 + molho grátis, quantidade 2, subtotal R$ 46 antes das taxas. Adicionar a mesma seleção em ordem inversa funde; sem queijo é outra linha. Grupo obrigatório sem escolha bloqueia tanto UI quanto chamada direta ao servidor.

## 7. Plano curto para Terra — commits em ordem

- [ ] **1 — `feat(db): complementos por produto e snapshot no checkout`**: nova migration com tabelas/RLS/RPC de salvar e evolução das duas funções vigentes; testes SQL de cadastro, autorização, cotação e criação. Executar no Supabase local de testes, incluindo regressões de checkout e acesso de conta.
- [ ] **2 — `feat(core-data): contratos e adapters de complementos`**: tipos de banco, ports, adapters Supabase/mock, fixtures e testes descritos acima. Conferir que produto simples permanece compatível.
- [ ] **3 — `feat(lojista): cadastro de complementos no produto`**: ProductForm e fluxo cadastrar/editar, persistência atômica e testes do formulário.
- [ ] **4 — `feat(cliente): selecionar complementos e cotar combinacoes`**: DetalheProduto, identidade/persistência/ações do carrinho, resumo e payload do checkout; testes de seleção, carrinho e cotação.
- [ ] **5 — `feat(lojista): mostrar complementos na separacao`**: renderizar snapshot, testar linhas/checklists independentes e executar smoke completo.

Em cada commit, rodar os testes da camada alterada. Ao integrar, executar `pnpm --filter @keepit/core-data test`, `pnpm --filter @keepit/cliente test`, `pnpm --filter @keepit/lojista test` e `pnpm typecheck`; executar também os testes SQL no banco local (Vitest não os substitui). Aplicar banco antes dos apps consumidores. Não incluir pagamentos novos, refatorações gerais nem publicação neste plano.

## 8. FORA DO MVP

- Complementos globais ou reutilizáveis entre produtos.
- Estoque por item de complemento.
- Foto por item de complemento.
- Regras avançadas: metade/metade, dependências condicionais, combos e fórmulas especiais de preço.
- Quantidade por complemento: cada opção é marcada uma vez por unidade do produto, sem contador individual.
