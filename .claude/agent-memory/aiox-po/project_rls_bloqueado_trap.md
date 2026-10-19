---
name: rls-bloqueado-trap
description: A policy cliente_atualiza_proprio criada na Story 2.3 é incompleta de propósito; quem adicionar a coluna `bloqueado` (Épico 3/9) precisa recriá-la na mesma migration
metadata:
  type: project
---

A migration da Story 2.3 cria `clientes` sem a coluna `bloqueado`, então a policy
`cliente_atualiza_proprio` foi criada **sem** a cláusula
`AND bloqueado = (SELECT bloqueado FROM clientes WHERE id = auth.uid())` que
`docs/architecture/05-security.md` §3.1 especifica.

**Why:** aplicar a policy literal quebraria a migration (coluna inexistente). Sem a
coluna, a omissão é inofensiva — não há nada para o cliente auto-alterar. O perigo é
**latente**: no dia em que uma migration do Épico 3/9 adicionar `bloqueado`, a policy
já existente no banco passa a permitir `UPDATE clientes SET bloqueado = false WHERE
id = auth.uid()` — cliente bloqueado se auto-desbloqueia, numa story que não tocou
em RLS e portanto não teve isso revisado.

**How to apply:** ao validar qualquer story que adicione a coluna `bloqueado` a
`clientes`, exigir que a MESMA migration faça `DROP POLICY cliente_atualiza_proprio`
e recrie com a cláusula completa. Tratar como bloqueio de segurança, não débito
cosmético. Contraste útil: a omissão de `OR is_admin()` na mesma migration é o caso
oposto — falha fechada, restringe acesso, não precisa de guarda.

Relacionado: [[epic2-ac-traceability]]
