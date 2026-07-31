#!/usr/bin/env bash
# =============================================================================
# Story 2.3 — Task 4b: verificação fim-a-fim contra o Supabase real (keepit-dev)
# Autor: @data-engineer (Dara). Data: 2026-07-31.
#
# Verifica de forma EXECUTÁVEL (não por leitura de SQL):
#   AC5/Task 4 — `Confirm email` OFF (signUp devolve session imediatamente)
#   AC1/AC3    — trigger cria exatamente 1 linha em `clientes`, com o `nome`
#                enviado (pega divergência de chave de metadata, que o
#                COALESCE(...,'') esconderia) e telefone correto/NULL
#   AC2 (+)    — RLS positiva: usuário lê a própria linha
#   AC2 (-)    — RLS negativa: NÃO lê linha alheia; INSERT direto negado;
#                UPDATE em linha alheia afeta 0 linhas
#   AC1        — ON DELETE CASCADE: apagar o auth.users remove `clientes`
#
# PRÉ-REQUISITO: migration 20260731143000_criar_clientes.sql já aplicada.
# USO:  bash apps/supabase/scripts/verify-2.3.sh      (a partir da raiz do repo)
# Lê SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY de .env
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
set -a; . "$ROOT/.env"; set +a

FAILS=0
ok()   { echo "  PASS  $1"; }
bad()  { echo "  FAIL  $1"; FAILS=$((FAILS+1)); }
j()    { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);const v=eval('o'+process.argv[1]);console.log(v===undefined||v===null?'':v)}catch(e){console.log('')}})" "$1"; }

AUTH="$SUPABASE_URL/auth/v1"
REST="$SUPABASE_URL/rest/v1"
SR=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
STAMP=$(date +%s)
EMAIL_A="dara.test.a.$STAMP@keepit-test.invalid"
EMAIL_B="dara.test.b.$STAMP@keepit-test.invalid"
SENHA="Teste1234!"
NOME_A="Ana Teste Dara"
NOME_B="Bruno Teste Dara"
TEL_A="11987654321"

signup() { # $1 email  $2 nome  $3 telefone (pode ser vazio -> chave omitida)
  local data
  if [ -n "$3" ]; then data="{\"nome\":\"$2\",\"telefone\":\"$3\"}"; else data="{\"nome\":\"$2\"}"; fi
  curl -s -X POST "$AUTH/signup" -H "apikey: $SUPABASE_ANON_KEY" \
       -H "Content-Type: application/json" \
       -d "{\"email\":\"$1\",\"password\":\"$SENHA\",\"data\":$data}"
}

echo "== 0. Pré-checagem de ambiente"
SETTINGS=$(curl -s "$AUTH/settings" -H "apikey: $SUPABASE_ANON_KEY")
AUTOCONF=$(echo "$SETTINGS" | j ".mailer_autoconfirm")
[ "$AUTOCONF" = "true" ] && ok "mailer_autoconfirm=true → 'Confirm email' OFF (decisão 10.5)" \
                         || bad "mailer_autoconfirm=$AUTOCONF → 'Confirm email' ainda ON. Desligar no painel."

echo "== 1. signUp A (com telefone)"
RA=$(signup "$EMAIL_A" "$NOME_A" "$TEL_A")
UID_A=$(echo "$RA" | j ".user.id"); TOK_A=$(echo "$RA" | j ".access_token")
[ -n "$UID_A" ] && ok "user A criado ($UID_A)" || { bad "signUp A falhou: $RA"; exit 1; }
[ -n "$TOK_A" ] && ok "AC5 — session retornada imediatamente" || bad "AC5 — session null: 'Confirm email' está ON"

echo "== 2. signUp B (sem telefone)"
RB=$(signup "$EMAIL_B" "$NOME_B" "")
UID_B=$(echo "$RB" | j ".user.id"); TOK_B=$(echo "$RB" | j ".access_token")
[ -n "$UID_B" ] && ok "user B criado ($UID_B)" || bad "signUp B falhou: $RB"

echo "== 3. AC1/AC3 — linha criada pelo trigger (leitura via service_role)"
ROW_A=$(curl -s "${SR[@]}" "$REST/clientes?id=eq.$UID_A&select=id,nome,telefone,cpf,criado_em")
[ "$(echo "$ROW_A" | j ".length")" = "1" ] && ok "exatamente 1 linha para A" || bad "linhas para A: $ROW_A"
[ "$(echo "$ROW_A" | j "[0].nome")" = "$NOME_A" ] && ok "nome A == metadata 'nome' (contrato ok)" \
   || bad "nome A divergente: '$(echo "$ROW_A" | j "[0].nome")' (chave de metadata errada?)"
[ "$(echo "$ROW_A" | j "[0].telefone")" = "$TEL_A" ] && ok "telefone A gravado" || bad "telefone A: $ROW_A"
[ -z "$(echo "$ROW_A" | j "[0].cpf")" ] && ok "cpf A NULL" || bad "cpf A deveria ser NULL"
[ -n "$(echo "$ROW_A" | j "[0].criado_em")" ] && ok "criado_em preenchido" || bad "criado_em vazio"

ROW_B=$(curl -s "${SR[@]}" "$REST/clientes?id=eq.$UID_B&select=id,nome,telefone")
[ "$(echo "$ROW_B" | j "[0].nome")" = "$NOME_B" ] && ok "nome B ok" || bad "nome B: $ROW_B"
[ -z "$(echo "$ROW_B" | j "[0].telefone")" ] && ok "telefone B NULL (metadata ausente → NULL)" || bad "telefone B: $ROW_B"

echo "== 4. AC2 positiva — A lê a própria linha"
UA=(-H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOK_A")
SEL=$(curl -s "${UA[@]}" "$REST/clientes?select=id")
[ "$(echo "$SEL" | j ".length")" = "1" ] && [ "$(echo "$SEL" | j "[0].id")" = "$UID_A" ] \
  && ok "SELECT * retorna só a própria linha" || bad "SELECT com JWT de A retornou: $SEL"

echo "== 5. AC2 negativa"
SEL_B=$(curl -s "${UA[@]}" "$REST/clientes?id=eq.$UID_B&select=id")
[ "$(echo "$SEL_B" | j ".length")" = "0" ] && ok "A não lê a linha de B (0 linhas)" || bad "vazamento: $SEL_B"

INS=$(curl -s -o /tmp/dara_ins -w "%{http_code}" -X POST "${UA[@]}" -H "Content-Type: application/json" \
      "$REST/clientes" -d "{\"id\":\"$UID_A\",\"nome\":\"hack\"}")
[ "$INS" != "201" ] && ok "INSERT direto negado (HTTP $INS — policy sem_insert_direto_clientes)" \
                    || bad "INSERT direto FOI ACEITO — policy de INSERT quebrada"

UPD=$(curl -s -X PATCH "${UA[@]}" -H "Content-Type: application/json" -H "Prefer: return=representation" \
      "$REST/clientes?id=eq.$UID_B" -d '{"nome":"hack"}')
[ "$(echo "$UPD" | j ".length")" = "0" ] && ok "UPDATE em linha alheia afetou 0 linhas" || bad "UPDATE alheio: $UPD"
NOME_B_POS=$(curl -s "${SR[@]}" "$REST/clientes?id=eq.$UID_B&select=nome" | j "[0].nome")
[ "$NOME_B_POS" = "$NOME_B" ] && ok "linha de B intacta após tentativa" || bad "linha de B alterada: $NOME_B_POS"

echo "== 6. AC1 — ON DELETE CASCADE (limpeza dos users de teste)"
for U in "$UID_A" "$UID_B"; do
  [ -n "$U" ] && curl -s -o /dev/null -X DELETE "${SR[@]}" "$AUTH/admin/users/$U"
done
LEFT=$(curl -s "${SR[@]}" "$REST/clientes?id=in.($UID_A,$UID_B)&select=id")
[ "$(echo "$LEFT" | j ".length")" = "0" ] && ok "CASCADE removeu as linhas de clientes" || bad "sobrou em clientes: $LEFT"

echo
[ "$FAILS" -eq 0 ] && { echo "RESULTADO: TODOS OS CHECKS PASSARAM"; exit 0; } \
                   || { echo "RESULTADO: $FAILS CHECK(S) FALHARAM"; exit 1; }
