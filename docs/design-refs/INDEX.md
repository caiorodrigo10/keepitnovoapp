# Design References — Capturas por tela do protótipo

**Origem:** `keepit-app/index.html` (o artboard oficial, exportado de v0/Lovable). Renderizado num browser real (Playwright), cada tela foi recortada individualmente do screenshot full-page (2900×8245, escala CSS 1:1). Gerado em 2026-07-28.

## Para que serve (camada 2 da garantia de fidelidade)

Estas imagens são a **referência visual obrigatória** de cada tela do Épico 0. O princípio nº1 do `CLAUDE.md` — *"a interface deve ser exatamente como em `keepit-app/index.html`"* — só é **verificável** com elas:

- **@dev:** ao construir cada tela, usa a imagem correspondente como alvo (layout, hierarquia, espaçamento, componentes). Cores/fontes vêm de `@keepit/ui-tokens` (extraídos deste mesmo HTML).
- **@qa:** no gate visual de cada story, compara a tela construída contra a imagem de referência + confirma "só tokens, zero hex hardcoded". O Playwright está disponível no ambiente, então o diff visual é executável (abrir o app construído + a referência, comparar lado a lado).

**Como regenerar:** servir `keepit-app/` via HTTP (`python3 -m http.server`), abrir `index.html` no Playwright, screenshot full-page, recortar pelas coordenadas dos frames (390×824, +12px de padding). Coordenadas registradas no histórico desta sessão.

## Cobertura

| App | Telas no protótipo | Cobertura |
|-----|--------------------|-----------|
| **Cliente** (tema claro) | 14 telas | Boa — cobre a maioria dos fluxos |
| **Lojista** (tema dark) | 11 telas | Parcial — falta Onboarding, Cadastro passo 2/3, "Em análise", Login |
| **Admin** (web) | **0 telas** | **Inexistente** — o protótipo não tem Admin. Fidelidade = design system dark (Stories 0.12/0.13) |

`_design-system-legend.png` = paleta + tipografia + "como funciona" (origem dos tokens).

## Mapa: referência → Story

### App Cliente (tema claro `#F6F7F3`)
| Referência | Tela | Story |
|-----------|------|-------|
| `cliente-01-onboarding.png` | Onboarding "Tudo perto de você" | 0.4 |
| `cliente-02-home-hub.png` | Home / hub (Retirar em, categorias, lojas perto) | 0.5 |
| `cliente-03-loja-catalogo.png` | Loja + catálogo (Promoções, produtos) | 0.5 |
| `cliente-04-carrinho.png` | Carrinho (itens, hub, taxas, total) | 0.6 |
| `cliente-05-escolha-ponto-retirada.png` | Escolha o ponto de retirada — **⚠️ CONTÉM MAPA** | 0.6 |
| `cliente-06-seu-pedido-pin.png` | Seu pedido (timeline + PIN "4 8 2 7") | 0.7 |
| `cliente-07-pedidos.png` | Pedidos (em andamento / concluídos) | 0.7 |
| `cliente-08-perfil.png` | Perfil (dados, menu) | 0.4 |
| `cliente-09-criar-conta.png` | Criar conta — **⚠️ MOSTRA GOOGLE/APPLE** | 0.4 |
| `cliente-10-login.png` | Login — **⚠️ MOSTRA GOOGLE/APPLE** | 0.4 |
| `cliente-11-busca.png` | Busca (resultados produto/loja) | 0.5 |
| `cliente-12-detalhe-produto.png` | Detalhe do produto (rating, "Em estoque", quantidade) | 0.5 |
| `cliente-13-pagamento.png` | Pagamento (PIX + cartão salvo, adicionar cartão) | 0.6 |
| `cliente-14-pedido-concluido.png` | Pedido #1990 concluído (recibo) | 0.7 |

### App Lojista (tema dark `#1B1E1C`)
| Referência | Tela | Story |
|-----------|------|-------|
| `lojista-01-painel.png` | Painel do lojista (saldo, vendas, dashboard) | 0.11 |
| `lojista-02-pedidos.png` | Pedidos (ativos / concluídos) | 0.10 |
| `lojista-03-confirmar-retirada-pin.png` | Confirmar retirada (teclado PIN) | 0.10 |
| `lojista-04-vendas.png` | Vendas (7/30/90/1a, top produtos) | 0.11 |
| `lojista-05-carteira.png` | Carteira (saldo, a receber, saques) | 0.11 |
| `lojista-06-cadastro-passo1.png` | Cadastro estabelecimento — passo 1/3 | 0.8 |
| `lojista-07-catalogo.png` | Catálogo (lista, tabs, produtos) | 0.9 |
| `lojista-08-pedido-detalhe-separar.png` | Pedido detalhe / separar | 0.10 |
| `lojista-09-horarios.png` | Horários & disponibilidade (toggle) | 0.9 |
| `lojista-10-extrato.png` | Extrato financeiro | 0.11 |
| `lojista-11-configuracoes.png` | Configurações & equipe (perfil público) | 0.8 |

## ⚠️ Conflitos protótipo × decisões de negócio (precisam de decisão)

Revelados pela inspeção visual. **Não resolver sem o Caio/stakeholder** (regra do `CLAUDE.md`):

1. **Mapa** em `cliente-05-escolha-ponto-retirada.png` — o protótipo mostra um mapa com pins. Mas a decisão da Rodada 4 (`ARQUITETURA.md`) afirma *"sem provider de mapa, confirmado por inspeção do protótipo que não há mapa"* — **inspeção incorreta**. Decidir: honrar o protótipo (adicionar mapa → custo + provider) ou manter a decisão (sem mapa, desviar do visual).
2. **Login social (Google/Apple)** em `cliente-09-criar-conta.png` e `cliente-10-login.png` — o protótipo mostra os botões. Mas a Rodada 2 decidiu *"login social fora do MVP"*. Decidir: esconder, mostrar desabilitado, ou reverter a decisão.

Registrar a decisão em `docs/PERGUNTAS_REGRAS_NEGOCIO.md`.
