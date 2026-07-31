# Arquivo e pontos de restauração

Este diretório documenta como recuperar versões anteriores do planejamento. Os
artefatos adiados continuam no PRD e nos épicos; não são apagados nem
reescritos como se nunca tivessem existido.

## Marco anterior à simplificação do backend

- Data: 2026-07-31
- Tag Git: `backup/pre-mvp-backend-simplification-2026-07-31`
- Commit preservado: `cdf94bbf525ff5f5f562d59f996374af49fc2404`
- Conteúdo: código, PRD, arquitetura, épicos e histórias existentes antes da
  correção de curso "frontend completo + backend essencial".

### Consultar sem alterar o workspace

```bash
git show backup/pre-mvp-backend-simplification-2026-07-31:docs/prd/02-requirements.md
git diff backup/pre-mvp-backend-simplification-2026-07-31..HEAD -- docs/
```

### Restaurar em um worktree separado

```bash
git worktree add ../keepit-pre-simplificacao backup/pre-mvp-backend-simplification-2026-07-31
```

O worktree separado evita sobrescrever o desenvolvimento atual. Não mover a tag
para outro commit: ela é o ponto imutável de referência desta decisão.
