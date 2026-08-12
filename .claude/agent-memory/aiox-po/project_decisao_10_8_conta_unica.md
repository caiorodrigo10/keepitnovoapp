---
name: decisao-10-8-conta-unica
description: Decisão 10.8 resolvida — conta do Cliente é superfície única (Perfil frame 08), sem tela de Configurações; Stories 2.8/2.9/2.10 devem refletir isso
metadata:
  type: project
---

Decisão **10.8 RESOLVIDA (2026-08-02, Rodada 8, Caio)**: a conta do Cliente é uma **superfície única — o Perfil (frame 08)**. **Não há tela de "Configurações" separada** no app do Cliente. Itens do menu do frame 08: *Meus pedidos*, *Hubs favoritos*, *Formas de pagamento*, *Notificações*, *Ajuda & suporte*, *Termos*, *Política* e **"Excluir minha conta"** (obrigatório por compliance Apple 5.1.1(v); sem fonte no protótipo, entra como item de menu). Notificações segue o protótipo: item de menu com chevron → tela dedicada (não toggle inline).

**Why:** aplicação do princípio nº 1 do `CLAUDE.md` (fidelidade ao protótipo). As Stories 2.8/2.9/2.10 foram escritas assumindo **duas telas** (Perfil + Configurações) e disputavam a mesma superfície de UI. Fonte autoritativa: `docs/PERGUNTAS_REGRAS_NEGOCIO.md` §10.8 e `## Decisões → Rodada 8`.

**How to apply:** ao validar/reconciliar qualquer story de conta do Cliente, garantir superfície única no Perfil, menu do frame 08, "Excluir minha conta" presente com **navegação honesta** (o fluxo de exclusão em si depende de WhatsApp/atendimento — Story 2.9), e **proibir** criação de tela `Configuracoes`. Story **2.8 já reconciliada** por mim em 2026-08-12 (v0.3.0, mantida Ready). **2.9 e 2.10 ainda NÃO reconciliadas** — quando forem validadas, aplicar a mesma decisão. A AC3 da 2.9 (toggle `clientes.notificacoes_ativas`) deve migrar para a tela de destino de Notificações, não ficar como toggle solto no Perfil.

Relacionado: [[epic2-ac-traceability]].
