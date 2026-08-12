# 07 — Arquitetura do backend essencial para o piloto

Este documento é um **overlay arquitetural**. Em conflitos sobre profundidade de
backend, ele prevalece sobre `docs/ARQUITETURA.md` e `docs/prd/04-technical.md`.
Stack, segurança e contratos existentes continuam válidos.

## Objetivo

Manter os três frontends detalhados e conectar uma única fatia vertical real,
sem construir automações destinadas a uma operação maior que o piloto.

```text
Cliente/Expo ─┐
Lojista/Expo ─┼─> supabase-js ─> PostgreSQL + RLS + Auth + Storage
Admin/Next ───┘                         │
                                       └─> Edge Functions mínimas ─> Asaas PIX
```

Não existe API Node separada, fila, cache, motor de workflow, barramento de
eventos ou camada analítica.

## Fronteira entre frontend e backend

Os contratos em `packages/core-data` permanecem como fronteira estável. Uma
implementação Supabase pode ser direta, mas não pode retornar sucesso fictício.

- Leitura e CRUD simples: `supabase-js` + RLS.
- Operação privilegiada ou com segredo: Edge Function.
- Métricas: views/queries SQL diretas.
- Atualização de pedido ativo: polling moderado e refresh manual.
- Ação manual: criar registro de solicitação/ocorrência com status e autoria.

## Edge Functions mínimas

| Função | Por que precisa existir |
|---|---|
| `create-pix-payment` | Protege a chave Asaas, cria cobrança e associa ao pedido. |
| `asaas-payment-webhook` | Valida origem, processa idempotentemente e confirma pagamento. |

Cadastro, catálogo, busca e mudanças comuns de perfil não precisam de Edge
Function quando RLS e constraints cobrem a autorização.

**Critério para ser Edge Function (2026-08-12):** algo só vira Edge Function quando
há **segredo server-side** (chave Asaas) ou **validação de origem externa** (webhook
Asaas). **Autorização + escrita no banco** — mesmo em estados críticos — resolvem-se
com **RLS + RPC PostgreSQL `SECURITY DEFINER`**, sem abrir superfície de deploy/teste
de Edge Function e sem perder a validação server-side (que é o requisito inegociável).
Isso estende a regra já enunciada acima ("cadastro, catálogo... não precisam de Edge
Function quando RLS e constraints cobrem a autorização") também para a **confirmação
de PIN** e a **ação financeira administrativa**, que passam a ser RPCs (ver abaixo).
Restam **apenas duas** Edge Functions no piloto — as duas que tocam o segredo/origem
Asaas.

### Operações server-side via RPC `SECURITY DEFINER` (2026-08-12)

Não tocam segredo externo nem origem externa: são autorização + escrita no banco.
Ficam como funções PostgreSQL `SECURITY DEFINER` chamadas via `supabase-js` (`rpc()`).

| RPC | Papel |
|---|---|
| `confirmar_pin_pedido(pedido_id, pin)` | Confirma a entrega validando o PIN no servidor. |
| `admin_acao_financeira(...)` | Registra reembolso/repasse/ajuste manual no ledger, com autoria admin. |

- **`confirmar_pin_pedido(pedido_id, pin)`** — `SECURITY DEFINER`. Valida o PIN
  digitado contra `pin_hash` via `pgcrypto` (`crypt(pin, pin_hash) = pin_hash`);
  o PIN **nunca** trafega nem é armazenado em texto puro do lado da verificação.
  Checa autorização (o chamador é o **lojista dono** do pedido) e o estado válido
  (pedido em `at_hub`/estado que admite entrega). Incrementa `tentativas_pin` e
  aplica `pin_bloqueado_ate` em caso de erro. **Somente esta função pode transicionar
  o pedido para `delivered`** — mantendo a regra de §"Fluxo do pedido no piloto"
  ("somente a função de PIN pode produzir este estado"). A regra não mudou; mudou
  apenas o **veículo**: de Edge Function para RPC `SECURITY DEFINER`.
- **`admin_acao_financeira(...)`** — `SECURITY DEFINER`, guardada por `is_admin()`.
  Registra reembolso/repasse/ajuste manual como lançamentos financeiros com autoria
  admin. O **modelo do ledger é unificado em outra mudança** — aqui não se modela o
  ledger; apenas se estabelece que esta RPC é o único caminho de escrita financeira
  administrativa, sempre com autor admin e sob `is_admin()`.

Requisitos de segurança permanecem inegociáveis: validação server-side, PIN nunca
exposto em texto puro, autorização por papel/ownership (RLS + `SECURITY DEFINER`).

**Chave Asaas única no piloto (2026-08-12):** existe **uma única conta Asaas da
Keepit**. Sua chave vive apenas no **env da Edge Function `create-pix-payment`**
(segredo server-side), nunca no banco. **Não há subconta nem chave por lojista**
no piloto — a aprovação do lojista (Story 3.8, `SIMPLE`) apenas ativa o cadastro,
sem chamar `POST /v3/accounts`. Portanto o schema **não persiste**
`asaas_api_key_encrypted` e `estabelecimentos.asaas_wallet_id` permanece NULL
(ver `03-data-models.md` §1.4 e §"Extensões" — `pgsodium` fica fora do piloto).
Subconta/chave por lojista volta apenas com o gatilho "repasses manuais consomem
tempo ou geram erro" abaixo.

## Fluxo do pedido no piloto

```text
draft -> awaiting_payment -> awaiting_acceptance -> preparing -> at_hub -> delivered
                         \-> cancelled       \---------------------> support_required
```

- `awaiting_payment`: cobrança PIX criada.
- `awaiting_acceptance`: somente após webhook confirmado.
- `preparing`: lojista aceitou e informou previsão.
- `at_hub`: um check-in operacional do lojista é suficiente.
- `delivered`: somente a função de PIN pode produzir este estado.
- `support_required`: exceções depois do aceite seguem para operação humana.

O modelo de dados pode manter estados mais detalhados já existentes. O piloto
apenas não depende de automações para transitar por todos eles.

**Mapeamento fluxo↔enum do schema (2026-08-12):** os ~7 estados observáveis acima
correspondem ao enum de `pedidos.status` em [`03-data-models.md`](./03-data-models.md)
§5.1. O piloto implementa lógica de transição apenas para este subconjunto; os demais
valores do CHECK ficam como modelo-alvo (frase acima), sem lógica no piloto.

| Estado observável no piloto | Valor(es) do enum `pedidos.status` | Observação |
|-----------------------------|------------------------------------|------------|
| `awaiting_payment`    | `aguardando_pagamento` | cobrança PIX criada |
| `awaiting_acceptance` | `aguardando_aceite`    | só após webhook confirmado |
| `preparing`           | `aceito` → `em_preparo` | aceite + previsão do lojista |
| `at_hub`              | `no_hub`               | um check-in operacional do lojista |
| `delivered`           | `entregue`             | **somente pela RPC de PIN** (server-side) |
| `cancelled`           | `cancelado`            | + `motivo_recusa` / `motivo_cancelamento` |
| `support_required`    | (sem valor de enum dedicado) | exceção pós-aceite → operação humana; `motivo_nao_retirado` quando cabível |

Valores extras do CHECK — `cancelado_timeout`, `cancelado_atraso`, `cancelado_admin`,
`saindo_hub`, `recusado`, `nao_retirado`, `nao_entregue_lojista`, `estornado_chargeback`
— **não recebem lógica de transição no piloto**: dependem de job/push/chargeback adiados
e voltam junto com a automação correspondente, sem migration (o CHECK já os aceita).

**Pedidos vencidos sem job automático (2026-08-12):** no piloto **não roda** o job
`pg_cron` de timeout de aceite (Story 6.10, `LATER`) — ver
[`03-data-models.md`](./03-data-models.md) §7, onde o DDL fica como modelo-alvo.
Um pedido vencido é aquele em `status = 'aguardando_aceite' AND criado_em < now() -
interval '10 min'`; ele é **identificado por query/filtro no painel Admin** (apoiada
pelo índice `idx_pedidos_aguardando_aceite`), não cancelado automaticamente. O
cancelamento/reembolso, quando cabível, segue a ação manual do Admin (ver §"Financeiro
mínimo"). A automação só retorna pelo gatilho já listado em §"Gatilhos para aumentar
complexidade" ("Admin não consegue acompanhar vencimentos → Job de timeout"). De
forma análoga, o aviso de atraso ao lojista depende de push nativo, também adiado, e
volta pelo gatilho "Operação perde pedidos por falta de aviso → Push nativo".

## Financeiro mínimo

Mesmo com repasse manual, valores não podem viver apenas como soma recalculada
da UI. Manter um ledger simples e auditável com:

- referência ao pedido;
- tipo (`charge`, `platform_fee`, `merchant_credit`, `refund`, `payout`);
- valor imutável em centavos;
- status;
- identificador externo do Asaas quando existir;
- timestamps e ator administrativo.

O botão de saque cria uma solicitação. O admin executa o PIX fora do fluxo
automatizado, informa a referência e conclui a solicitação. Reembolso segue a
mesma lógica. Automatizar depois não exige mudar a experiência nem perder o
histórico. Como há **uma conta Asaas única** (sem subconta por lojista), o
repasse é **PIX manual** da Keepit para o lojista — não há transferência
automática Asaas→subconta no piloto.

## Descoberta

- Hubs cadastrados explicitamente pelo Admin.
- Cliente escolhe um hub em lista.
- Relação loja↔hub explícita no banco ou definida na aprovação.
- Busca por produto/loja com filtro case-insensitive do PostgreSQL.
- Sem GPS, Haversine, mapa, geocoding ou ranking especializado no piloto.

## O que permanece obrigatório

- RLS por papel e ownership.
- Segredos apenas em ambiente server-side.
- Webhook autenticado, idempotente e com evento persistido.
- Constraints e validação server-side para estados críticos.
- PIN não armazenado/exposto em texto puro quando o modelo atual permitir hash.
- Testes unitários do PIN, valores financeiros e transições do pedido.
- Smoke manual da fatia vertical antes de cada promoção para produção.

## Gatilhos para aumentar complexidade

| Gatilho observado | Capacidade a retomar |
|---|---|
| Operação perde pedidos por falta de aviso | Push nativo. |
| Admin não consegue acompanhar vencimentos | Job de timeout. |
| Clientes abandonam checkout por falta de opção | Cartão/tokenização. |
| Repasses manuais consomem tempo ou geram erro | Saque automático/subconta. |
| Número de hubs torna escolha manual ruim | GPS/Haversine/mapa. |
| Exceções recorrentes mostram padrão estável | Motor de cancelamento/no-show. |
