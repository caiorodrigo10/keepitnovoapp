---
name: project-epic4-catalogo
description: Status e decisões em aberto do catálogo do Épico 4 (Stories 4.3-4.8) após draft de 2026-08-12
metadata:
  type: project
---

Épico 4 (Cadastros Base) tinha só a Story 4.1 (hubs, Done) antes desta
sessão. Draftei 4.3-4.8 (catálogo de produtos + pausa manual da loja);
**4.2 ficou fora de propósito** (é sobre leitura pública de HUBS pelo
cliente, não catálogo — mistura de domínio no `07-plano-mvp-piloto.md` que
agrupa "4.2–4.6" como "catálogo", mas o texto real da Story 4.2 no epic
`4-cadastros-base.md` é sobre `hubs`, e seus stubs de porta já são
epic-hinted `'Épico 5'`). Recomendado tratar 4.2 junto do kickoff do Épico 5
(Descoberta), não como parte do lote de catálogo.

**Why:** entender a numeração real do Épico 4 evita recriar 4.2 com escopo
errado e evita duplicar a decisão de leitura pública de hubs, que já está
sinalizada como pertencente ao Épico 5 desde a Story 4.1.

**Decisões de arquitetura deixadas EM ABERTO nos drafts (não decididas pelo
@sm, delegadas a @architect/@data-engineer antes de `Ready`):**
- Bucket de foto de produto (Story 4.4): `05-security.md §6.7` só declara
  `hubs` como bucket público — produto teria que ser Opção A (novo bucket
  público, paralelo a hubs) ou Opção B (privado/signed URL, paralelo a
  fachadas). Duas opções documentadas na Story 4.4, nenhuma escolhida.
- Contrato de upload de foto em `ProductPort` (não existe método hoje, ao
  contrário de `AdminPort.hubsCrud.uploadFoto`/
  `EstabelecimentoCadastroPort.uploadFachada`).
- Leitura do PRÓPRIO estabelecimento pelo lojista (`StorePort.getById`, hoje
  stub `'Épico 5'`) — decisão COMPARTILHADA entre Stories 4.7 e 4.8
  (`LojaDisponibilidadeContext` usa o mesmo método nas duas telas). Resolver
  uma vez só.
- Compressão de imagem client-side (AC5 da 4.4): sem lib de manipulação de
  imagem instalada no workspace (`expo-image-manipulator` ausente) — mesmo
  padrão de gap já visto nas Stories 3.1/3.5 (upload de foto sem
  `expo-image-picker`).

**Forward dependency (`pedidos` não existe ainda):** as Stories 4.6 (excluir
produto) e 4.8 (pausa manual) têm ACs do épico que citam "pedidos em aberto"
— inverificável hoje porque `pedidos` só chega no Épico 6, que vem DEPOIS de
4.x/5.x na ordem de execução do piloto (`07-plano-mvp-piloto.md`). Ambas as
Stories foram draftadas com essa checagem explicitamente fora de escopo
(débito de retomada), não implementada de forma simulada.

**How to apply:** ao expandir/validar/desenvolver 4.3-4.8, ou ao criar a
Story 4.2 separadamente, checar primeiro se essas decisões já foram tomadas
(procurar Dev Notes/Change Log das Stories atualizadas) antes de perguntar
de novo. Ver também [[feedback_sm_story_pattern_keepit]].
