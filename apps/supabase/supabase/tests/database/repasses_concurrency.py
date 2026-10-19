"""Concorrência em duas conexões PostgreSQL reais ao Supabase local.

Uso: python3 supabase/tests/database/repasses_concurrency.py
"""

import os
import subprocess
import time

CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER', 'supabase_db_jhhbewnmnorhmsdvfppo')
BASE = '79999998-0000-4000-8000-000000000'
CLIENT, MERCHANT, ADMIN, HUB, STORE, ORDER = (BASE + suffix for suffix in ('001', '002', '003', '010', '020', '101'))
PREP_OP, CONF_OP, PREP_OP_2 = BASE + '201', BASE + '202', BASE + '203'


def run(sql: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                             '-U', 'postgres', '-d', 'postgres', '-c', sql], capture_output=True, text=True)
    if check and result.returncode:
        raise AssertionError(f'{result.stdout}\n{result.stderr}')
    return result


def admin(sql: str) -> str:
    return f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); {sql}; COMMIT;"


def race(label: str, first_sql: str, second_sql: str) -> None:
    first = subprocess.Popen(['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                              '-U', 'postgres', '-d', 'postgres', '-c', first_sql],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if run("SELECT count(*) FROM pg_stat_activity WHERE application_name='task10_hold' AND wait_event='PgSleep'").stdout.strip() == '1':
            break
        time.sleep(0.05)
    else:
        out, err = first.communicate(timeout=10)
        raise AssertionError(f'{label}: primeira sessão não entrou na espera: {out}\n{err}')
    start = time.monotonic()
    second = run(second_sql, check=False)
    elapsed = time.monotonic() - start
    out, err = first.communicate(timeout=10)
    assert first.returncode == 0, f'{label}: primeira sessão falhou: {out}\n{err}'
    assert second.returncode == 0, f'{label}: segunda sessão falhou: {second.stdout}\n{second.stderr}'
    assert elapsed >= 0.9, f'{label}: segunda sessão não esperou o lock ({elapsed:.2f}s)'
    print(f'{label}: serializado em {elapsed:.2f}s')


def setup() -> None:
    run(f"""
      INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
      ('{CLIENT}','authenticated','authenticated','task10-client@example.invalid','{{}}','{{}}'),
      ('{MERCHANT}','authenticated','authenticated','task10-merchant@example.invalid','{{}}','{{}}'),
      ('{ADMIN}','authenticated','authenticated','task10-admin@example.invalid','{{}}','{{}}');
      INSERT INTO public.admin_users(id,nome) VALUES('{ADMIN}','Task 10 Admin');
      INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES('{HUB}','Hub Task 10','Rua',0,0);
      INSERT INTO public.estabelecimentos(id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status)
      VALUES('{STORE}','{MERCHANT}','Loja Task 10','79999998000100','Titular','11999999999','farmacia','Rua',10,5,'task10@example.invalid','email','ativo');
      INSERT INTO public.pedidos(id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em)
      VALUES('{ORDER}','{CLIENT}','{STORE}','{HUB}','no_hub',100,5,10,2.9,107.9,'pix',now());
      INSERT INTO private.pedido_segredos(pedido_id,pin_hash,pin_texto)
      VALUES('{ORDER}',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234');
    """)
    run(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{MERCHANT}',true); SELECT public.confirmar_pin_pedido('{ORDER}','1234'); COMMIT;")


def cleanup() -> None:
    run(f"""
      BEGIN;
      ALTER TABLE public.repasse_eventos DISABLE TRIGGER repasse_evento_imutavel;
      DELETE FROM public.repasse_eventos WHERE repasse_id IN (SELECT id FROM public.repasses WHERE estabelecimento_id='{STORE}');
      DELETE FROM private.operacoes_preparacao_itens WHERE repasse_id IN (SELECT id FROM public.repasses WHERE estabelecimento_id='{STORE}');
      DELETE FROM private.operacoes_preparacao_repasse WHERE operacao_id IN ('{PREP_OP}','{PREP_OP_2}');
      DELETE FROM public.repasse_itens WHERE repasse_id IN (SELECT id FROM public.repasses WHERE estabelecimento_id='{STORE}');
      DELETE FROM public.lancamentos_financeiros WHERE estabelecimento_id='{STORE}';
      DELETE FROM private.repasse_comprovantes WHERE repasse_id IN (SELECT id FROM public.repasses WHERE estabelecimento_id='{STORE}');
      DELETE FROM public.repasses WHERE estabelecimento_id='{STORE}';
      DELETE FROM private.pedido_segredos WHERE pedido_id='{ORDER}';
      DELETE FROM public.pedidos WHERE id='{ORDER}';
      DELETE FROM public.estabelecimentos WHERE id='{STORE}';
      DELETE FROM public.hubs WHERE id='{HUB}';
      DELETE FROM public.admin_users WHERE id='{ADMIN}';
      DELETE FROM auth.users WHERE id IN ('{CLIENT}','{MERCHANT}','{ADMIN}');
      ALTER TABLE public.repasse_eventos ENABLE TRIGGER repasse_evento_imutavel;
      COMMIT;
    """)


def main() -> None:
    try:
        setup()
        week = run(f"SELECT semana_inicio FROM public.lancamentos_financeiros WHERE pedido_id='{ORDER}' AND tipo='merchant_credit'").stdout.strip()
        prep = f"SELECT count(*) FROM public.preparar_repasses_semanais('{week}','{PREP_OP}')"
        first = f"BEGIN; SET LOCAL application_name='task10_hold'; SELECT id FROM public.estabelecimentos WHERE id='{STORE}' FOR UPDATE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); SELECT pg_sleep(1.5); {prep}; COMMIT;"
        race('preparação simultânea', first, admin(prep.replace(PREP_OP, PREP_OP_2)))
        first = f"BEGIN; SET LOCAL application_name='task10_hold'; SELECT pg_advisory_xact_lock(hashtextextended('preparar-repasse:{PREP_OP}',0)); SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); SELECT pg_sleep(1.5); {prep}; COMMIT;"
        race('retry simultâneo da mesma operação', first, admin(prep))
        assert run(f"SELECT count(*) FROM public.repasses WHERE estabelecimento_id='{STORE}' AND estado='pendente'").stdout.strip() == '1'
        assert run(f"SELECT count(*) FROM public.repasse_itens WHERE liberado_em IS NULL AND valor_centavos>0").stdout.strip() == '1'
        batch = run(f"SELECT id FROM public.repasses WHERE estabelecimento_id='{STORE}' AND estado='pendente'").stdout.strip()
        confirm = f"SELECT (public.confirmar_repasse('{batch}','pix-task10-001','banco:comprovante-task10','{CONF_OP}')).estado"
        first = f"BEGIN; SET LOCAL application_name='task10_hold'; SELECT id FROM public.repasses WHERE id='{batch}' FOR UPDATE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); SELECT pg_sleep(1.5); {confirm}; COMMIT;"
        race('confirmação simultânea', first, admin(confirm))
        assert run(f"SELECT count(*) FROM public.lancamentos_financeiros WHERE repasse_id='{batch}' AND tipo='payout'").stdout.strip() == '1'
        print('um lote, uma alocação e uma baixa payout após as duas corridas')
    finally:
        cleanup()


if __name__ == '__main__':
    main()
