# Keepit — Entendimento do App

Documento gerado a partir da análise do protótipo em `keepit-app/index.html` (arquivo bundled auto-contido com template HTML + assets em base64).

## Resumo do produto

**Keepit** é um marketplace hiperlocal em que o consumidor compra de lojas próximas (farmácias, roupas, conveniência) e retira **todos os pedidos em um único ponto físico**, chamado **Hub Keepit**. Não é entrega em casa — é um modelo *click-and-collect* com hub de bairro compartilhado entre várias lojas.

Slogan que aparece no app: **"Tudo perto de você, retirado no hub."**

## Proposta de valor

- **Para o comprador**: preços de comércio local + agilidade de compra digital. Compra em minutos no hub mais perto, retira com PIN de 4 dígitos, sem esperar entrega.
- **Para o lojista**: adesão simples ("em minutos sua loja já recebe pedidos no hub"), sem precisar montar operação de última-milha. A logística de entrega ao consumidor é substituída pelo hub compartilhado.
- **Para a Keepit**: opera os hubs físicos como infraestrutura compartilhada e cobra taxa de serviço + taxa Keepit sobre cada venda.

## Personas e apps

O produto tem **dois apps** (ou dois modos do mesmo app):

### 1. App do Comprador (tema claro)
Telas identificadas:
- **Onboarding / Como funciona** — 3 passos explicando o modelo.
- **Login / Criar conta** — e-mail, senha, Apple, Google.
- **Home** — lojas por categoria, hubs favoritos, hubs perto de você, lojas perto do hub.
- **Busca** — resultados de lojas/produtos.
- **Loja · catálogo** — produtos, estoque, preço, horário de funcionamento.
- **Detalhe do produto** — descrição, quantidade, adicionar ao carrinho.
- **Carrinho · checkout** — subtotal, taxa de serviço, taxas Keepit, total.
- **Escolha o ponto de retirada** — seleção do hub.
- **Pagamento** — PIX, cartão de crédito salvo, adicionar cartão (número, MM/AA, CVV).
- **Confirmar retirada · PIN** — código de 4 dígitos que o comprador mostra ao lojista no hub.
- **Recibo · pedido concluído**.
- **Meus pedidos** — em andamento, concluídos, comprar de novo.
- **Perfil / Configurações / Ajuda & suporte**.

### 2. App do Lojista (tema **dark** — `#1B1E1C`)
Telas identificadas:
- **Cadastro do estabelecimento** — nome da loja, CNPJ, logo, perfil público.
- **Painel do lojista / Dashboard** — saldo, vendas (7 / 30 / 90 / 1 ano), ticket médio, top produtos, itens vendidos.
- **Pedidos recebidos** — novos, em preparo, pronto no hub, concluídos. Ações: aceitar pedido, marcar pronto, marcar como pronto no hub.
- **Detalhe do pedido · separar** — itens para separar, cliente, valor.
- **Confirmar retirada** — lojista pede o código PIN de 4 dígitos ao cliente.
- **Gerenciar catálogo** — produtos, estoque (ex.: "Estoque: 12 · R$ 24,50", "Estoque baixo: 3"), promoções, adicionar imagem.
- **Horários & disponibilidade** — Seg–Sex, Sábado, Domingo, pausar novos pedidos, "Recebendo pedidos agora".
- **Carteira · solicitar saque** — saldo disponível, sacado no mês, saques recentes, saque via PIX.
- **Extrato financeiro** — movimentações, repasse líquido, total no período.
- **Formas de recebimento** — PIX, cartão.
- **Configurações & equipe** — convidar membro, papéis (Admin, Operador de balcão).

## Conceitos-chave do domínio

| Conceito | Descrição |
|---|---|
| **Hub Keepit** | Ponto físico de **encontro presencial** entre cliente e lojista (não é depósito). Sem locker no MVP; sem armazenagem. Exemplos no protótipo: Hub Centro, Hub Jardins, Hub Vila Nova. Cada hub tem endereço, distância, horário. Cliente e lojista se encontram na hora que o pedido está pronto. |
| **Lojista / estabelecimento** | Comércio local cadastrado (Farmácia Vida, Loja Bem Vestir, Conveniência 24h). Tem categoria, avaliação (★), distância do hub. |
| **Pedido** | Fluxo: Novo → Aceito → Em preparo → Pronto no hub → Retirado/Entregue. Cada pedido tem número (#2048), cliente, itens, valor. |
| **PIN de retirada** | Código de 4 dígitos gerado no checkout. Comprador mostra no hub; lojista digita para confirmar entrega. É o mecanismo antifraude do encontro físico. |
| **Taxas** | "Taxa de serviço" (comprador) + "Taxas Keepit" (lojista) sobre cada venda. |
| **Repasse** | Lojista recebe via PIX ou cartão, com saldo disponível e opção de solicitar saque. |

## Categorias de loja vistas no protótipo
- Farmácia (Farmácia Vida)
- Roupas (Loja Bem Vestir)
- Conveniência 24h
- Cuidados / Higiene (subcategorias dentro de farmácia)

## Fluxo do comprador (end-to-end)

> Modelo confirmado na Rodada 2 (2026-07-02): **encontro sincronizado sem armazenagem** — o produto fica na loja até o momento do encontro no hub.

1. Abre o app → o app mostra apenas hubs próximos e lojas que atendem cada hub (raio configurado pela loja).
2. Navega catálogo → adiciona ao carrinho → escolhe hub de retirada → paga (PIX ou cartão).
3. Lojista aceita em até 10 min e informa **tempo estimado de entrega** (padrão vem do cadastro dele, editável).
4. Cliente vê: *"Fica pronto em ~30 min → vá ao Hub Centro."*
5. Quando o lojista marca **"Saindo para o hub"**, cliente recebe push para ir.
6. No hub, cliente aperta "Cheguei". Encontra o lojista. Mostra o **PIN de 4 dígitos** → lojista digita → entrega confirmada.
7. Janela de 10 min no hub para o encontro se concretizar; se cliente não aparecer, lojista vai embora com o produto (regra "sem armazenagem").

## Fluxo do lojista (end-to-end)

1. Cadastra estabelecimento: dados, CNPJ, categoria, endereço da loja (lat/long), **raio de atendimento em km**, **tempo médio de entrega em min**, chave PIX de recebimento.
2. Passa por **aprovação manual** da Keepit no painel admin.
3. Aprovado, recebe pedidos apenas de hubs dentro do seu raio.
4. Ao chegar um pedido: aceita em até 10 min → informa tempo estimado (padrão pré-preenchido).
5. Prepara na loja → marca **"Saindo para o hub"** quando sai.
6. Encontra o cliente no hub → digita o PIN → confirma entrega.
7. Após confirmação, valor entra em custódia; **liberado em D+7** para a carteira do lojista.
8. Solicita saque sob demanda (mínimo R$ 200) → recebe via PIX.

## Sistema de design (extraído do protótipo)

**Paleta principal**
- Fundo escuro (app lojista): `#1B1E1C`
- Verde de marca (accent): `#75DC8D` (também `#1F9D57` como verde de sucesso mais escuro)
- Cinzas neutros escuros: `#0C0E08`, `#15180F`, `#20241A`, `#23271F`, `#2A2F20`, `#3A4030`
- Cinzas de texto: `#6E7460`, `#767B70`, `#9AA089`, `#A6ABA2`
- Fundo claro (app comprador): tons `#EDF0E8`, `#EFF2EB`, `#F0F1ED`, `#F6F7F3`
- Verdes claros para badges: `#CDEED7`, `#DBE6CC`, `#E2F7E8`, `#F2FBF5`
- Alerta/laranja: `#E0894A`

**Tipografia**
- **Hanken Grotesk** — pesos Regular, Medium, Bold, Extrabold.
- Tamanhos: 10–12px para labels/badges (com `letter-spacing` alto em títulos de seção all-caps), pesos 600–800 predominantes.

**Padrões de UI**
- Badges arredondados (`border-radius: 20px`) para status (Aberto, Pausado, Novo).
- Seções nomeadas em all-caps com tracking (ex.: `ACESSO`, `PRODUTOS`, `RETIRADA & ENCONTRO`).
- Cards com sombra suave (`box-shadow: 0 6px 14px rgba(0,0,0,.2)`).
- Ícone/marca: casinha estilizada dentro de círculo verde `#75DC8D` + wordmark "keepit" com bolinha verde depois do "t".

## Localização

- Idioma: **Português (Brasil)**.
- Moeda: Real (R$).
- Endereços fictícios paulistas (Av. Paulista, Rua das Flores, Rua Verde).
- Pagamento nativo: **PIX** como método principal + cartão de crédito.

## O que o protótipo NÃO cobre (pontos em aberto)

- Não há tela de operação **do hub em si** (quem é o operador do hub? recebe/estoca itens antes do cliente chegar?). Aparece apenas "Operador de balcão" como papel de equipe do lojista, o que sugere que o próprio lojista entrega no hub e o cliente retira direto com ele — não há intermediação Keepit no ato da retirada.
- Não há flow de cancelamento/reembolso, avaliação pós-compra, chat cliente↔loja, notificações push, gestão de disputas.
- Não há admin interno Keepit (aprovação de estabelecimentos, gestão de hubs, financeiro consolidado).
- Modelo de precificação exato das taxas não está detalhado.

## Natureza do arquivo analisado

`keepit-app/index.html` é um **protótipo estático bundled** (não é o código-fonte da aplicação): 461 KB contendo (1) manifest com 100+ assets binários em base64 (fontes Hanken Grotesk, imagens PNG), (2) template HTML de ~184 KB com todas as telas renderizadas lado-a-lado como um "design showcase", (3) runtime JavaScript que descompacta os assets em blob URLs no cliente. É o output de uma ferramenta de design/bundling — provavelmente exportado de um app tipo v0/Bolt/Lovable — servindo como **referência visual e de conteúdo**, não como base de código para desenvolvimento.
