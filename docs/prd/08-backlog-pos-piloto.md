# 08 — Backlog preservado pós-piloto

Este arquivo não redefine requisitos. Ele reúne os itens cuja automação foi
adiada e aponta de volta para os identificadores originais, preservados no PRD.

## Integrações e automações adiadas

| Capacidade | Origem | Retomada esperada |
|---|---|---|
| Push nativo | FR25; Stories 2.11, 6.8, 6.13 | Quando polling/refresh prejudicar a operação. |
| Cartão e cartões salvos | FR11–FR12, FR54; Stories 7.3–7.4 | Após validar conversão e operação do PIX. |
| Chargeback automático | FR56; Story 7.11 | Antes de abrir cartão ao público. |
| Timeout automático | FR32; Story 6.10 | Quando a monitoração manual deixar de ser sustentável. |
| Subconta Asaas automática | FR46; Story 3.8 | Após validação comercial/regulatória com o gateway. |
| Saque automático | FR41; Story 7.8 | Quando volume de solicitações justificar integração. |
| GPS, Haversine e mapa | FR5, FR59; Stories 5.1 e 4.1 | Quando houver hubs suficientes para a distância mudar a escolha. |
| BrasilAPI obrigatória | FR27; Story 3.3 | Quando conferência manual gerar atraso ou fraude. |
| Motor completo de exceções | FR19–FR20, FR37; Stories 6.18–6.21 | Após observar casos reais e validar percentuais. |

## Itens removidos anteriormente, ainda recuperáveis

- SMS/Zenvia: FR2 e Stories 2.4–2.5.
- Login social, avaliações, promoções, cupons, chat e fidelidade: continuam fora
  do MVP conforme decisões existentes.

## Regra de retomada

Ao retomar uma capacidade:

1. Remover `LATER` ou `SIMPLE` apenas da linha correspondente em
   [`07-plano-mvp-piloto.md`](./07-plano-mvp-piloto.md).
2. Revalidar as ACs da Story original contra o comportamento observado no
   piloto.
3. Criar uma Story corretiva somente se o contrato original tiver mudado; não
   duplicar a Story preservada.
4. Atualizar arquitetura, riscos de segurança e testes proporcionais.
