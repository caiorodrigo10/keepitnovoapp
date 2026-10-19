#!/usr/bin/env python3
"""Real-card-purge race, restricted to an explicitly disposable local DB."""
import os
import subprocess
import time

CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER')
DATABASE = os.environ.get('SUPABASE_DB_NAME')
if os.environ.get('KEEPIT_DISPOSABLE_DB') != '1' or not CONTAINER or not DATABASE:
    raise SystemExit('Informe KEEPIT_DISPOSABLE_DB=1, SUPABASE_DB_CONTAINER e SUPABASE_DB_NAME.')
if 'keepit-dev' in CONTAINER or 'jhhbewnmnorhmsdvfppo' in CONTAINER:
    raise SystemExit('Destino keepit-dev proibido.')

USER = '13131313-3333-4333-8333-333333333333'
REQUEST = '13131313-3333-4333-8333-333333333444'
OPERATION = '13131313-3333-4333-8333-333333333555'
COMMAND = ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DATABASE, '-c']

def psql(sql: str) -> str:
    result = subprocess.run(COMMAND + [sql], text=True, capture_output=True)
    if result.returncode:
        raise AssertionError('Comando PostgreSQL falhou; saída sensível omitida.')
    return result.stdout.strip()

def main() -> None:
    try:
        psql(f"""
          INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
            ('{USER}','authenticated','authenticated','purge-race@example.invalid','{{}}');
          INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id,estado)
            VALUES('{USER}','sandbox','cus_purge_race','pronto');
          INSERT INTO public.clientes_cartoes(cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4)
            VALUES('{USER}','sandbox','cus_purge_race','token_purge_race','VISA','3333');
          INSERT INTO public.account_deletion_requests(id,user_id,status,requested_at,delete_at,processing_at)
            VALUES('{REQUEST}','{USER}','processing',now()-interval '8 days',now()-interval '1 day',now());
          INSERT INTO private.politicas_retencao_cartoes(escopo,aprovada_em,aprovado_por,evidencia)
            VALUES('cartoes_salvos',now(),'responsavel-sintetico','matriz-sintetica') ON CONFLICT (escopo) DO NOTHING;
        """)
        first = subprocess.Popen(COMMAND + [
            "BEGIN; SET LOCAL application_name='task13_purge_hold'; SET LOCAL ROLE service_role; "
            f"SELECT id FROM public.clientes WHERE id='{USER}' FOR UPDATE; SELECT pg_sleep(1.5); "
            f"SELECT public.purgar_cartoes_conta('{USER}','{REQUEST}'); COMMIT;"
        ], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='task13_purge_hold' AND wait_event='PgSleep'") == '1':
                    break
                time.sleep(0.05)
            else:
                raise AssertionError('Purga não adquiriu o lock do cliente.')
            started = time.monotonic()
            late = subprocess.run(COMMAND + ["BEGIN; SET LOCAL ROLE service_role; " +
                 f"SELECT public.registrar_operacao_cartao_service('{USER}',NULL,'{OPERATION}','perfil','sandbox',true,NULL); COMMIT;"],
                 text=True, capture_output=True)
            waited = time.monotonic() - started
            first.communicate(timeout=10)
            assert first.returncode == 0, 'Purga concorrente falhou; saída omitida.'
            assert late.returncode != 0, 'Tokenização tardia deveria falhar por CONTA_EM_EXCLUSAO.'
        finally:
            if first.poll() is None:
                first.terminate(); first.communicate(timeout=10)
        assert psql(f"SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='{USER}'") == '0'
        print('PASS: purge serializa por cliente e bloqueia tokenização tardia.')
    finally:
        psql(f"DELETE FROM public.account_deletion_requests WHERE id='{REQUEST}'; "
             f"DELETE FROM auth.users WHERE id='{USER}'")

if __name__ == '__main__':
    main()
