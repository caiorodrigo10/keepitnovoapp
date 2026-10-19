# 01 — Goals, Background Context, Success Metrics

> **Política vigente do piloto (2026-07-31):** preservar a interface detalhada
> e validar uma fatia vertical com backend essencial para até aproximadamente
> 200 usuários. Operações manuais explícitas são aceitas; sucessos fictícios
> não são. Classificação completa em
> [`07-plano-mvp-piloto.md`](./07-plano-mvp-piloto.md).

## Goals

Resultados que o MVP do Keepit deve entregar:

- Permitir que um cliente compre de uma loja local próxima e retire o pedido em um Hub Keepit compartilhado, sem precisar de entrega em domicílio.
- Dar ao lojista uma via digital simples para receber, aceitar, preparar e entregar pedidos no hub — sem precisar montar operação de última-milha.
- Provar o modelo financeiro com PIX, registro auditável de valores e repasse
  inicialmente operado pelo admin; automação de saque não bloqueia o piloto.
- Sustentar uma operação inicial com **4-5 hubs físicos** e **até dezenas de lojistas ativos**, sem necessidade de arquitetura escalável.
- Validar em produção com usuários reais o modelo *click-and-collect* + encontro presencial no hub com PIN de 4 dígitos.
- Publicar dois apps nativos (iOS + Android para Cliente e para Lojista) e um painel admin web para operação interna da Keepit.

## Background Context

A Keepit propõe um marketplace hiperlocal *click-and-collect*: em vez de o cliente esperar entrega em casa, ele compra de várias lojas próximas e retira **tudo em um hub compartilhado** próximo. O modelo elimina a última-milha para o comerciante local, dá agilidade ao cliente, e centraliza a experiência no Hub Keepit.

O produto se materializa em **três artefatos de software**: (1) app do Cliente, (2) app do Lojista, (3) painel admin da Keepit. O MVP não busca escala nem UX inovadora — busca **provar operacionalmente o modelo do hub e do PIN**, com fidelidade total ao protótipo visual (`keepit-app/index.html`) e regras de negócio já consolidadas em `docs/PERGUNTAS_REGRAS_NEGOCIO.md`.

O contexto operacional é conhecido e pequeno: **4-5 hubs físicos** iniciais, sem armazenagem no hub (encontro sincronizado cliente↔lojista), sem locker no MVP, ticket médio esperado baixo, poucos lojistas curados manualmente pela Keepit. A restrição estratégica principal é **simplicidade sem ser porca** — cada função importante existe e funciona, mas nada é feito para escalar antes da hora.

## Success Metrics

O MVP será considerado **validado** quando:

- **10 lojas ativas** operando pedidos com regularidade em produção.
- Pedidos sendo processados ponta a ponta; a intervenção do admin em aprovação,
  reembolso, repasse e exceções é aceitável e mensurada durante o piloto.
- Os três apps (Cliente, Lojista, Admin) publicados e estáveis, sem retrabalho arquitetural relevante nos primeiros meses de operação.

## Não-metas explícitas do MVP

Para deixar claro o que **não** precisa ser demonstrado neste MVP:

- Escala massiva (dezenas de milhares de pedidos/dia). Arquitetura é vertical e simples.
- Divulgação massiva. Vamos abrir público desde o começo, mas sem investimento em marketing amplo — o volume inicial virá orgânico + esforço direto de curadoria de lojistas.
- Diversificação de canais de entrega (não terá delivery em casa como fallback).
- Ecossistema de features "premium" (avaliações, promoções, cupons, cashback, chat interno, favoritos, "comprar de novo") — todos deliberadamente fora do MVP.
