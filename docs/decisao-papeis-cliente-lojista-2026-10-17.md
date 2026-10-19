# Decisão: acesso de Cliente no app Lojista

**Decisão:** manter o comportamento atual: uma conta autenticada sem
estabelecimento pode iniciar ou retomar o cadastro no app Lojista. Não há
bloqueio baseado na existência do perfil de Cliente.

**Fonte:** [`docs/architecture/05-security.md:16-24`](./architecture/05-security.md)
define os três papéis pela presença nas tabelas de domínio e declara que um
usuário pode ser Cliente e ter estabelecimento; os papéis não são mutuamente
exclusivos. O mesmo documento registra que, no MVP, os apps são separados,
mas o modelo não proíbe essa combinação.

**Consequência:** `Login.tsx` continua roteando uma sessão sem estabelecimento
para o wizard, preservando também o caso legítimo do lojista que ainda não
concluiu o cadastro. Nenhuma regra nova de Auth, RLS ou dado é introduzida.
