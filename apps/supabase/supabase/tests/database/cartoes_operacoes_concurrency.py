"""Checks real replay concurrency only against an explicitly disposable local DB."""

import os
import subprocess
import time


CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER')
DATABASE = os.environ.get('SUPABASE_DB_NAME')
if os.environ.get('KEEPIT_DISPOSABLE_DB') != '1' or not CONTAINER or not DATABASE:
    raise SystemExit('Informe KEEPIT_DISPOSABLE_DB=1, SUPABASE_DB_CONTAINER e SUPABASE_DB_NAME.')
if 'keepit-dev' in CONTAINER or 'jhhbewnmnorhmsdvfppo' in CONTAINER:
    raise SystemExit('Destino keepit-dev proibido.')

CLIENT = '97777777-0000-4000-8000-000000000901'
OPERATION = '97777777-0000-4000-8000-000000000902'
C3 = '97777777-0000-4000-8000-000000000903'
C4 = '97777777-0000-4000-8000-000000000904'
C5 = '97777777-0000-4000-8000-000000000905'
C6 = '97777777-0000-4000-8000-000000000906'
INVALIDATE_1 = '97777777-0000-4000-8000-000000000907'
INVALIDATE_2 = '97777777-0000-4000-8000-000000000908'
SET_PRIMARY = '97777777-0000-4000-8000-000000000909'
REMOVE = '97777777-0000-4000-8000-000000000910'
COMMAND = ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DATABASE, '-c']


def psql(sql: str) -> str:
    result = subprocess.run(COMMAND + [sql], text=True, capture_output=True)
    if result.returncode:
        raise AssertionError('Comando PostgreSQL falhou; saída sensível omitida.')
    return result.stdout.strip()


def register() -> str:
    return ("SELECT public.registrar_operacao_cartao_service(" f"'{CLIENT}',NULL,'{OPERATION}',"
            "'perfil','sandbox',true,NULL)")


def register_saved(operation: str, card: str) -> str:
    return ("SELECT public.registrar_operacao_cartao_service("
            f"'{CLIENT}',NULL,'{operation}','perfil','sandbox',false,'{card}')")


def save(card: str, token: str) -> str:
    return ("INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,"
            "asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4) VALUES("
            f"'{card}','{CLIENT}','sandbox','synthetic_card_operation_race','{token}',"
            "'VISA','1234')")


def client(statement: str) -> str:
    return ("SET LOCAL ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{CLIENT}',true); {statement}")


def race_invalidation(label: str, card: str, operation: str, second_statement: str) -> None:
    first = subprocess.Popen(COMMAND + [
        "BEGIN; SET LOCAL application_name='task6_card_invalidation_hold'; "
        "SET LOCAL ROLE service_role; "
        f"SELECT public.invalidar_cartao_operacao_service('{CLIENT}','{card}','{operation}'); "
        "SELECT pg_sleep(1.5); COMMIT;"
    ], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if psql("SELECT count(*) FROM pg_stat_activity WHERE "
                    "application_name='task6_card_invalidation_hold' AND wait_event='PgSleep'") == '1':
                break
            time.sleep(0.05)
        else:
            raise AssertionError(f'{label}: invalidação não adquiriu o lock do cliente.')
        started = time.monotonic()
        psql('BEGIN; ' + second_statement + '; COMMIT;')
        waited = time.monotonic() - started
        first.communicate(timeout=10)
        assert first.returncode == 0, f'{label}: invalidação falhou; saída omitida.'
        assert waited >= 0.9, f'{label}: operação concorrente não aguardou o lock ({waited:.2f}s).'
    finally:
        if first.poll() is None:
            first.terminate()
            first.communicate(timeout=10)


def main() -> None:
    try:
        psql(f"INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES('{CLIENT}','authenticated','authenticated','card-op-race@example.invalid','{{}}')")
        first = subprocess.Popen(COMMAND + [
            "BEGIN; SET LOCAL application_name='task3_card_operation_hold'; "
            + register() + "; SELECT pg_sleep(1.5); COMMIT;"
        ], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='task3_card_operation_hold' AND wait_event='PgSleep'") == '1':
                    break
                time.sleep(0.05)
            else:
                raise AssertionError('Primeira sessão não confirmou o lock da operação.')
            started = time.monotonic()
            psql('BEGIN; ' + register() + '; COMMIT;')
            waited = time.monotonic() - started
            first.communicate(timeout=10)
            assert first.returncode == 0, 'Primeira sessão falhou; saída sensível omitida.'
            assert waited >= 0.9, f'Replay concorrente não aguardou o lock ({waited:.2f}s).'
            assert psql(f"SELECT count(*) FROM private.cartoes_operacoes WHERE cliente_id='{CLIENT}' AND operacao_id='{OPERATION}'") == '1'
            print('PASS: dois replays simultâneos retornam uma única operação imutável.')
        finally:
            if first.poll() is None:
                first.terminate()
                first.communicate(timeout=10)

        psql(f"""
          INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id,estado)
          VALUES('{CLIENT}','sandbox','synthetic_card_operation_race','pronto');
          {save(C3, 'synthetic_card_operation_race_3')};
          {save(C4, 'synthetic_card_operation_race_4')};
          {save(C5, 'synthetic_card_operation_race_5')};
          {save(C6, 'synthetic_card_operation_race_6')};
          {register_saved(INVALIDATE_1, C3)};
        """)
        race_invalidation(
            'invalidação contra definir principal', C3, INVALIDATE_1,
            client(f"SELECT public.definir_cartao_principal('{C5}','{SET_PRIMARY}')"),
        )
        assert psql(
            f"SELECT id FROM public.clientes_cartoes WHERE cliente_id='{CLIENT}' AND principal"
        ) == C5

        psql(register_saved(INVALIDATE_2, C5))
        race_invalidation(
            'invalidação contra remoção', C5, INVALIDATE_2,
            client(f"SELECT public.remover_cartao_cliente('{C4}','{REMOVE}')"),
        )
        assert psql(
            f"SELECT id FROM public.clientes_cartoes WHERE cliente_id='{CLIENT}' AND principal"
        ) == C6
        assert psql(
            f"SELECT count(*)||':'||count(*) FILTER (WHERE principal) "
            f"FROM public.clientes_cartoes WHERE cliente_id='{CLIENT}'"
        ) == '1:1'
        print('PASS: invalidação/principal e invalidação/remoção serializadas; um principal.')
    finally:
        psql(f"DELETE FROM auth.users WHERE id='{CLIENT}'")


if __name__ == '__main__':
    main()
