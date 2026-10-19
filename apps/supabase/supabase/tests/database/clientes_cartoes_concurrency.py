"""Real PostgreSQL sessions, restricted to an explicitly disposable local DB.

KEEPIT_DISPOSABLE_DB=1 SUPABASE_DB_CONTAINER=<container> SUPABASE_DB_NAME=<db> \
  python3 supabase/tests/database/clientes_cartoes_concurrency.py
"""

import os
import subprocess
import time


CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER')
DATABASE = os.environ.get('SUPABASE_DB_NAME')
if os.environ.get('KEEPIT_DISPOSABLE_DB') != '1' or not CONTAINER or not DATABASE:
    raise SystemExit('Informe KEEPIT_DISPOSABLE_DB=1, SUPABASE_DB_CONTAINER e '
                     'SUPABASE_DB_NAME de um banco local descartável.')
if 'keepit-dev' in CONTAINER or 'jhhbewnmnorhmsdvfppo' in CONTAINER:
    raise SystemExit('Destino keepit-dev proibido.')

P = '88888888-0000-4000-8000-000000000'
CLIENT, C1, C2, C3 = P + '001', P + '101', P + '102', P + '103'
OP1, OP2, REMOVE = P + '301', P + '302', P + '401'
COMMAND = ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v',
           'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DATABASE, '-c']


def psql(sql: str) -> str:
    result = subprocess.run(COMMAND + [sql], text=True, capture_output=True)
    if result.returncode:
        # Do not print SQL, row values or PostgreSQL DETAIL: they can contain tokens.
        raise AssertionError('Comando PostgreSQL falhou; saída sensível omitida.')
    return result.stdout.strip()


def client(sql: str) -> str:
    return ("SET LOCAL ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{CLIENT}',true); {sql};")


def save(card: str, token: str) -> str:
    return ("INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,"
            "asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4) VALUES("
            f"'{card}','{CLIENT}','sandbox','synthetic_race_customer','{token}',"
            "'VISA','1234') ON CONFLICT DO NOTHING")


def race(first_statement: str, second_statement: str) -> None:
    first_sql = (
        "BEGIN; SET LOCAL application_name='task2_cards_hold'; "
        f"SELECT id FROM public.clientes WHERE id='{CLIENT}' FOR UPDATE; "
        f"SELECT pg_sleep(1.5); {first_statement}; COMMIT;"
    )
    first = subprocess.Popen(COMMAND + [first_sql], text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if psql("SELECT count(*) FROM pg_stat_activity WHERE "
                    "application_name='task2_cards_hold' AND wait_event='PgSleep'") == '1':
                break
            time.sleep(0.05)
        else:
            raise AssertionError('Primeira sessão não confirmou aquisição do lock.')
        started = time.monotonic()
        psql('BEGIN; ' + second_statement + '; COMMIT;')
        waited = time.monotonic() - started
        first.communicate(timeout=10)
        assert first.returncode == 0, 'Primeira sessão falhou; saída omitida.'
        assert waited >= 0.9, f'Segunda sessão não aguardou o lock ({waited:.2f}s).'
    finally:
        if first.poll() is None:
            first.terminate()
            first.communicate(timeout=10)


def main() -> None:
    try:
        psql(f"""
          INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data)
          VALUES('{CLIENT}','authenticated','authenticated','card-race@example.invalid','{{}}');
          INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id)
          VALUES('{CLIENT}','sandbox','synthetic_race_customer');
          {save(C1, 'synthetic_race_1')};
          {save(C2, 'synthetic_race_2')};
        """)
        race(client(f"SELECT public.definir_cartao_principal('{C1}','{OP1}')"),
             client(f"SELECT public.definir_cartao_principal('{C2}','{OP2}')"))
        assert psql(f"SELECT id FROM public.clientes_cartoes WHERE cliente_id='{CLIENT}' AND principal") == C2
        # Leave only the selected card, then remove it while a server save waits.
        psql(f"DELETE FROM public.clientes_cartoes WHERE id='{C1}'")
        race(client(f"SELECT public.remover_cartao_cliente('{C2}','{REMOVE}')"),
             'SET LOCAL ROLE service_role; ' + save(C3, 'synthetic_race_3'))
        assert psql(f"SELECT count(*)||':'||count(*) FILTER (WHERE principal) FROM public.clientes_cartoes WHERE cliente_id='{CLIENT}'") == '1:1'
        assert psql(f"SELECT id FROM public.clientes_cartoes WHERE cliente_id='{CLIENT}'") == C3
        # Two independent service saves with the same token must not create duplicates.
        race('SET LOCAL ROLE service_role; ' + save(P + '104', 'synthetic_race_3'),
             'SET LOCAL ROLE service_role; ' + save(P + '105', 'synthetic_race_3'))
        assert psql(f"SELECT count(*)||':'||count(*) FILTER (WHERE principal) FROM public.clientes_cartoes WHERE cliente_id='{CLIENT}'") == '1:1'
        assert psql(f"SELECT count(*) FROM private.cartoes_gestao_operacoes WHERE cliente_id='{CLIENT}'") == '3'
        print('PASS: principal/principal, remoção/salvamento e token duplicado serializados; um principal.')
    finally:
        # Cascades remove customer, cards and token-free operations in this fixture only.
        psql(f"DELETE FROM auth.users WHERE id='{CLIENT}'")


if __name__ == '__main__':
    main()
