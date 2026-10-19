**Nível: básico** — completar testes da leitura existente, corrigir o agrupamento visual com os dados já gravados e preservar complementos no pagamento, sem nova arquitetura.

# COMP-READ, COMP-LBL e COMP-PAY — spec MVP para Terra

## Objetivo

Garantir complementos completos no catálogo, preservá-los na cotação/criação do pedido em Pagamento e mostrar o grupo correto na separação do lojista, exclusivamente em homologação `keepit-dev`. Desenho confirmado por Caio em 2026-10-18 às 00:41 SP, acrescido do steering COMP-PAY. ASTRA especifica; Terra implementa depois.

Base revisada: branch `codex/integracao-piloto`, HEAD `4feb5d2`. Revisão linha a linha dos três arquivos do diff obtido com `git show c85a09c`; o commit seguinte só altera `versionCode`. As linhas abaixo referem-se a esse HEAD. Conclusão estática: a composição de COMP-READ está coerente com a migration local, mas os testes adicionados não comprovam todos os requisitos. Os 819 testes e typecheck verdes relatados anteriormente são histórico, não validação desta rodada. Nenhum código, teste ou banco foi alterado/executado nesta especificação.

## Comportamento esperado — lista verificável

- `getById` retorna produto com seus grupos e itens; produto inexistente continua `null`.
- `list` mantém filtros de estabelecimento/ativo/exclusão e ordem dos produtos por nome. Cada produto recebe somente seus grupos; cada grupo, somente seus itens.
- Grupos e itens são ordenados por `ordem ASC`, com desempate por `id ASC` em cada nível. IDs, nomes, tipo, limites e preços persistidos são preservados.
- Produto sem grupos retorna `gruposComplementos: []`; grupo sem itens retorna `itens: []`; lista vazia retorna `[]` sem buscar complementos.
- Erros de produtos, grupos ou itens rejeitam a operação inteira, preservando o erro; nunca viram `[]`, produto parcial ou sucesso fictício.
- **Paridade de `create/update` dentro do MVP:** manter o retorno dos grupos efetivamente persistidos, inclusive IDs gerados pelo banco. Sem ecoar o input. `update` sem alteração de grupos deve preservá-los. `pause`, que compartilha a releitura, não pode regredir.
- Separação exibe uma linha por grupo real do snapshot: por exemplo, `Tamanho: Grande (+R$ 4,00) · por unidade` e `Adicionais: Bacon (+R$ 5,00) · por unidade`. Preservar `Grátis`, quantidades, totais e checklist.
- Pedidos antigos continuam legíveis; nomes e preços históricos não são recalculados usando o catálogo atual.
- Pagamento cota cada item com `produtoId`, `quantidade` e `complementoIds: item.complementoIds ?? []`, como Checkout; a criação preserva as mesmas seleções no snapshot do pedido.
- Sem cotação válida para os itens atuais, durante carregamento ou após erro, a ação de prosseguir para PIX permanece bloqueada na tela e no handler. Erro é exibido; não usar subtotal local, total anterior ou sucesso fictício para liberar a ação.

## COMP-READ — revisão por arquivo/trecho

Arquivo principal: [`packages/core-data/src/supabase/product.supabase.ts`](../packages/core-data/src/supabase/product.supabase.ts).

| Trecho | Decisão para Terra |
| --- | --- |
| L29–30, 43, 52: `GrupoRow`, `ItemRow` e casts | **VERIFICAR** correspondência com `Database` e `ComplementoGrupo/Item` de `ports/product.port.ts`. Campos conferem com a migration; os casts não validam dados em runtime. `tipo` é `string` no tipo SQL e união no domínio, sustentada pelo CHECK SQL. Não ampliar o domínio nem inventar coluna `ativo`; nenhuma refatoração de tipos é necessária só por estilo. |
| L33–44: mapa inicial, filtro de produtos, ordenação e erro de grupos | **MANTER** inicialização por produto com `[]`, retorno antecipado, `.in('produto_id', produtoIds)`, os dois `.order` e `throw gruposError` antes do fallback. |
| L45–58: busca e mapa de itens | **MANTER** filtro pelos IDs dos grupos encontrados, `ordem/id ASC`, `throw itensError` e agrupamento por `grupo_id`. |
| L59–74: montagem e `attachGroups` | **MANTER** associação `grupo.produto_id → produto.id` e `item.grupo_id → grupo.id`. A ordenação global das queries, preservada pelos loops, também ordena cada subconjunto; não precisa ordenar novamente no JS. A saída percorre os produtos originais. **VERIFICAR** isolamento com dois produtos que tenham grupos, não apenas um produto vazio. |
| L93–100, 153–181: `fetchProdutoById`, `list`, `getById` | **MANTER** hidratação compartilhada, filtros, erro de produto e `null` quando ausente. Ausência de produto não deve disparar queries de complementos. |
| L196–206, 224–225, 240–252; reflexo em L114–132, 263, 271–272 | **MANTER** releitura em `create/update` com RPC e hidratação no create direto. Remover o antigo `structuredClone(input.gruposComplementos)` foi correto: input pode não conter IDs persistidos. **VERIFICAR** retorno real e erro da releitura, inclusive quando a escrita já ocorreu; o cast `as Produto` não prova a validade do retorno. Não adicionar retry automático de escrita. |

[`packages/shared-types/src/supabase.ts`](../packages/shared-types/src/supabase.ts), L1129/1141/1153 e L1172–1241: **MANTER** `complementos_snapshot: Json` no Row e opcional no Insert/Update; tabelas de grupos/itens, FKs e respectivos Row/Insert/Update. Conferidos contra [`20261018120000_complementos_produto_mvp.sql`](../apps/supabase/supabase/migrations/20261018120000_complementos_produto_mvp.sql), L4–26: nulabilidade e campos opcionais com defaults conferem; `tipo: string` corresponde a `text` com CHECK, não enum SQL. **VERIFICAR** aderência do schema efetivo de `keepit-dev`; corrigir apenas divergência comprovada. `Json` não garante formato de snapshot na leitura.

[`packages/core-data/src/supabase/product.supabase.test.ts`](../packages/core-data/src/supabase/product.supabase.test.ts), L16–73 e L179–237: **MANTER** builders separados por tabela e os quatro cenários adicionados. **CORRIGIR a cobertura:** `.order` e `.in` são spies, não ordenam/filtram fixtures; dados já ordenados não provam a ordenação. Faltam assertivas dos dois `.order`, isolamento entre dois produtos com grupos, erro de itens, erros de complementos em `list` e caminhos RPC de `create/update` (o fake sequer possui `rpc`). Não reescrever o adapter se os testes novos confirmarem o comportamento existente.

## COMP-LBL — origem, fluxo e correção mínima

Rastreio confirmado no código:

1. [`apps/cliente/src/screens/home/DetalheProduto.tsx`](../apps/cliente/src/screens/home/DetalheProduto.tsx), L98, monta nomes para o carrinho. [`checkout.supabase.ts`](../packages/core-data/src/supabase/checkout.supabase.ts), L9–23, envia IDs selecionados para `cotar_pedido` e cria por `criar_pedido_cotado`; não envia nomes como autoridade.
2. Os wrappers da [`20261015120200_exclusao_acesso_mvp.sql`](../apps/supabase/supabase/migrations/20261015120200_exclusao_acesso_mvp.sql), L78–91 e L122–138, chamam as funções internas substituídas pela migration de complementos. Nesta, L131–138 constroem o snapshot a partir do banco com `grupoId`, `grupoNome`, `itemId`, `itemNome`, `precoExtraCentavos`, ordenado por grupo `ordem/id` e item `ordem/id`; L155 copia-o para `pedidos_itens.complementos_snapshot`.
3. [`checkout.mock.ts`](../packages/core-data/src/mock/checkout.mock.ts), L38–43/79, já preserva os mesmos campos; [`order.mock.ts`](../packages/core-data/src/mock/order.mock.ts), L188, clona o snapshot. **MANTER** a origem e a persistência: não foi encontrada perda de nome do grupo nesses trechos.
4. [`order.supabase.ts`](../packages/core-data/src/supabase/order.supabase.ts), L60 e L90–115, seleciona e repassa o snapshot, com `?? []`. [`OrdersContext.tsx`](../apps/lojista/src/screens/pedidos/OrdersContext.tsx), L97–99/157, entrega o pedido à tela sem reagrupá-lo.
5. **Origem do rótulo incorreto:** [`DetalheSepararPedido.tsx`](../apps/lojista/src/screens/pedidos/DetalheSepararPedido.tsx), L138, concatena todos os itens sob o literal `Adicionais:` e ignora `grupoNome`. **CORRIGIR esse produtor do texto**, usando os metadados históricos já existentes; não renomear “Grande” nem inferir grupo pelo nome do item.

Implementação mínima: acrescentar uma função pura de apresentação em [`separacaoPedidoPresentation.ts`](../apps/lojista/src/screens/pedidos/separacaoPedidoPresentation.ts) e consumi-la na tela. Agrupar prioritariamente por `grupoId` não vazio; IDs distintos nunca se fundem, mesmo com nomes iguais. Sem ID, usar `grupoNome` não vazio como chave alternativa. Manter ordem da primeira ocorrência dos grupos e ordem dos itens no snapshot, sem mutá-lo. Para o rótulo, usar o primeiro nome não vazio do grupo; sem nome, usar **`Complementos`**. O bucket legado sem ID/nome deve ter chave separada dos grupos reais.

Compatibilidade: snapshot ausente, `null` ou `[]` produz nenhuma linha. Entrada antiga sem `grupoNome`/`grupoId` continua exibindo item e preço sob `Complementos`, sem inventar `Tamanho` nem consultar catálogo. Tratar campos ausentes na fronteira de leitura/apresentação; manter contrato completo para snapshots novos em [`ports/order.port.ts`](../packages/core-data/src/ports/order.port.ts), L26–32. Não exigir backfill, versionamento JSON, alteração de migration aplicada ou atualização de pedidos antigos. Se o snapshot já perdeu o grupo, esse nome histórico não é recuperável com segurança.

## COMP-PAY — OPEN, crítico, reteste v12

Evidência relatada no reteste v12: Checkout cotou **R$ 119,60 com complementos**, mas Pagamento apresentou “Não foi possível obter o total” e manteve “Aguardando total”, bloqueando Gerar PIX. Com grupo obrigatório, omitir os IDs selecionados torna a seleção inválida. O valor é referência daquele cenário, não constante a inserir no app; o reteste não foi executado nesta rodada de especificação.

| Trecho | Decisão para Terra |
| --- | --- |
| [`Pagamento.tsx`](../apps/cliente/src/screens/home/Pagamento.tsx), L43–46, versus [`Checkout.tsx`](../apps/cliente/src/screens/home/Checkout.tsx), L64–67 | **CORRIGIR** a projeção de `cart.items` enviada a `useCotacao`: Pagamento omite `complementoIds`, enquanto Checkout já usa `item.complementoIds ?? []`. Preservar produto, quantidade e IDs de cada linha, sem mutar o carrinho nem juntar seleções de itens diferentes. |
| `Pagamento.tsx`, L101–104, e [`createOrderFromQuote.ts`](../apps/cliente/src/lib/createOrderFromQuote.ts), L4–15 | **CORRIGIR/VERIFICAR** a preservação na criação. Precisão sobre o relato de mapeamento na L104: neste HEAD a tela passa `itens: cart.items`; o helper tipa os itens sem complementos e seu caminho mock os descarta ao montar `order.create`. No caminho Supabase, `checkout.criar` recebe `cotacaoId`, não uma nova lista de itens: o snapshot deve vir da cotação completa. Não acrescentar parâmetros inexistentes à RPC. |
| [`useCotacao.ts`](../apps/cliente/src/hooks/useCotacao.ts) e [`checkoutQuoteResource.ts`](../apps/cliente/src/lib/checkoutQuoteResource.ts); bloqueios de `Pagamento.tsx` | **MANTER/VERIFICAR** invalidação da cotação por mudança de carrinho/identidade, limpeza dos dados no carregamento/erro e descarte de respostas antigas. Preservar mensagem e tentativa de nova cotação; botão e handler só prosseguem com cotação válida e atual, além das validações existentes. |

**Fonte única da verdade:** as seleções de produto, quantidade e complementos ficam em `useCart().items`, definido em [`CartContext.tsx`](../apps/cliente/src/context/CartContext.tsx), com `complementoIds` por item. Checkout e Pagamento derivam seus inputs dessa mesma fonte. Os nomes/preços em `cart.items[].complementos` são apresentação local, não autoridade para validar IDs, cobrar ou reconstruir o snapshot. Não criar outro estado de seleção em Pagamento. Reutilizar a mesma projeção; se necessário, uma função pura pequena compartilhada basta.

**Cotação e criação:** o backend valida seleções e fornece os totais; a cotação identificada por `cotacaoId` guarda os itens e complementos que originam o pedido. No Supabase, manter `checkout.criar`/`criar_pedido_cotado` e comprovar `pedidos_itens.complementos_snapshot` completo. Para o mock, reutilizar o caminho existente `checkout.cotar/criar`, que já preserva snapshots, no lugar do mapeamento legado que os perde. Não fabricar IDs/grupos a partir dos nomes do carrinho, não criar pedido sem complementos como alternativa a uma falha e não cair do Supabase para mock/`order.create` quando houver erro. Manter o controle existente de submissão e de limpeza do carrinho.

**Comportamento verificável:** com as mesmas seleções e condições de catálogo/taxas, Checkout e Pagamento obtêm o mesmo total, incluindo extras uma única vez. Produto sem complemento envia `[]` e continua cotando/criando normalmente quando permitido pelo catálogo; `[]` não dispensa grupo obrigatório. Alterar quantidade ou complementos exige cotação correspondente antes de criar. Falha de cotação mostra erro e bloqueia prosseguir/Gerar PIX; uma tentativa posterior só libera após resposta válida. Falha de criação propaga até a tela, preserva o carrinho e não navega como sucesso. A retomada de limpeza de pedido já criado continua sem gerar novo pedido. O rótulo local atual é “Continuar”; “Gerar PIX” identifica a ação bloqueada no relato, sem exigir troca de texto.

**Relação com COMP-READ/COMP-LBL:** COMP-READ disponibiliza os grupos/IDs selecionáveis; COMP-PAY deve transportá-los até o snapshot persistido; COMP-LBL apresenta os grupos desse snapshot. Corrigir apenas o rótulo não recupera complementos descartados na cotação/criação. Não reconstruir pedidos antigos pelo catálogo atual.

## Testes exigidos — TDD

Terra escreve os testes antes de corrigir. Para COMP-LBL, comprovar falha no rótulo atual e depois passar. Para COMP-PAY, comprovar RED para a ausência de IDs na cotação e perda de complementos na criação mock, seguido de correção mínima → GREEN. Para COMP-READ já implementado, testes novos podem passar imediatamente: são caracterização, não evidência de RED anterior. Para lacunas que revelarem defeito, registrar RED → correção mínima → GREEN.

| Arquivos prováveis | Casos mínimos |
| --- | --- |
| `packages/core-data/src/supabase/product.supabase.test.ts` | `getById` com dois grupos e vários itens; verificar saída completa e `.order('ordem', ascending)` seguido de `.order('id', ascending)` nos dois builders. Empates de ordem; fixtures em ordem retornada pelo banco. `list` com A e B com grupos próprios e C sem grupo, grupos/itens intercalados entre pais; assertar `.in` e resultado sem vazamento. `getById` sem grupo `[]`, grupo vazio, produto inexistente e lista vazia sem queries extras. Parametrizar `getById/list` × erro de produtos/grupos/itens, incluindo erro PostgREST como objeto, verificando rejeição com o mesmo erro. |
| Mesmo arquivo, fake com RPC e respostas por chamada | `create/update` com grupos retornam IDs/nomes da releitura, diferentes do input; create direto sem grupos retorna `[]`; update parcial e pause preservam grupos; falha de releitura rejeita, sem fallback para input. |
| `apps/lojista/src/screens/pedidos/separacaoPedidoPresentation.test.ts` e novo `DetalheSepararPedido.test.ts` | `Tamanho: Grande` separado de `Adicionais: Bacon`; múltiplos itens do mesmo grupo; IDs diferentes com mesmo nome; ausência de ID com nome; ausência de ambos com fallback; snapshot vazio/ausente/null; ordem histórica e sem mutação. Uma renderização da tela deve comprovar consumo do agrupamento e preços/“por unidade”, usando o padrão de mocks existente em `SaindoParaHub.test.ts`. Preservar testes de checklist. |
| `packages/core-data/src/supabase/order.supabase.test.ts` e `src/mock/checkout.mock.test.ts` | Leitura preserva metadados e normaliza snapshot ausente/null para `[]`; checkout mock grava nomes/grupos/preços selecionados. Depois de criado o pedido, renomear o grupo no catálogo não altera snapshot nem apresentação histórica. |
| `apps/supabase/supabase/tests/database/complementos_mvp.test.sql` | Acrescentar cenário comportamental de cotar/criar com `Tamanho/Grande` e `Adicionais/Bacon`, confirmando campos e ordem no snapshot persistido. O teste atual só verifica existência de tabelas/coluna/função. Executar em banco de teste isolado; conferir leitura real do catálogo sob papéis cliente/lojista em `keepit-dev`, sem registrar credenciais. |

Mínimos adicionais de COMP-PAY, exigidos do Terra:

| Arquivos prováveis | Casos mínimos |
| --- | --- |
| Novo `apps/cliente/src/screens/home/Pagamento.test.tsx` | Renderizar Pagamento com item que seleciona grupo obrigatório e adicional; capturar o input de `useCotacao` e assertar `complementoIds` exatos por item, além de produto/quantidade. Incluir segundo produto para detectar mistura de seleções; comparar a projeção com Checkout. Teste apenas de helper não substitui comprovar seu consumo pela tela. |
| `apps/cliente/src/lib/createOrderFromQuote.test.ts` e `packages/core-data/src/mock/checkout.mock.test.ts` | Criar a partir da cotação feita com os complementos do carrinho e ler o pedido: snapshot contém IDs, grupos, nomes e preços selecionados. Testar a integração do helper com o checkout mock, não só o adapter isolado. No Supabase, assertar uso do ID da cotação vigente e ausência de fallback em falha; comprovar snapshot persistido no cenário SQL já exigido acima. |
| Testes de Pagamento e criação acima | Item sem `complementoIds` e item com `[]`: input normalizado para `[]`, cotação válida e pedido sem complementos, com snapshot vazio. Usar produto sem seleção obrigatória; manter quantidade e total do contrato existente. |
| Testes de Pagamento e `apps/cliente/src/lib/checkoutQuoteResource.test.ts` | Erro de cotação exibe alerta, não mantém total utilizável, desabilita prosseguir/Gerar PIX e impede criação/navegação mesmo ao chamar o handler. Cobrir carregamento e erro após cotação anterior válida, inclusive mudança de complementos; retry só libera com nova cotação válida. Erro de criação não limpa carrinho nem navega e não aciona fallback. Preservar testes existentes de submissão/retomada sem duplicação. |

Comandos de aplicação para Terra: `pnpm --filter @keepit/core-data test`, `pnpm --filter @keepit/cliente test`, `pnpm --filter @keepit/lojista test` e `pnpm typecheck`. Executar os testes novos isoladamente durante TDD, depois essas suites; usar o fluxo de testes SQL do projeto para o cenário de banco. Registrar resultados atuais, sem reutilizar a contagem histórica de 819 como prova.

## Critérios de aceite

- Todos os comportamentos verificáveis e testes acima atendidos; COMP-READ só é aceito após cobrir suas lacunas.
- Produto com grupos lido por `getById/list` corresponde ao persistido, ordenado e isolado por produto; erro real chega ao chamador.
- Pedido novo e pedido antigo com metadados mostram os grupos gravados; legado sem metadados permanece legível pelo fallback. Nenhuma busca de catálogo para reconstruir nomes históricos.
- COMP-PAY permanece OPEN até Terra demonstrar cotação de Pagamento com os IDs do carrinho, criação com snapshot completo, item sem complemento funcionando e erro de cotação bloqueando PIX. Repetir o cenário v12 em `keepit-dev`: nas mesmas condições, Checkout e Pagamento mostram R$ 119,60 e o pedido preserva os complementos para COMP-LBL; se catálogo/taxas mudaram, registrar a diferença e comprovar paridade com o novo total válido, sem fixar R$ 119,60 no código.
- Revisão de diff confirma mudança mínima, sem alteração das regras de cálculo de totais/preços, limites de seleção ou checklist; COMP-PAY apenas restaura a inclusão dos complementos já selecionados. Evidências de homologação identificam apenas `keepit-dev`.

## Riscos registrados

Os riscos abaixo são registrados sem bloquear a atualização da spec ou exigir nova confirmação; não dispensam os critérios de aceite da implementação.

- **RISCO — paridade entre criação real e mock:** corrigir só o input de Pagamento pode deixar o helper mock perdendo snapshot; testar a criação acionada pela tela. A RPC real cria por ID de cotação, portanto exigir lista de complementos nessa chamada seria um contrato incorreto.
- **RISCO — cotação desatualizada:** alterações de seleção, catálogo ou taxas entre cotação e criação podem invalidá-la. Preservar invalidação/erro e exigir nova cotação válida, sem reaproveitar total anterior nem repetir criação automaticamente.
- **RISCO — schema/RLS em homologação:** conferência desta rodada foi local. Schema, permissões e conteúdo reais de `keepit-dev` não foram consultados; RLS pode ocultar linhas sem retornar erro. Validar com produto conhecido sob os papéis esperados antes de aceitar `[]` como prova de ausência.
- **RISCO — legado:** formato dos snapshots reais antigos não foi amostrado. Sem nome histórico, exibir `Complementos`; não prometer reconstrução retroativa.
- **RISCO — releitura pós-escrita:** `create/update` podem persistir e depois falhar ao buscar grupos. Propagar a falha, sem declarar rollback ou repetir a escrita automaticamente.
- **RISCO — volume:** queries em lote não paginam complementos; catálogos acima do limite de resposta da API podem truncar dados. Verificar que o catálogo do piloto cabe no limite; paginação geral não faz parte deste MVP.

## Fora de escopo

COMP-PAY não inclui nova integração/gateway PIX, novos meios de pagamento, mudança de taxas/preços, relaxamento de grupos obrigatórios, novo estado global de carrinho ou mudança do contrato da RPC de criação. Não reabrir o desenho aprovado; limitar a correção ao transporte das seleções, preservação do snapshot e bloqueios/testes descritos.

Sem APK, GeeLark, vídeo, push ou mudanças em produção. Sem novos fluxos de checkout, reformulação do catálogo, refatoração ampla, backfill de pedidos, nova arquitetura ou implementação nesta rodada. Não imprimir segredos, IPs ou senhas. Esta entrega altera somente esta spec.
