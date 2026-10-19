---
name: prova-empirica-adapters
description: Testes do @dev em core-data tendem a provar o caso trivial (client injetado); QA deve escrever teste temporário no caminho real
metadata:
  type: project
---

Em `packages/core-data/src/supabase/*`, os testes do @dev usam `createAuthSupabase(client)` com `client` injetado — o que torna memoização/lazy-init trivialmente verdadeiros e **não exercita o caminho de produção** (`client` ausente → `createClient()`).

**Why:** na Story 2.3.1 a AC2 (memoizar `SupabaseClient`) só ficou provada quando escrevi teste temporário com `vi.mock('@keepit/supabase-client')` contando chamadas de `createClient()`. O teste do @dev passaria mesmo se a memoização não existisse.

**How to apply:** para qualquer AC sobre instanciação, lazy-init ou propagação de erro de `createClient()`, escreva teste temporário mockando `@keepit/supabase-client` (contagem de chamadas / impl que lança), rode, reporte a saída real e **apague o temporário**. Vale também para provar throw síncrono capturável por `try/catch` no consumidor. Ver [[ac_navegacao_pos_auth]] e [[debito_validacao_device]].
