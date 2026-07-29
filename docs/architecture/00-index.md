# Architecture — Índice

Documentos de arquitetura do Keepit MVP, produzidos pelo @architect (Aria).

## Estrutura

| Arquivo | Conteúdo | Status |
|---|---|---|
| [01-system-design.md](#01-system-design) | Diagrama de contexto e componentes | ⏭ ver `docs/ARQUITETURA.md` |
| [02-tech-stack.md](#02-tech-stack) | Stack completo com versões | ⏭ ver `docs/ARQUITETURA.md` |
| [03-data-models.md](./03-data-models.md) | Schema completo Supabase + convenções | ✅ Produzido |
| [04-patterns.md](#04-patterns) | Padrões de código, estrutura de pastas | ⏭ ver `docs/ARQUITETURA.md` |
| [05-security.md](./05-security.md) | RLS policies + segredos + criptografia | ✅ Produzido |

## Escopo focado desta rodada

Por decisão explícita (solo dev + MVP, cerimônia proporcional), o @architect produziu apenas os 2 documentos que **destravam o dev** — `03-data-models.md` e `05-security.md`. Os outros 3 (system design, tech stack, patterns) estão adequadamente cobertos por `docs/ARQUITETURA.md` que foi construído colaborativamente com o Caio nas rodadas 3-4 de decisões.

Se a operação crescer (time novo entrando, arquiteto externo revisando), vale expandir os 3 documentos ausentes.

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-07-02 | 1.0 | Criação de `03-data-models.md` e `05-security.md` | @architect (Aria) |
