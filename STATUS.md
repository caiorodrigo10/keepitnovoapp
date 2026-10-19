# Status de homologação

## 2026-10-16 — flag cartão

- Alvo: keepit-dev (homologação; ref redigida `jhh…fppo`).
- Segredo configurado: `CARD_TOKENIZATION_ENABLED` (valor não registrado).
- Validação estática: `deno check` passou para as 9 Edge Functions.
- Publicação: todas as 9 funções do worktree foram processadas. Pacotes novos: `create-card-payment` v9, `reconcile-card-validation` v6 e `tokenize-card` v6; as demais já coincidiam com o artefato remoto.
- Estado remoto: 9/9 funções `ACTIVE`.
- Smoke sem autenticação: nenhuma chamada retornou HTTP 500 (8 respostas 401; `process-account-deletions` respondeu 503 controlado).
- Cartão salvo: o pacote publicado de `tokenize-card` usa `CARD_TOKENIZATION_ENABLED === 'true'`; com a flag desabilitada, o caminho autenticado retorna HTTP 503, código `CARD_TOKENIZATION_DISABLED` (confirmado no código e nos testes).

