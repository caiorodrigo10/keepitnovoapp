"""Exercita quatro corridas em duas sessões PostgreSQL reais do Supabase local.

Uso: python3 supabase/tests/database/cancelamento_pin_concurrency.py
Não usa Cloud nem altera o schema; as linhas de teste são removidas ao final.
"""

import json
import os
import subprocess
import time

CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER', 'supabase_db_jhhbewnmnorhmsdvfppo')
BASE = '89999998-0000-4000-8000-000000000'
CLIENT = BASE + '001'
MERCHANT = BASE + '002'
ADMIN = BASE + '003'
HUB = BASE + '010'
STORE = BASE + '020'


def db(sql: str, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    command = ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if check and result.returncode:
        raise AssertionError(f'SQL falhou: {result.stdout}\n{result.stderr}')
    return result


def session(user: str, order: str, action: str, hold: bool) -> str:
    lock = f"SET LOCAL application_name='task8_hold'; SELECT id FROM public.pedidos WHERE id='{order}' FOR UPDATE;" if hold else ''
    sleep = 'SELECT pg_sleep(1.5);' if hold else ''
    return f"BEGIN; {lock} SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{user}',true); {sleep} {action}; COMMIT;"


def race(label: str, first_sql: str, second_sql: str, second_error: str | None) -> None:
    command = ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', first_sql]
    first = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        waiting = db("SELECT count(*) FROM pg_stat_activity WHERE application_name='task8_hold' AND wait_event='PgSleep'").stdout.strip()
        if waiting == '1':
            break
        time.sleep(0.05)
    else:
        first_stdout, first_stderr = first.communicate(timeout=10)
        raise AssertionError(f'{label}: primeiro ator não adquiriu o lock: {first_stdout}\n{first_stderr}')
    started = time.monotonic()
    second = db(second_sql, check=False)
    elapsed = time.monotonic() - started
    first_stdout, first_stderr = first.communicate(timeout=10)
    assert first.returncode == 0, f'{label}: primeiro ator falhou: {first_stdout}\n{first_stderr}'
    assert elapsed >= 0.9, f'{label}: segundo ator não esperou o lock do pedido ({elapsed:.2f}s): PRIMEIRO {first_stdout}\n{first_stderr}\nSEGUNDO {second.stdout}\n{second.stderr}'
    if second_error:
        assert second.returncode != 0 and second_error in second.stderr, f'{label}: desfecho inesperado: {second.stdout}\n{second.stderr}'
    else:
        assert second.returncode == 0, f'{label}: segundo ator deveria abrir caso: {second.stdout}\n{second.stderr}'
    print(f'{label}: serializado ({elapsed:.2f}s), segundo ator: {second_error or "caso aberto"}')


def cleanup() -> None:
    db(f"""
      BEGIN;
      ALTER TABLE public.decisoes_solicitacao DISABLE TRIGGER decisoes_solicitacao_imutaveis;
      DELETE FROM public.decisoes_solicitacao WHERE solicitacao_id IN (SELECT id FROM public.solicitacoes_pedido WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE estabelecimento_id='{STORE}'));
      DELETE FROM private.operacoes_abertura_solicitacao WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE estabelecimento_id='{STORE}');
      DELETE FROM public.eventos_reembolso WHERE lancamento_id IN (SELECT id FROM public.lancamentos_financeiros WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE estabelecimento_id='{STORE}'));
      DELETE FROM public.despesas_reembolso WHERE lancamento_id IN (SELECT id FROM public.lancamentos_financeiros WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE estabelecimento_id='{STORE}'));
      DELETE FROM public.lancamentos_financeiros WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE estabelecimento_id='{STORE}');
      DELETE FROM public.solicitacoes_pedido WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE estabelecimento_id='{STORE}');
      DELETE FROM private.pedido_segredos WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE estabelecimento_id='{STORE}');
      DELETE FROM public.pedidos WHERE estabelecimento_id='{STORE}';
      DELETE FROM public.estabelecimentos WHERE id='{STORE}';
      DELETE FROM public.hubs WHERE id='{HUB}';
      DELETE FROM public.admin_users WHERE id='{ADMIN}';
      DELETE FROM auth.users WHERE id IN ('{CLIENT}','{MERCHANT}','{ADMIN}');
      ALTER TABLE public.decisoes_solicitacao ENABLE TRIGGER decisoes_solicitacao_imutaveis;
      COMMIT;
    """)


def setup() -> None:
    orders = ','.join(
        f"('{BASE}{n}','{CLIENT}','{STORE}','{HUB}','{status}',10,5,1,2.9,17.9,'pix',now())"
        for n, status in [(101, 'aguardando_aceite'), (102, 'aguardando_aceite'), (103, 'no_hub'), (104, 'no_hub')]
    )
    db(f"""
      INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
      ('{CLIENT}','authenticated','authenticated','task8-client@example.invalid','{{}}','{{}}'),
      ('{MERCHANT}','authenticated','authenticated','task8-merchant@example.invalid','{{}}','{{}}'),
      ('{ADMIN}','authenticated','authenticated','task8-admin@example.invalid','{{}}','{{}}');
      INSERT INTO public.admin_users(id,nome) VALUES ('{ADMIN}','Task 8 Admin');
      INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES ('{HUB}','Task 8 Hub','Rua',0,0);
      INSERT INTO public.estabelecimentos(id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status)
      VALUES ('{STORE}','{MERCHANT}','Task 8 Loja','89999998000100','Lojista','11999999999','farmacia','Rua',10,5,'task8@example.invalid','email','ativo');
      INSERT INTO public.pedidos(id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em) VALUES {orders};
      INSERT INTO private.pedido_segredos(pedido_id,pin_hash,pin_texto) VALUES
        ('{BASE}103',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234'),
        ('{BASE}104',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234');
    """)
    for number in (103, 104):
        order = BASE + str(number)
        operation = BASE + str(number + 300)
        db(session(CLIENT, order, f"SELECT public.abrir_solicitacao_pedido('{order}','cancelamento','Não posso retirar','{operation}')", False))


def outcome(order: str) -> dict:
    result = db(f"""SELECT json_build_object(
      'status',(SELECT status FROM public.pedidos WHERE id='{order}'),
      'case',(SELECT estado FROM public.solicitacoes_pedido WHERE pedido_id='{order}' AND tipo='cancelamento' ORDER BY criado_em DESC LIMIT 1),
      'refund',(SELECT count(*) FROM public.lancamentos_financeiros WHERE pedido_id='{order}' AND tipo='refund'),
      'credit',(SELECT count(*) FROM public.lancamentos_financeiros WHERE pedido_id='{order}' AND tipo='merchant_credit')
    )""")
    return json.loads(result.stdout.strip())


def main() -> None:
    try:
        setup()
        cancel = lambda order, op: f"SELECT public.abrir_solicitacao_pedido('{order}','cancelamento','Desisti','{op}')"
        accept = lambda order: f"SELECT public.aceitar_pedido('{order}',20)"
        decide = lambda order, op: f"SELECT public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE pedido_id='{order}' AND estado='aberta'),true,'Devolver integralmente',NULL,NULL,'{op}')"
        pin = lambda order: f"SELECT public.confirmar_pin_pedido('{order}','1234')"

        order = BASE + '101'
        race('cancelamento antes do aceite', session(CLIENT, order, cancel(order, BASE + '201'), True), session(MERCHANT, order, accept(order), False), 'ESTADO_INVALIDO')
        assert outcome(order) == {'status': 'cancelado', 'case': 'aprovada', 'refund': 1, 'credit': 0}

        order = BASE + '102'
        race('aceite antes do cancelamento', session(MERCHANT, order, accept(order), True), session(CLIENT, order, cancel(order, BASE + '202'), False), None)
        assert outcome(order) == {'status': 'aceito', 'case': 'aberta', 'refund': 0, 'credit': 0}

        order = BASE + '103'
        race('PIN antes da decisão', session(MERCHANT, order, pin(order), True), session(ADMIN, order, decide(order, BASE + '203'), False), 'ESTADO_INVALIDO')
        assert outcome(order) == {'status': 'entregue', 'case': 'encerrada_por_pin', 'refund': 0, 'credit': 1}

        order = BASE + '104'
        race('decisão antes do PIN', session(ADMIN, order, decide(order, BASE + '204'), True), session(MERCHANT, order, pin(order), False), 'ESTADO_INVALIDO')
        assert outcome(order) == {'status': 'cancelado_admin', 'case': 'aprovada', 'refund': 1, 'credit': 0}
    finally:
        cleanup()


if __name__ == '__main__':
    main()
