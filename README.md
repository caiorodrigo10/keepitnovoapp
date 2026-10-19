# Keepit

Keepit é um marketplace local de compras com retirada em um hub (*click-and-collect*). O cliente compra pelo aplicativo, a loja prepara o pedido e a retirada é confirmada por um código de quatro dígitos.

## O que é

O sistema reúne lojas e produtos por hub de retirada. O cliente escolhe onde retirar, faz o pedido no app e acompanha seu andamento. O lojista recebe o pedido, separa os itens e valida a entrega no hub. Um painel web apoia a administração da operação.

## Como funciona

1. O cliente escolhe um hub de retirada e uma loja, depois navega pelos produtos.
2. Ele monta o carrinho, seleciona complementos quando disponíveis e fecha o pedido.
3. O pagamento é feito por PIX via Asaas no ambiente de homologação (*sandbox*).
4. O lojista recebe e aceita o pedido, então separa os itens.
5. O pedido fica pronto para retirada no hub.
6. O cliente apresenta o código de quatro dígitos exibido no aplicativo, e o lojista digita o PIN para confirmar a retirada.

## Aplicativos e backend

- **Cliente (`apps/cliente`)**: aplicativo React Native com Expo para escolher hub e loja, explorar produtos, personalizar itens, fechar pedidos, pagar por PIX e acompanhar a retirada. Identificador do app: `com.keepithub.cliente`.
- **Lojista (`apps/lojista`)**: aplicativo React Native com Expo para receber e aceitar pedidos, separar itens e validar o PIN de retirada. Identificador do app: `com.keepithub.lojista`.
- **Admin (`apps/admin`)**: painel web de administração feito com Next.js.
- **Supabase (`apps/supabase`)**: backend com Postgres, migrations SQL, políticas RLS, funções RPC, buckets de Storage e Edge Functions. O fluxo de PIX usa funções para criar pagamentos e tratar eventos do Asaas; há também código para conciliação de pagamentos.

## Stack

O repositório usa TypeScript, pnpm workspaces e Turborepo. Os aplicativos móveis usam React 19, React Native 0.86 e Expo 57. O painel web usa Next.js 16, React 19 e Tailwind CSS. A persistência e as funções de backend usam Supabase.

## Estrutura do monorepo

```text
apps/
  cliente/           App do cliente
  lojista/           App do lojista
  admin/             Painel web
  supabase/          Migrations e Edge Functions
packages/
  shared-types/      Tipos TypeScript do schema
  supabase-client/   Cliente Supabase tipado
  core-data/         Acesso a dados e lógica compartilhada
  config/            Configurações compartilhadas
  ui-tokens/         Tokens visuais
```

## Como rodar em homologação

**Pré-requisitos:** Git, Node.js 20 ou superior (22 LTS recomendado) e pnpm 9 ou superior. O repositório declara `pnpm@9.15.0` em `packageManager`.

1. Instale as dependências na raiz:

   ```bash
   pnpm install
   ```

2. Configure as variáveis de ambiente necessárias para cada aplicativo e serviço, usando suas próprias configurações de Supabase e Asaas sandbox.
3. Disponibilize o backend Supabase e aplique as migrations quando necessário para o ambiente de homologação. As Edge Functions usadas pelo fluxo de pagamento também precisam estar disponíveis nesse ambiente.
4. Inicie o desenvolvimento pela raiz ou por aplicativo:

   ```bash
   pnpm dev
   # ou, separadamente:
   pnpm --filter @keepit/cliente dev
   pnpm --filter @keepit/lojista dev
   pnpm --filter @keepit/admin dev
   ```

Os scripts dos aplicativos móveis iniciam o Expo; o do lojista usa a porta de desenvolvimento 8082. O script `dev` do workspace Supabase apenas exibe uma mensagem, portanto o backend precisa ser iniciado ou disponibilizado separadamente.

## Comandos e verificação

Na raiz do repositório:

```bash
pnpm install    # Instala as dependências
pnpm dev        # Inicia os scripts de desenvolvimento dos workspaces
pnpm build      # Executa os scripts de build dos workspaces
pnpm lint       # Executa os scripts de lint dos workspaces
pnpm typecheck  # Verifica os tipos TypeScript
pnpm test       # Executa os testes dos workspaces
pnpm qa         # Executa lint, typecheck e test pelo Turborepo
```

`typecheck` executa `tsc --noEmit`, e os workspaces com testes configurados usam Vitest. Atualmente, `lint` é um placeholder (`echo skipped`) nos workspaces; assim, `pnpm qa` verifica tipos e testes, mas ainda não valida estilo de código. Alguns scripts de `build` também são placeholders.
