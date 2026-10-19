# Smoke test — Piloto mock em iOS

> **Escopo:** este é o roteiro **enxuto do piloto mock** (Story 9.0.8). Ele valida o
> essencial dos dois apps rodando **100% em dados mock**, no build de piloto (TestFlight
> interno). **Não** é o smoke da Fase Real (Story 9.4), que cobre backend/produção,
> cobrança PIX real e push real. Se você procura o roteiro de produção, este **não** é ele.

## Pré-condições

- Build de piloto instalado via TestFlight interno (Story 9.0.7) nos dois apps.
- **Dois aparelhos** são necessários para exercitar um pedido ponta a ponta:
  - Aparelho **A** com o app **Cliente**.
  - Aparelho **B** com o app **Lojista**.
  - Motivo: no build de release os controles de dev foram ocultados (Story 9.0.5).
    Sem o `OrderStatusDevAdvancer`, **não há como avançar o status do pedido num único
    device** — quem faz o pedido avançar é o Lojista, no aparelho B.

## Natureza mock (o que NÃO funciona de propósito)

Antes de começar, saiba que neste build:

- **Sem cobrança PIX real** — o pagamento é simulado, nenhum valor é movimentado.
- **Cartão inativo** — o método cartão aparece mas não processa.
- **Sem push real** — nenhuma notificação push é enviada; as transições são vistas
  abrindo o app.
- Todos os dados (lojas, produtos, hubs, saldo) são **fixtures de mock**.

Se algo acima "não funcionar", é o comportamento esperado — não é bug.

---

## Parte 1 — App Cliente (aparelho A)

| # | Passo | Tela | Critério de OK |
|---|-------|------|----------------|
| 1 | Abrir o app pela primeira vez | `Onboarding1` → `Onboarding2` → `Onboarding3` | As 3 telas de onboarding avançam na ordem; a 3ª mostra a copy "Tudo perto de você, retirado no hub." e um botão para entrar/cadastrar. |
| 2 | Entrar (mock) | `Login.tsx` / `CriarConta.tsx` | Login mock conclui e navega para a home; nenhuma confirmação de e-mail/SMS é exigida. |
| 3 | Ver a home de hubs | `Hub.tsx` | A tela abre listando hubs mock com nome e endereço visíveis. |
| 4 | Abrir uma loja | `Loja.tsx` | A loja abre com título/nome da loja e ao menos um produto listado. |
| 5 | Abrir um produto | `DetalheProduto.tsx` | O produto abre com nome, preço e botão de adicionar ao carrinho. |
| 6 | Adicionar ao carrinho e revisar | `Carrinho.tsx` | O item aparece no carrinho com preço; total é exibido. |
| 7 | Avançar para checkout | `Checkout.tsx` | Resumo do pedido com hub de retirada e valores. |
| 8 | Ir para pagamento | `Pagamento.tsx` | Tela de pagamento abre; PIX aparece como método (mock, não cobra); cartão aparece inativo. |
| 9 | Confirmar o pedido | — | O pedido é criado e passa a existir para o Lojista (aparelho B). |

> **Pausa:** neste ponto vá ao **aparelho B** (Parte 2) para o Lojista aceitar e avançar o
> pedido até "no hub". Depois volte ao aparelho A para o passo 10.

| # | Passo | Tela | Critério de OK |
|---|-------|------|----------------|
| 10 | Exibir o PIN de retirada | `ModalConfirmarPin.tsx` | O modal mostra um **PIN de 4 dígitos** legível, pronto para o Lojista digitar. |
| 11 | Ver o recibo após a entrega | `Recibo.tsx` | O recibo mostra o **valor** e o **hub** corretos do pedido. |

---

## Parte 2 — App Lojista (aparelho B)

| # | Passo | Tela | Critério de OK |
|---|-------|------|----------------|
| 1 | Entrar (mock) | `Login.tsx` (Story 9.0.4) | Login mock conclui e navega para o dashboard. |
| 2 | Ver o dashboard financeiro | `financeiro/Dashboard.tsx` | Abre com indicadores/valores mock visíveis. |
| 3 | Ver novos pedidos | `pedidos/NovosPedidos.tsx` | O pedido criado pelo Cliente (Parte 1, passo 9) aparece na lista. |
| 4 | Aceitar o pedido | `AceitarPedido.tsx` | O pedido muda de estado após aceitar; permite avançar o preparo/saída até "no hub". |
| 5 | Digitar o PIN do Cliente | `pedidos/DigitarPin.tsx` | Ao digitar o **PIN de 4 dígitos** exibido no aparelho A (Parte 1, passo 10), a entrega é confirmada. |
| 6 | Ver a carteira | `financeiro/Carteira.tsx` | A carteira abre; o valor do pedido entregue reflete no saldo/extrato mock. |

---

## Resultado esperado

- Os dois fluxos completam sem travar.
- O pedido percorre **Cliente cria → Lojista aceita e avança → PIN confere → recibo/carteira**.
- Nenhum passo dependeu de SMS (decisão 10.4), cobrança real, cartão ativo ou push real.

## Registro do teste

| Campo | Valor |
|-------|-------|
| Data | |
| Versão do build (Cliente / Lojista) | |
| Aparelhos usados (A / B) | |
| Passos com falha (nº) | |
| Observações | |
