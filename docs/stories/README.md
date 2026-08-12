# Histórias AIOX — política do MVP piloto

As histórias concluídas neste diretório permanecem como registro imutável do
trabalho entregue. A correção de curso de 2026-07-31 não altera `Done`, não
apaga QA gates e não reescreve o passado.

## Fontes de verdade

1. Escopo e ACs históricos: `docs/prd/epics/*.md`.
2. Prioridade e profundidade atual: `docs/prd/07-plano-mvp-piloto.md`.
3. Arquitetura executável do piloto:
   `docs/architecture/07-mvp-pilot-backend.md`.
4. Capacidades adiadas: `docs/prd/08-backlog-pos-piloto.md`.
5. Estado anterior completo: tag
   `backup/pre-mvp-backend-simplification-2026-07-31`.

## Cabeçalho obrigatório para novas histórias

Toda Story criada após esta decisão deve declarar, logo após `## Status`:

```markdown
## MVP Pilot Classification

- Classificação: CORE | SIMPLE | UI_ONLY | LATER
- Fonte: docs/prd/07-plano-mvp-piloto.md
- Backend esperado: <comportamento observável e limite explícito>
- Retomada futura: <FR/Story original ou N/A>
```

## Modo de dados obrigatório

Toda Story que toque clientes, lojas, produtos, hubs, pedidos ou dados de
operação deve declarar, logo após a classificação do piloto:

```markdown
## Data Mode

- Entidades: <clientes | lojas | produtos | ...>
- Modo padrão: mock
- Modo real: `DATA_SOURCE=supabase` — <qual comportamento real esta Story habilita>
- Compatibilidade mock: <o que continua navegável e visualmente idêntico com `DATA_SOURCE=mock`>
- Modo híbrido: proibido sem uma Story arquitetural que o defina por port.
```

`DATA_SOURCE=mock` é o padrão seguro e as fixtures em
`packages/core-data/src/mock` são preservadas. Uma Story não pode apagar,
renomear ou tornar os mocks inutilizáveis ao ligar um fluxo real. A ativação
real deve ser explícita por ambiente; a ausência ou um valor inválido da flag
continua selecionando mock. Isso permite validar cada fatia real sem alterar a
experiência de demonstração de clientes, lojas e produtos.

## Regras para os agentes

### SM

- Criar histórias apenas para a próxima fatia vertical desbloqueada.
- Não criar Story de implementação para itens `LATER`.
- Em `SIMPLE`, transformar automação em comportamento manual rastreável sem
  remover a experiência da interface.
- Dividir trabalho por resultado observável, não por camada técnica isolada.

### PO

- Rejeitar histórias que removam telas sem decisão explícita do responsável do
  produto.
- Rejeitar sucesso fictício, dados mockados em produção ou botões sem destino.
- Aceitar operação humana quando ela cria estado real e auditável.

### Architect/Data Engineer

- Aplicar o overlay do piloto antes da arquitetura-alvo.
- Preservar contratos e migrations forward-only; não criar infraestrutura para
  itens `LATER`.
- Não simplificar RLS, idempotência, integridade financeira ou PIN server-side.

### Dev

- Manter as telas desacopladas por `packages/core-data`.
- Implementar somente a profundidade classificada.
- Preservar `DATA_SOURCE=mock` e suas fixtures; nunca trocar a fonte padrão
  para real como efeito colateral de uma Story.
- Não apagar ports ou UI futura; métodos fora do piloto devem ficar fora do
  caminho ativo e com comportamento explícito.

### QA

- Validar a experiência visual e todos os estados da tela.
- Para `SIMPLE`, validar criação, consulta e conclusão manual da solicitação.
- Não abrir issue por ausência de automação classificada como `LATER`.
- Abrir issue se houver autorização somente client-side, dinheiro sem trilha,
  webhook não idempotente ou sucesso simulado.

## Definition of Done adicional

- [ ] Classificação do piloto declarada.
- [ ] Interface mantém fidelidade e estados loading/vazio/erro.
- [ ] Ação principal tem efeito real e verificável.
- [ ] Limite da simplificação aparece nas notas da Story.
- [ ] Item futuro aponta para o FR/Story preservado.
- [ ] Segurança e registros financeiros pertinentes foram testados.
