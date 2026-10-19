---
name: signed-url-rls-admin
description: createSignedUrl client-side exige policy de SELECT em storage.objects para o role que assina — o Admin (authenticated) precisa de OR is_admin() no bucket privado fachadas
metadata:
  type: project
---

Quando um app client-side (Admin Next.js, sem `app/api`, sem service_role) gera
`createSignedUrl` de um objeto de bucket PRIVADO, o Supabase Storage avalia RLS de
SELECT em `storage.objects` com o JWT do chamador. Se a única policy de leitura for
"dono lê a própria pasta" (`foldername[1] = auth.uid()`), o Admin (uid ≠ dono) é
NEGADO e `createSignedUrl` retorna `StorageApiError` — a assinatura NÃO dispensa RLS
(só `service_role` dispensa).

**Why:** na Story 3.7 (listar lojistas pendentes) o bucket `fachadas`
(`20260812123049`) só tinha `fachadas_lojista_le_propria`; havia um `TODO STORY 3.7`
para adicionar `OR is_admin()` que NÃO foi implementado. O adapter
`admin.supabase.ts#pendingStoreDetail` assina client-side e faz `throw` no erro →
derruba a tela de detalhe inteira em modo real. Levou a gate FAIL (AC3). O comentário
da migration presumia "assinatura server-side com service_role", mas a arquitetura do
Admin é 100% client-side (service_role no bundle é proibido).

**How to apply:** em qualquer story onde o Admin (ou outro papel que não o dono) exibe
objeto de bucket privado via URL assinada, confirme que existe policy de SELECT em
`storage.objects` cobrindo esse papel (`OR public.is_admin()`), OU que a assinatura é
feita server-side com service_role (API route). Sonde: `grep storage.objects
migrations | grep is_admin`. Ausência = HIGH funcional (a foto E, se o adapter faz
throw, a tela toda quebram). Vale para 3.8/3.9 e Épico 8 (painel admin). Ver
[[prova-empirica-adapters]] e [[verificar-tipo-gerado-vs-schema]].
